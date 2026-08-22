import { test } from "node:test";
import assert from "node:assert/strict";
import { findFreeImage } from "../src/index.js";
import { createFetchStub, imageInfoPage, USER_AGENT, type FetchRoute } from "./helpers.js";

const searchRoute = (over: Partial<FetchRoute> = {}): FetchRoute => ({
  match: (url) => url.searchParams.get("generator") === "search",
  body: {
    query: {
      pages: [
        imageInfoPage({
          title: "File:Eddystone_Lighthouse.jpg",
          licenseShortName: "CC0",
          license: "cc0",
        }),
      ],
    },
  },
  ...over,
});

const find = (fetch: typeof globalThis.fetch, extra = {}) =>
  findFreeImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    fetch,
    timeoutMs: 0,
    maxRetries: 0,
    ...extra,
  });

test("every request identifies the client under both User-Agent header names", () => {
  // Browsers forbid setting User-Agent and drop it silently, so a
  // browser-side caller would be anonymous to Wikimedia — exactly what the
  // User-Agent policy exists to prevent. Api-User-Agent is the documented
  // channel for that case.
  const stub = createFetchStub([searchRoute()]);
  return find(stub.fetch).then(() => {
    assert.ok(stub.headers.length > 0);
    for (const h of stub.headers) {
      assert.equal(h["User-Agent"], USER_AGENT);
      assert.equal(h["Api-User-Agent"], USER_AGENT);
    }
  });
});

test("every request sends maxlag, so Wikimedia can shed our load when replicas lag", async () => {
  const stub = createFetchStub([searchRoute()]);
  await find(stub.fetch);
  assert.equal(stub.urls[0]!.searchParams.get("maxlag"), "5");
});

test("a 429 is retried, honouring Retry-After, and then succeeds", async () => {
  const stub = createFetchStub([
    searchRoute({ statuses: [429, 200], headers: { "retry-after": "0" } }),
  ]);

  const result = await find(stub.fetch, { maxRetries: 2 });

  assert.equal(stub.calls.length, 2, "expected one retry after the 429");
  assert.ok(result);
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse.jpg");
});

test("a maxlag error arrives as HTTP 200 and is still retried", async () => {
  // MediaWiki reports replication lag in the body, not the status line —
  // treating only non-2xx as retryable would miss it entirely.
  const stub = createFetchStub([
    searchRoute({
      headers: { "retry-after": "0" },
      bodies: [
        { error: { code: "maxlag", info: "Waiting for a database server: 7 seconds lagged" } },
        {
          query: {
            pages: [
              imageInfoPage({
                title: "File:Eddystone_Lighthouse.jpg",
                licenseShortName: "CC0",
                license: "cc0",
              }),
            ],
          },
        },
      ],
    }),
  ]);

  const result = await find(stub.fetch, { maxRetries: 2 });
  assert.equal(stub.calls.length, 2);
  assert.ok(result);
});

test("retries are bounded and the last error surfaces", async () => {
  const stub = createFetchStub([
    searchRoute({ status: 503, headers: { "retry-after": "0" } }),
  ]);

  await assert.rejects(
    () => find(stub.fetch, { maxRetries: 2 }),
    /Wikimedia API 503/
  );
  assert.equal(stub.calls.length, 3, "initial attempt plus two retries");
});

test("a hung request is aborted by timeoutMs rather than hanging the caller", async () => {
  const stub = createFetchStub([searchRoute({ hang: true })]);

  await assert.rejects(() => find(stub.fetch, { timeoutMs: 50, maxRetries: 0 }));
});

test("a 404 is not retried — only backpressure statuses are", async () => {
  // Control for the retry tests above: if everything were retried, the
  // counts in those tests would prove nothing.
  const stub = createFetchStub([searchRoute({ status: 404 })]);

  await assert.rejects(() => find(stub.fetch, { maxRetries: 2 }), /Wikimedia API 404/);
  assert.equal(stub.calls.length, 1);
});

test("a caller AbortSignal cancels in-flight work", async () => {
  const controller = new AbortController();
  const stub = createFetchStub([searchRoute({ hang: true })]);

  const pending = find(stub.fetch, { signal: controller.signal, timeoutMs: 0, maxRetries: 2 });
  controller.abort();

  await assert.rejects(() => pending);
});

test("aborting during a retry backoff cancels immediately, rather than sleeping it out", async () => {
  // A plain setTimeout backoff would keep an abandoned request waiting the
  // full Retry-After window before noticing nobody wants the answer.
  const controller = new AbortController();
  const stub = createFetchStub([
    searchRoute({ status: 503, headers: { "retry-after": "30" } }),
  ]);

  const started = Date.now();
  const pending = find(stub.fetch, {
    signal: controller.signal,
    maxRetries: 3,
    timeoutMs: 0,
  });
  setTimeout(() => controller.abort(), 30);

  await assert.rejects(() => pending);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `aborted in ${elapsed}ms, expected well under the 30s backoff`);
});
