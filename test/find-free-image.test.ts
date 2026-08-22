import { test } from "node:test";
import assert from "node:assert/strict";
import { findFreeImage } from "../src/index.js";
import {
  createFetchStub,
  unreachableFetch,
  baseOptions,
  imageInfoPage,
  type FetchRoute,
} from "./helpers.js";

const KEYWORDS = /\b(lighthouse|beacon)\b/i;

const imageListRoute = (body: unknown): FetchRoute => ({
  match: (url) => url.searchParams.get("prop") === "images",
  body,
});
const pageImagesRoute = (body: unknown): FetchRoute => ({
  match: (url) => url.searchParams.get("prop") === "pageimages",
  body,
});
const imageInfoRoute = (body: unknown, commons = false): FetchRoute => ({
  match: (url) =>
    url.searchParams.get("prop") === "imageinfo" &&
    url.searchParams.get("generator") === null &&
    url.hostname.includes("commons") === commons,
  body,
});
const commonsSearchRoute = (body: unknown): FetchRoute => ({
  match: (url) => url.searchParams.get("generator") === "search",
  body,
});

test("strategy 1 (article image list) succeeds: strategies 2 and 3 never run, attribution captured", async () => {
  const stub = createFetchStub([
    imageListRoute({
      query: {
        pages: [
          {
            images: [
              { title: "File:Eddystone_Lighthouse_aerial.jpg" },
              { title: "File:Symbol_support_vote.svg" }, // rejected by pattern
            ],
          },
        ],
      },
    }),
    imageInfoRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_aerial.jpg",
            descriptionurl:
              "https://en.wikipedia.org/wiki/File:Eddystone_Lighthouse_aerial.jpg",
            licenseShortName: "CC BY-SA 4.0",
            license: "cc-by-sa-4.0",
            licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
            artist: '<a href="//example.org/jane">Jane Photographer</a>',
          }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["prop=images", "prop=imageinfo"]);

  assert.ok(result);
  assert.equal(
    result.imageUrl,
    "https://upload.wikimedia.org/thumb/Eddystone_Lighthouse_aerial.jpg"
  );
  assert.deepEqual(result.attribution, {
    id: "eddystone",
    source: "wikimedia",
    sourceUrl: "https://en.wikipedia.org/wiki/File:Eddystone_Lighthouse_aerial.jpg",
    license: "CC BY-SA 4.0",
    licenseCode: "cc-by-sa-4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    author: "Jane Photographer", // HTML stripped
    authorUrl: "https://example.org/jane", // protocol-relative href absolutized
    credit: undefined,
    restrictions: undefined,
    fileTitle: "File:Eddystone_Lighthouse_aerial.jpg",
  });
});

test("strategy 1 resolves all top candidates in ONE batched imageinfo request", async () => {
  // Regression: b7e5edd — the extracted code issued one imageinfo request
  // per candidate, sequentially, up to five per entity. The MediaWiki API
  // takes 50 pipe-separated titles, so this must be a single round trip.
  const stub = createFetchStub([
    imageListRoute({
      query: {
        pages: [
          {
            images: [
              { title: "File:Eddystone_Lighthouse_a.png" },
              { title: "File:Eddystone_Lighthouse_b.png" },
              { title: "File:Eddystone_Lighthouse_c.jpg" },
            ],
          },
        ],
      },
    }),
    imageInfoRoute({
      query: {
        pages: [
          // The .jpg scores highest and is checked first, but all three are
          // fetched together.
          imageInfoPage({ title: "File:Eddystone_Lighthouse_c.jpg", license: "cc-by-4.0", licenseShortName: "CC BY 4.0" }),
          imageInfoPage({ title: "File:Eddystone_Lighthouse_a.png", license: "cc0" , licenseShortName: "CC0"}),
          imageInfoPage({ title: "File:Eddystone_Lighthouse_b.png", license: "cc0", licenseShortName: "CC0" }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    fetch: stub.fetch,
  });

  assert.ok(result);
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse_c.jpg");

  const imageInfoCalls = stub.calls.filter((c) => c === "prop=imageinfo");
  assert.equal(imageInfoCalls.length, 1, "expected exactly one batched imageinfo request");

  const titles = stub.urls.find((u) => u.searchParams.get("prop") === "imageinfo")!
    .searchParams.get("titles")!;
  assert.equal(titles.split("|").length, 3);
});

test("strategy 2 (article lead image) verifies the license instead of assuming it", async () => {
  // Regression: b7e5edd — the lead-image fallback returned the thumbnail
  // with license "See Wikipedia", bypassing BOTH the reject list and the
  // license allowlist that the rest of the library exists to enforce.
  const stub = createFetchStub([
    imageListRoute({
      query: { pages: [{ images: [{ title: "File:Flag_of_Cornwall.svg" }] }] },
    }),
    pageImagesRoute({
      query: {
        pages: [
          {
            title: "Eddystone Lighthouse",
            pageimage: "Eddystone_Lighthouse_lead.jpg",
            thumbnail: { source: "https://upload.wikimedia.org/thumb/lead.jpg" },
          },
        ],
      },
    }),
    imageInfoRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_lead.jpg",
            licenseShortName: "CC BY-SA 3.0",
            license: "cc-by-sa-3.0",
            artist: "Lead Photographer",
          }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["prop=images", "prop=pageimages", "prop=imageinfo"]);
  assert.ok(result);
  assert.equal(result.attribution.license, "CC BY-SA 3.0");
  assert.equal(result.attribution.licenseCode, "cc-by-sa-3.0");
  assert.equal(result.attribution.author, "Lead Photographer");
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse_lead.jpg");
  // The source URL is the file's own page, not a hand-built article URL.
  assert.match(result.attribution.sourceUrl, /\/wiki\/File:/);
  assert.notEqual(result.attribution.license, "See Wikipedia");
});

test("strategy 2 refuses a non-free lead image and falls through to Commons search", async () => {
  // Regression: b7e5edd — a non-free lead image was previously returned
  // outright. The gate must be a real gate: same fixture, allowed license
  // vs disallowed, must produce different outcomes.
  const stub = createFetchStub([
    imageListRoute({ query: { pages: [{ images: [] }] } }),
    pageImagesRoute({
      query: {
        pages: [
          {
            title: "Eddystone Lighthouse",
            pageimage: "Eddystone_Lighthouse_poster.jpg",
            thumbnail: { source: "https://upload.wikimedia.org/thumb/poster.jpg" },
          },
        ],
      },
    }),
    imageInfoRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_poster.jpg",
            licenseShortName: "Fair use",
            license: "fair-use",
          }),
        ],
      },
    }),
    commonsSearchRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_free.jpg",
            licenseShortName: "CC0",
            license: "cc0",
          }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, [
    "prop=images",
    "prop=pageimages",
    "prop=imageinfo",
    "generator=search(commons)",
  ]);
  assert.ok(result);
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse_free.jpg");
});

