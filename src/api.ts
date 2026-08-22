import { DEFAULT_MAXLAG_SECONDS } from "./defaults.js";

export const DEFAULT_COMMONS_API = "https://commons.wikimedia.org/w/api.php";

/** The API endpoint for a Wikipedia language edition. */
export function wikipediaApiUrl(lang: string): string {
  return `https://${lang}.wikipedia.org/w/api.php`;
}

export interface ApiContext {
  userAgent: string;
  fetch: typeof globalThis.fetch;
  wikipediaApi: string;
  commonsApi: string;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
}

/**
 * Combines a caller signal with a per-request timeout.
 *
 * `AbortSignal.any` would do this in one line but landed in Node 20.3, and
 * this package supports Node >=20 — so it is done by hand rather than
 * shipping a floor that only some Node 20 patch releases satisfy.
 */
function requestSignal(
  ctx: ApiContext
): { signal: AbortSignal | undefined; done: () => void } {
  const hasTimeout = ctx.timeoutMs > 0;
  if (!hasTimeout) return { signal: ctx.signal, done: () => {} };

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Wikimedia API request timed out after ${ctx.timeoutMs}ms`)),
    ctx.timeoutMs
  );

  const onCallerAbort = () => controller.abort(ctx.signal?.reason);
  if (ctx.signal) {
    if (ctx.signal.aborted) controller.abort(ctx.signal.reason);
    else ctx.signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      ctx.signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

/**
 * A backoff that the caller can still cancel. A plain `setTimeout` promise
 * would keep an aborted request sleeping for the full Retry-After window
 * before noticing nobody wants the answer any more.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * An error that must not be retried: a permanent HTTP failure (404, 400,
 * a malformed request) as opposed to backpressure (429/503/maxlag).
 * Retrying these burns Wikimedia's capacity and the caller's time for an
 * answer that cannot change.
 */
class PermanentApiError extends Error {}

/** Seconds to wait, from a `Retry-After` header that may be seconds or a date. */
function retryAfterMs(header: string | null, attempt: number): number {
  const backoff = Math.min(1000 * 2 ** attempt, 8000);
  if (!header) return backoff;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, backoff);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), backoff);
  return backoff;
}

async function apiCall(
  ctx: ApiContext,
  base: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  // Ask Wikimedia to shed our load rather than serve it, when replicas lag.
  url.searchParams.set("maxlag", String(DEFAULT_MAXLAG_SECONDS));
  // Anonymous CORS, so the same code works from a browser.
  url.searchParams.set("origin", "*");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= ctx.maxRetries; attempt++) {
    const { signal, done } = requestSignal(ctx);
    try {
      const res = await ctx.fetch(url.toString(), {
        signal,
        headers: {
          // Browsers forbid setting User-Agent and drop it silently;
          // Api-User-Agent is Wikimedia's documented channel for exactly
          // that case. Sending both means one library honours the
          // User-Agent policy in Node and in the browser.
          "User-Agent": ctx.userAgent,
          "Api-User-Agent": ctx.userAgent,
        },
      });

      if (res.status === 429 || res.status === 503) {
        lastError = new Error(`Wikimedia API ${res.status}: ${res.statusText}`);
        if (attempt === ctx.maxRetries) break;
        await sleep(retryAfterMs(res.headers.get("retry-after"), attempt), ctx.signal);
        continue;
      }

      if (!res.ok) {
        throw new PermanentApiError(`Wikimedia API ${res.status}: ${res.statusText}`);
      }

      const body = (await res.json()) as { error?: { code?: string; info?: string } };

      // A maxlag rejection arrives as HTTP 200 with an error body.
      if (body.error?.code === "maxlag") {
        lastError = new Error(`Wikimedia API maxlag: ${body.error.info ?? "replication lag"}`);
        if (attempt === ctx.maxRetries) break;
        await sleep(retryAfterMs(res.headers.get("retry-after"), attempt), ctx.signal);
        continue;
      }

      return body;
    } catch (err) {
      // A cancellation is the caller's decision, never something to retry.
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (signal?.aborted) throw err;
      if (err instanceof PermanentApiError) throw err;
      lastError = err;
      if (attempt === ctx.maxRetries) break;
      await sleep(retryAfterMs(null, attempt), ctx.signal);
    } finally {
      done();
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function wikiApi(ctx: ApiContext, params: Record<string, string>): Promise<unknown> {
  return apiCall(ctx, ctx.wikipediaApi, params);
}

export function commonsApi(ctx: ApiContext, params: Record<string, string>): Promise<unknown> {
  return apiCall(ctx, ctx.commonsApi, params);
}

/** Lowercase and collapse runs of whitespace/hyphens to a single "-". */
function normalizeLicenseToken(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Is this license in the allowlist?
 *
 * Accepts an exact family match ("cc-by") or a family followed by a version
 * ("cc-by-sa-4.0"), but never a family followed by a restrictive modifier —
 * "cc-by-nc-nd-4.0" must not satisfy "cc-by". That is enforced by requiring
 * whatever follows the prefix to start with a digit.
 */
export function isLicenseAllowed(
  license: string,
  allowedLicenses: readonly string[]
): boolean {
  const normalized = normalizeLicenseToken(license);
  if (!normalized) return false;
  return allowedLicenses.some((entry) => {
    const prefix = normalizeLicenseToken(entry);
    if (!prefix) return false;
    if (normalized === prefix) return true;
    const remainder = normalized.startsWith(`${prefix}-`)
      ? normalized.slice(prefix.length + 1)
      : null;
    return remainder !== null && /^\d/.test(remainder);
  });
}

/**
 * Wikimedia filenames use underscores in place of spaces, and underscore is
 * a word character in JS regex — so a `\bword\b` pattern would silently
 * never match a real Commons filename. Patterns are tested against both the
 * raw filename and this spaced copy, so anchored patterns behave the way
 * they read without breaking patterns written against the raw form.
 */
export function spaced(filename: string): string {
  return filename.replace(/[_-]/g, " ");
}

export function isRejected(
  filename: string,
  rejectPatterns: readonly RegExp[]
): boolean {
  const alt = spaced(filename);
  return rejectPatterns.some((p) => p.test(filename) || p.test(alt));
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

/** Decode the handful of HTML entities Wikimedia's extmetadata actually emits. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1]?.toLowerCase() === "x"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Strip HTML tags, decode entities, collapse whitespace. */
function toPlainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** First href in an HTML fragment, absolutized against Wikimedia. */
function firstHref(html: string): string | undefined {
  const m = /<a\b[^>]*\bhref=["']([^"']+)["']/i.exec(html);
  const href = m?.[1];
  if (!href) return undefined;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://commons.wikimedia.org${href}`;
  return href;
}

