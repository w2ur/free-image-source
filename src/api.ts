const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

export interface ApiContext {
  userAgent: string;
  fetch: typeof globalThis.fetch;
}

async function apiCall(
  ctx: ApiContext,
  base: string,
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(base);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await ctx.fetch(url.toString(), {
    headers: { "User-Agent": ctx.userAgent },
  });

  if (!res.ok) {
    throw new Error(`Wikimedia API ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export function wikiApi(
  ctx: ApiContext,
  params: Record<string, string>
): Promise<unknown> {
  return apiCall(ctx, WIKI_API, params);
}

export function commonsApi(
  ctx: ApiContext,
  params: Record<string, string>
): Promise<unknown> {
  return apiCall(ctx, COMMONS_API, params);
}

/** Lowercase and collapse runs of whitespace/hyphens to a single "-". */
function normalizeLicenseToken(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, "-").replace(/^-|-$/g, "");
}

export function isLicenseAllowed(
  license: string,
  allowedLicenses: readonly string[]
): boolean {
  const normalized = normalizeLicenseToken(license);
  return allowedLicenses.some((entry) => {
    const prefix = normalizeLicenseToken(entry);
    if (normalized === prefix) return true;
    // Allow a trailing version number ("cc-by-sa-4.0"), but not a trailing
    // restrictive modifier ("cc-by-nc-nd-4.0" must NOT match "cc-by"):
    // whatever follows the prefix must start with a digit.
    const remainder = normalized.startsWith(`${prefix}-`)
      ? normalized.slice(prefix.length + 1)
      : null;
    return remainder !== null && /^\d/.test(remainder);
  });
}

export function isRejected(
  filename: string,
  rejectPatterns: readonly RegExp[]
): boolean {
  return rejectPatterns.some((p) => p.test(filename));
}

interface ImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: Array<{
          url: string;
          thumburl?: string;
          descriptionurl: string;
          extmetadata?: {
            LicenseShortName?: { value: string };
            Artist?: { value: string };
          };
        }>;
      }
    >;
  };
}

/** Get image info (URL, license, artist) for a "File:" title. */
export async function getImageInfo(
  ctx: ApiContext,
  fileTitle: string,
  useCommons = false
): Promise<{
  url: string;
  descriptionurl: string;
  license: string;
  artist: string;
} | null> {
  const api = useCommons ? commonsApi : wikiApi;
  const data = (await api(ctx, {
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  })) as ImageInfoResponse;

  const pages = data.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info) continue;

    const license = info.extmetadata?.LicenseShortName?.value ?? "Unknown";
    const artist = info.extmetadata?.Artist?.value ?? "Unknown";

    return {
      url: info.thumburl ?? info.url,
      descriptionurl: info.descriptionurl,
      license,
      artist: artist.replace(/<[^>]*>/g, "").trim(), // strip HTML
    };
  }

  return null;
}
