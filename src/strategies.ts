import { type ApiContext, wikiApi, commonsApi, getImageInfo, isLicenseAllowed } from "./api.js";
import { scoreImage, type ScoreOptions, NO_MATCH_SCORE } from "./scoring.js";
import type { WikiImageCandidate } from "./types.js";

/** Strategy A: use the `pageimages` prop for the article's main image. */
export async function tryPageImage(
  ctx: ApiContext,
  wikiTitle: string
): Promise<{ url: string; pageTitle: string } | null> {
  const data = (await wikiApi(ctx, {
    action: "query",
    titles: wikiTitle,
    prop: "pageimages",
    pithumbsize: "800",
  })) as {
    query?: {
      pages?: Record<string, { thumbnail?: { source: string }; title: string }>;
    };
  };

  const pages = data.query?.pages;
  if (!pages) return null;

  for (const page of Object.values(pages)) {
    if (page.thumbnail?.source) {
      return { url: page.thumbnail.source, pageTitle: page.title };
    }
  }

  return null;
}

/** Strategy B: fetch all article images, score them, verify license, pick the best. */
export async function tryImageList(
  ctx: ApiContext,
  wikiTitle: string,
  entityName: string,
  scoreOptions: Omit<ScoreOptions, "strict">,
  allowedLicenses: readonly string[]
): Promise<WikiImageCandidate | null> {
  const data = (await wikiApi(ctx, {
    action: "query",
    titles: wikiTitle,
    prop: "images",
    imlimit: "50",
  })) as {
    query?: {
      pages?: Record<string, { images?: Array<{ title: string }> }>;
    };
  };

  const pages = data.query?.pages;
  if (!pages) return null;

  const allImages: Array<{ title: string; score: number }> = [];

  for (const page of Object.values(pages)) {
    if (!page.images) continue;
    for (const img of page.images) {
      const score = scoreImage(img.title, entityName, { ...scoreOptions, strict: false });
      if (score > NO_MATCH_SCORE) {
        allImages.push({ title: img.title, score });
      }
    }
  }

  if (allImages.length === 0) return null;

  allImages.sort((a, b) => b.score - a.score);

  // Try top candidates until we find one with an allowed license.
  for (const candidate of allImages.slice(0, 5)) {
    const info = await getImageInfo(ctx, candidate.title);
    if (!info) continue;
    if (!isLicenseAllowed(info.license, allowedLicenses)) continue;

    return {
      title: candidate.title,
      url: info.url,
      descriptionurl: info.descriptionurl,
      license: info.license,
      artist: info.artist,
      score: candidate.score,
    };
  }

  return null;
}

/** Strategy C: search Wikimedia Commons directly by filename/description. */
export async function tryCommonsSearch(
  ctx: ApiContext,
  entityName: string,
  buildSearchQuery: (name: string) => string,
  scoreOptions: Omit<ScoreOptions, "strict">,
  allowedLicenses: readonly string[]
): Promise<WikiImageCandidate | null> {
  const searchQuery = buildSearchQuery(entityName);

  const data = (await commonsApi(ctx, {
    action: "query",
    list: "search",
    srsearch: searchQuery,
    srnamespace: "6", // File: namespace
    srlimit: "10",
  })) as {
    query?: {
      search?: Array<{ title: string }>;
    };
  };

  const results = data.query?.search;
  if (!results || results.length === 0) return null;

  // Strict scoring: requires a distinctive name-part match and, if
  // supplied, a domain-keyword match.
  const scored = results
    .map((r) => ({
      title: r.title,
      score: scoreImage(r.title, entityName, { ...scoreOptions, strict: true }),
    }))
    .filter((r) => r.score > NO_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  for (const candidate of scored.slice(0, 5)) {
    const info = await getImageInfo(ctx, candidate.title, true);
    if (!info) continue;
    if (!isLicenseAllowed(info.license, allowedLicenses)) continue;

    return {
      title: candidate.title,
      url: info.url,
      descriptionurl: info.descriptionurl,
      license: info.license,
      artist: info.artist,
      score: candidate.score,
    };
  }

  return null;
}
