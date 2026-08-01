import { test } from "node:test";
import assert from "node:assert/strict";
import { findWikimediaImage } from "../src/index.js";
import { createFetchStub, unreachableFetch, type FetchRoute } from "./helpers.js";

const USER_AGENT = "wikimedia-source-tests/1.0 (test@example.org)";
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
    url.searchParams.get("prop") === "imageinfo" && url.hostname.includes("commons") === commons,
  body,
});
const commonsSearchRoute = (body: unknown): FetchRoute => ({
  match: (url) => url.searchParams.get("list") === "search",
  body,
});

test("strategy 1 (article image list) succeeds: strategies 2 and 3 never run, attribution captured", async () => {
  const stub = createFetchStub([
    imageListRoute({
      query: {
        pages: {
          "1001": {
            images: [
              { title: "File:Eddystone_Lighthouse_aerial.jpg" },
              { title: "File:Symbol_support_vote.svg" }, // rejected by pattern
            ],
          },
        },
      },
    }),
    imageInfoRoute({
      query: {
        pages: {
          "5001": {
            imageinfo: [
              {
                url: "https://upload.wikimedia.org/full/Eddystone_Lighthouse_aerial.jpg",
                thumburl: "https://upload.wikimedia.org/thumb/Eddystone_Lighthouse_aerial.jpg",
                descriptionurl:
                  "https://en.wikipedia.org/wiki/File:Eddystone_Lighthouse_aerial.jpg",
                extmetadata: {
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                  Artist: { value: '<a href="//example.org">Jane Photographer</a>' },
                },
              },
            ],
          },
        },
      },
    }),
  ]);

  const result = await findWikimediaImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["prop=images", "prop=imageinfo"]);

  assert.ok(result);
  assert.equal(result.imageUrl, "https://upload.wikimedia.org/thumb/Eddystone_Lighthouse_aerial.jpg");
  assert.deepEqual(result.attribution, {
    id: "eddystone",
    source: "wikimedia",
    sourceUrl: "https://en.wikipedia.org/wiki/File:Eddystone_Lighthouse_aerial.jpg",
    license: "CC BY-SA 4.0",
    author: "Jane Photographer", // HTML stripped
    fileTitle: "File:Eddystone_Lighthouse_aerial.jpg",
  });
});

test("strategy 2 (article thumbnail) only runs after strategy 1 finds nothing", async () => {
  const stub = createFetchStub([
    imageListRoute({
      query: {
        pages: {
          "1001": {
            images: [{ title: "File:Flag_of_Cornwall.svg" }], // all rejected -> strategy 1 finds nothing
          },
        },
      },
    }),
    pageImagesRoute({
      query: {
        pages: {
          "1001": {
            title: "Eddystone Lighthouse",
            thumbnail: { source: "https://upload.wikimedia.org/thumb/Eddystone_Lighthouse_thumb.jpg" },
          },
        },
      },
    }),
  ]);

  const result = await findWikimediaImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    wikipediaTitles: { eddystone: "Eddystone_Lighthouse" },
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["prop=images", "prop=pageimages"]);
  assert.ok(result);
  assert.equal(
    result.imageUrl,
    "https://upload.wikimedia.org/thumb/Eddystone_Lighthouse_thumb.jpg"
  );
  assert.equal(result.attribution.license, "See Wikipedia");
  assert.equal(result.attribution.fileTitle, "From article: Eddystone Lighthouse");
});

test("strategy 3 (Commons search) runs when no Wikipedia title is known, and is filtered/scored", async () => {
  const stub = createFetchStub([
    commonsSearchRoute({
      query: {
        search: [
          { title: "File:Eddystone_Lighthouse_from_sea.jpg" },
          { title: "File:Unrelated_boat.jpg" }, // no distinctive name match -> filtered
        ],
      },
    }),
    imageInfoRoute(
      {
        query: {
          pages: {
            "9001": {
              imageinfo: [
                {
                  url: "https://upload.wikimedia.org/full/Eddystone_Lighthouse_from_sea.jpg",
                  descriptionurl:
                    "https://commons.wikimedia.org/wiki/File:Eddystone_Lighthouse_from_sea.jpg",
                  extmetadata: {
                    LicenseShortName: { value: "CC0" },
                    Artist: { value: "Anonymous" },
                  },
                },
              ],
            },
          },
        },
      },
      true
    ),
  ]);

  const result = await findWikimediaImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    // No wikipediaTitles at all -- forces the Commons-search-only path.
    keywords: KEYWORDS,
    buildSearchQuery: (name) => `${name} lighthouse`,
    fetch: stub.fetch,
  });

  assert.deepEqual(stub.calls, ["list=search", "prop=imageinfo(commons)"]);
  assert.ok(result);
  assert.equal(result.attribution.fileTitle, "File:Eddystone_Lighthouse_from_sea.jpg");
  assert.equal(result.attribution.license, "CC0");
});

test("skipCommonsSearch prevents strategy 3 from running for a listed id, without any fetch call", async () => {
  const result = await findWikimediaImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    keywords: KEYWORDS,
    skipCommonsSearch: ["eddystone"],
    fetch: unreachableFetch,
  });

  assert.equal(result, null);
});

test("returns null when no strategy finds an acceptable candidate", async () => {
  const stub = createFetchStub([
    commonsSearchRoute({ query: { search: [] } }),
  ]);

  const result = await findWikimediaImage("eddystone", "Eddystone Lighthouse", {
    userAgent: USER_AGENT,
    keywords: KEYWORDS,
    fetch: stub.fetch,
  });

  assert.equal(result, null);
});