test("strategy 2 refuses a lead image that matches the reject list", async () => {
  // Regression: b7e5edd — en.wikipedia's pageimages returns SVG logos as
  // the lead image for many articles (e.g. Breaking Bad), which the reject
  // list discards everywhere except, previously, here.
  const stub = createFetchStub([
    imageListRoute({ query: { pages: [{ images: [] }] } }),
    pageImagesRoute({
      query: {
        pages: [
          {
            title: "Eddystone Lighthouse",
            pageimage: "Eddystone_official_logo.svg",
            thumbnail: { source: "https://upload.wikimedia.org/thumb/logo.svg" },
          },
        ],
      },
    }),
    imageInfoRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_official_logo.svg",
            licenseShortName: "Public domain",
            license: "pd", // allowed license, but still template art
          }),
        ],
      },
    }),
    commonsSearchRoute({ query: { pages: [] } }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    fetch: stub.fetch,
  });

  assert.equal(result, null);
});

test("strategy 3 (Commons search) folds search and metadata into one request", async () => {
  const stub = createFetchStub([
    commonsSearchRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_from_sea.jpg",
            licenseShortName: "CC0",
            license: "cc0",
            artist: "Anonymous",
          }),
          imageInfoPage({ title: "File:Unrelated_boat.jpg", license: "cc0" }), // filtered
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    // No wikipediaTitles at all -- forces the Commons-search-only path.
    keywords: KEYWORDS,
    buildSearchQuery: (name) => `${name} lighthouse`,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["generator=search(commons)"]);
  assert.ok(result);
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse_from_sea.jpg");
  assert.equal(result.attribution.license, "CC0");
});

test("skipCommonsSearch prevents strategy 3 from running for a listed id, without any fetch call", async () => {
  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords: KEYWORDS,
    skipCommonsSearch: ["eddystone"],
    fetch: unreachableFetch,
  });

  assert.equal(result, null);
});

test("returns null when no strategy finds an acceptable candidate", async () => {
  const stub = createFetchStub([commonsSearchRoute({ query: { pages: [] } })]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.equal(result, null);
});

test("lang selects the Wikipedia edition; Commons stays shared", async () => {
  const stub = createFetchStub([
    imageListRoute({
      query: { pages: [{ images: [{ title: "File:Phare_d_Eddystone.jpg" }] }] },
    }),
    imageInfoRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Phare_d_Eddystone.jpg",
            licenseShortName: "CC BY 4.0",
            license: "cc-by-4.0",
          }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Phare d Eddystone", {
    ...baseOptions,
    lang: "fr",
    wikipediaTitles: { eddystone: "Phare_d'Eddystone" },
    fetch: stub.fetch,
  });

  assert.ok(result);
  assert.equal(stub.urls[0]!.hostname, "fr.wikipedia.org");
  // Control: the default is en, so this hostname is a signal and not a constant.
  const enStub = createFetchStub([imageListRoute({ query: { pages: [{ images: [] }] } })]);
  await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    skipCommonsSearch: ["eddystone"],
    fetch: enStub.fetch,
  }).catch(() => {});
  assert.equal(enStub.urls[0]!.hostname, "en.wikipedia.org");
});

test("restrictions on a file are surfaced, not swallowed", async () => {
  const stub = createFetchStub([
    commonsSearchRoute({
      query: {
        pages: [
          imageInfoPage({
            title: "File:Eddystone_Lighthouse_crowd.jpg",
            licenseShortName: "CC BY-SA 4.0",
            license: "cc-by-sa-4.0",
            restrictions: "personality|trademarked",
          }),
        ],
      },
    }),
  ]);

  const result = await findFreeImage("eddystone", "Eddystone Lighthouse", {
    ...baseOptions,
    fetch: stub.fetch,
  });

  assert.ok(result);
  assert.equal(result.attribution.restrictions, "personality|trademarked");
});