export interface FileInfo {
  title: string;
  url: string;
  descriptionurl: string;
  license: string;
  licenseCode?: string;
  licenseUrl?: string;
  artist: string;
  artistUrl?: string;
  credit?: string;
  restrictions?: string;
}

interface ExtMetadata {
  LicenseShortName?: { value: string };
  License?: { value: string };
  LicenseUrl?: { value: string };
  Artist?: { value: string };
  Credit?: { value: string };
  Restrictions?: { value: string };
}

interface ImageInfoPage {
  title?: string;
  imageinfo?: Array<{
    url: string;
    thumburl?: string;
    descriptionurl: string;
    extmetadata?: ExtMetadata;
  }>;
}

interface ImageInfoResponse {
  query?: { pages?: ImageInfoPage[] | Record<string, ImageInfoPage> };
}

function pageList(data: ImageInfoResponse): ImageInfoPage[] {
  const pages = data.query?.pages;
  if (!pages) return [];
  return Array.isArray(pages) ? pages : Object.values(pages);
}

export function toFileInfo(page: ImageInfoPage): FileInfo | null {
  const info = page.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata;
  const artistHtml = meta?.Artist?.value ?? "";
  const creditHtml = meta?.Credit?.value ?? "";
  const restrictions = meta?.Restrictions?.value
    ? toPlainText(meta.Restrictions.value)
    : "";

  return {
    title: page.title ?? "",
    url: info.thumburl ?? info.url,
    descriptionurl: info.descriptionurl,
    license: meta?.LicenseShortName?.value
      ? toPlainText(meta.LicenseShortName.value)
      : "Unknown",
    licenseCode: meta?.License?.value ? toPlainText(meta.License.value) : undefined,
    licenseUrl: meta?.LicenseUrl?.value || undefined,
    artist: artistHtml ? toPlainText(artistHtml) || "Unknown" : "Unknown",
    artistUrl: artistHtml ? firstHref(artistHtml) : undefined,
    credit: creditHtml ? toPlainText(creditHtml) || undefined : undefined,
    restrictions: restrictions || undefined,
  };
}

/**
 * License string to gate on: the machine-readable code when Wikimedia
 * supplies one, the human-readable short name otherwise.
 *
 * `extmetadata.License` is a normalized code (`"cc-by-sa-4.0"`, `"pd"`),
 * while `LicenseShortName` is display prose. Preferring the code means the
 * allowlist compares against a stable vocabulary instead of parsing text.
 */
export function licenseForGating(info: FileInfo): string {
  return info.licenseCode ?? info.license;
}

/**
 * Get image info for one or more "File:" titles in a SINGLE request.
 *
 * The MediaWiki API takes up to 50 pipe-separated titles, so the previous
 * one-request-per-candidate loop was up to 5 sequential round trips per
 * entity for no reason. Returned map is keyed by the caller's title.
 */
export async function getImageInfos(
  ctx: ApiContext,
  fileTitles: string[],
  useCommons = false
): Promise<Map<string, FileInfo>> {
  const out = new Map<string, FileInfo>();
  if (fileTitles.length === 0) return out;

  const api = useCommons ? commonsApi : wikiApi;
  const data = (await api(ctx, {
    action: "query",
    titles: fileTitles.slice(0, 50).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  })) as ImageInfoResponse;

  const byNormalized = new Map<string, FileInfo>();
  for (const page of pageList(data)) {
    const info = toFileInfo(page);
    if (info) byNormalized.set(normalizeTitle(info.title), info);
  }

  for (const requested of fileTitles) {
    const found = byNormalized.get(normalizeTitle(requested));
    if (found) out.set(requested, { ...found, title: found.title || requested });
  }

  return out;
}

/** Wikimedia normalizes underscores to spaces and uppercases the first letter. */
function normalizeTitle(title: string): string {
  const t = title.replace(/_/g, " ").trim();
  const colon = t.indexOf(":");
  const ns = colon === -1 ? "" : t.slice(0, colon + 1);
  const rest = colon === -1 ? t : t.slice(colon + 1);
  return (ns + rest.charAt(0).toUpperCase() + rest.slice(1)).toLowerCase();
}

/** Convenience wrapper for a single title. */
export async function getImageInfo(
  ctx: ApiContext,
  fileTitle: string,
  useCommons = false
): Promise<FileInfo | null> {
  const infos = await getImageInfos(ctx, [fileTitle], useCommons);
  return infos.get(fileTitle) ?? null;
}
