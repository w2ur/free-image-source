export interface FetchRoute {
  /** Returns true if this route should handle the given request URL. */
  match: (url: URL) => boolean;
  /** JSON body to respond with. */
  body: unknown;
}

export interface FetchStub {
  fetch: typeof globalThis.fetch;
  /** Query-string labels ("prop=images", "list=search", ...) in call order. */
  calls: string[];
}

/**
 * Builds a stub `fetch` that never touches the network: it matches each
 * request against `routes` in order and returns the first match as JSON.
 * Throws if a request matches no route, so tests fail loudly on an
 * unexpected call instead of silently returning nothing.
 */
export function createFetchStub(routes: FetchRoute[]): FetchStub {
  const calls: string[] = [];

  const fetchStub = async (
    input: string | URL | Request,
    _init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());

    calls.push(describe(url));

    const route = routes.find((r) => r.match(url));
    if (!route) {
      throw new Error(`Unexpected fetch call, no route matched: ${url.toString()}`);
    }

    return new Response(JSON.stringify(route.body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return { fetch: fetchStub as typeof globalThis.fetch, calls };
}

function describe(url: URL): string {
  const params = url.searchParams;
  if (params.get("prop") === "images") return "prop=images";
  if (params.get("prop") === "pageimages") return "prop=pageimages";
  if (params.get("prop") === "imageinfo" && url.hostname.includes("commons"))
    return "prop=imageinfo(commons)";
  if (params.get("prop") === "imageinfo") return "prop=imageinfo";
  if (params.get("list") === "search") return "list=search";
  return url.toString();
}

/** A fetch implementation that always throws, to prove a code path never hits the network. */
export const unreachableFetch: typeof globalThis.fetch = async () => {
  throw new Error("network access attempted in a test — this should never happen");
};
