import {
  type ApiContext,
  type FileInfo,
  wikiApi,
  commonsApi,
  getImageInfos,
  isLicenseAllowed,
  licenseForGating,
  isRejected,
  toFileInfo,
} from "./api.js";
import { scoreImage, type ScoreOptions, NO_MATCH_SCORE } from "./scoring.js";
import type { ImageCandidate } from "./types.js";

/** How many top-scored candidates to resolve metadata for. One request, so this is cheap. */
const CANDIDATE_DEPTH = 5;

export function candidateFrom(info: FileInfo, title: string, score: number): ImageCandidate {
  return {
    title: info.title || title,
    url: info.url,
    descriptionurl: info.descriptionurl,
    license: info.license,
    licenseCode: info.licenseCode,
    licenseUrl: info.licenseUrl,
    artist: info.artist,
    artistUrl: info.artistUrl,
    credit: info.credit,
    restrictions: info.restrictions,
    score,
  };
}

function pagesOf<T>(pages: T[] | Record<string, T> | undefined): T[] {
  if (!pages) return [];
  return Array.isArray(pages) ? pages : Object.values(pages);
}

/**
 * Strategy A: the article's own lead image, via `pageimages`.
 *
 * Returns the `File:` title alongside the thumbnail URL (`piprop=name`) so
 * the caller can run the same license and reject checks as every other
 * strategy. Returning only a URL — as this used to — meant the fallback
 * path silently bypassed both.
 */
export async function tryPageImage(
  ctx: ApiContext,
  wikiTitle: string
): Promise<{ url: string; pageTitle: string; fileTitle?: string } | null> {
  const data = (await wikiApi(ctx, {
    action: "query",
    titles: wikiTitle,
    prop: "pageimages",
    piprop: "name|thumbnail",
    pithumbsize: "800",
  })) as {
    query?: {
      pages?:
        | Array<{ thumbnail?: { source: string }; title: string; pageimage?: string }>
        | Record<string, { thumbnail?: { source: string }; title: string; pageimage?: string }>;
    };
  };

  for (const page of pagesOf(data.query?.pages)) {
    if (page.thumbnail?.source) {
      return {
        url: page.thumbnail.source,
        pageTitle: page.title,
        fileTitle: page.pageimage ? `File:${page.pageimage}` : undefined,
      };
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
): Promise<ImageCandidate | null> {
  const data = (await wikiApi(ctx, {
    action: "query",
    titles: wikiTitle,
    prop: "images",
    imlimit: "50",
  })) as {
    query?: {
      pages?:
        | Array<{ images?: Array<{ title: string }> }>
        | Record<string, { images?: Array<{ title: string }> }>;
    };
  };

  const allImages: Array<{ title: string; score: number }> = [];

  for (const page of pagesOf(data.query?.pages)) {
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

  // One batched request for the top candidates, rather than one per candidate.
  const top = allImages.slice(0, CANDIDATE_DEPTH);
  const infos = await getImageInfos(ctx, top.map((c) => c.title));

  for (const candidate of top) {
    const info = infos.get(candidate.title);
    if (!info) continue;
    if (!isLicenseAllowed(licenseForGating(info), allowedLicenses)) continue;
    return candidateFrom(info, candidate.title, candidate.score);
  }

  return null;
}

/**
 * Strategy C: search Wikimedia Commons directly by filename/description.
 *
 * Uses `generator=search` with `prop=imageinfo`, so the search results
 * arrive with their license metadata already attached — one request in
 * place of a search plus up to five sequential metadata lookups.
 */
export async function tryCommonsSearch(
  ctx: ApiContext,
  entityName: string,
  buildSearchQuery: (name: string) => string,
  scoreOptions: Omit<ScoreOptions, "strict">,
  allowedLicenses: readonly string[]
): Promise<ImageCandidate | null> {
  const data = (await commonsApi(ctx, {
    action: "query",
    generator: "search",
    gsrsearch: buildSearchQuery(entityName),
    gsrnamespace: "6", // File: namespace
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  })) as {
    query?: {
      pages?:
        | Array<Parameters<typeof toFileInfo>[0]>
        | Record<string, Parameters<typeof toFileInfo>[0]>;
    };
  };

  // Strict scoring: requires a distinctive name-part match and, if
  // supplied, a domain-keyword match.
  const scored = pagesOf(data.query?.pages)
    .map((page) => {
      const title = page.title ?? "";
      return {
        info: toFileInfo(page),
        title,
        score: scoreImage(title, entityName, { ...scoreOptions, strict: true }),
      };
    })
    .filter((r) => r.info !== null && r.score > NO_MATCH_SCORE)
    .sort((a, b) => b.score - a.score);

  for (const candidate of scored.slice(0, CANDIDATE_DEPTH)) {
    const info = candidate.info as FileInfo;
    if (!isLicenseAllowed(licenseForGating(info), allowedLicenses)) continue;
    return candidateFrom(info, candidate.title, candidate.score);
  }

  return null;
}

/** Shared by strategy A's follow-up check — is this file usable at all? */
export function isUsableFile(
  info: FileInfo,
  title: string,
  rejectPatterns: readonly RegExp[],
  allowedLicenses: readonly string[]
): boolean {
  if (isRejected(title, rejectPatterns)) return false;
  return isLicenseAllowed(licenseForGating(info), allowedLicenses);
}
