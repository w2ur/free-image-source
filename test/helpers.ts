export interface FetchRoute {
  /** Returns true if this route should handle the given request URL. */
  match: (url: URL) => boolean;
  /** JSON body to respond with. */
  body?: unknown;
  /** HTTP status to respond with. Defaults to 200. */
  status?: number;
  /** Response headers, e.g. `{ "retry-after": "0" }`. */
  headers?: Record<string, string>;
  /** Respond differently on each successive call to this route. */
  bodies?: unknown[];
  /** Statuses for each successive call, parallel to `bodies`. */
  statuses?: number[];
  /** Never resolve — used to exercise the request timeout. */
  hang?: boolean;
}

export interface FetchStub {
  fetch: typeof globalThis.fetch;
  /** Query-string labels ("prop=images", "generator=search", ...) in call order. */
  calls: string[];
  /** Every request URL, in call order. */
  urls: URL[];
  /** Headers of every request, in call order. */
  headers: Array<Record<string, string>>;
}

/**
 * Builds a stub `fetch` that never touches the network: it matches each
 * request against `routes` in order and returns the first match as JSON.
 * Throws if a request matches no route, so tests fail loudly on an
 * unexpected call instead of silently returning nothing.
 */
export function createFetchStub(routes: FetchRoute[]): FetchStub {
  const calls: string[] = [];
  const urls: URL[] = [];
  const headers: Array<Record<string, string>> = [];
  const hits = new Map<FetchRoute, number>();

  const fetchStub = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());

    calls.push(describe(url));
    urls.push(url);
    headers.push({ ...((init?.headers as Record<string, string>) ?? {}) });

    const route = routes.find((r) => r.match(url));
    if (!route) {
      throw new Error(`Unexpected fetch call, no route matched: ${url.toString()}`);
    }

    if (route.hang) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }

    const n = hits.get(route) ?? 0;
    hits.set(route, n + 1);

    const body = route.bodies ? route.bodies[Math.min(n, route.bodies.length - 1)] : route.body;
    const status = route.statuses
      ? route.statuses[Math.min(n, route.statuses.length - 1)]
      : (route.status ?? 200);

    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  };

  return { fetch: fetchStub as typeof globalThis.fetch, calls, urls, headers };
}

function describe(url: URL): string {
  const params = url.searchParams;
  const commons = url.hostname.includes("commons");
  if (params.get("generator") === "search") return "generator=search(commons)";
  if (params.get("prop") === "images") return "prop=images";
  if (params.get("prop") === "pageimages") return "prop=pageimages";
  if (params.get("prop") === "imageinfo")
    return commons ? "prop=imageinfo(commons)" : "prop=imageinfo";
  if (params.get("list") === "search") return "list=search";
  return url.toString();
}

/** A fetch implementation that always throws, to prove a code path never hits the network. */
export const unreachableFetch: typeof globalThis.fetch = async () => {
  throw new Error("network access attempted in a test — this should never happen");
};

export const USER_AGENT = "wikimedia-source-tests/1.0 (test@example.org)";

/**
 * Retries are disabled by default in tests: the stub throws on an
 * unmatched route so the suite fails loudly, and retrying that throw would
 * turn every such failure into a multi-second wait. Retry behaviour has its
 * own tests, which opt back in.
 */
export const baseOptions = { userAgent: USER_AGENT, maxRetries: 0, timeoutMs: 0 } as const;

/** A `prop=imageinfo` response page in formatversion=2 shape. */
export function imageInfoPage(opts: {
  title: string;
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  licenseShortName?: string;
  license?: string;
  licenseUrl?: string;
  artist?: string;
  credit?: string;
  restrictions?: string;
}) {
  const extmetadata: Record<string, { value: string }> = {};
  if (opts.licenseShortName) extmetadata.LicenseShortName = { value: opts.licenseShortName };
  if (opts.license) extmetadata.License = { value: opts.license };
  if (opts.licenseUrl) extmetadata.LicenseUrl = { value: opts.licenseUrl };
  if (opts.artist) extmetadata.Artist = { value: opts.artist };
  if (opts.credit) extmetadata.Credit = { value: opts.credit };
  if (opts.restrictions) extmetadata.Restrictions = { value: opts.restrictions };

  const slug = opts.title.replace(/^File:/, "");
  return {
    title: opts.title,
    imageinfo: [
      {
        url: opts.url ?? `https://upload.wikimedia.org/full/${slug}`,
        thumburl: opts.thumburl ?? `https://upload.wikimedia.org/thumb/${slug}`,
        descriptionurl:
          opts.descriptionurl ?? `https://commons.wikimedia.org/wiki/${opts.title}`,
        extmetadata,
      },
    ],
  };
}
