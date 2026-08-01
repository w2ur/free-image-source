import type { ApiContext } from "./api.js";
import { DEFAULT_ALLOWED_LICENSES, DEFAULT_REJECT_PATTERNS, DEFAULT_GENERIC_WORDS } from "./defaults.js";
import { tryPageImage, tryImageList, tryCommonsSearch } from "./strategies.js";
import type {
  Attribution,
  FindImageOptions,
  TitleResolver,
  WikimediaImageResult,
} from "./types.js";

export type {
  Attribution,
  FindImageOptions,
  TitleResolver,
  WikiImageCandidate,
  WikimediaImageResult,
} from "./types.js";

function resolveTitle(
  resolver: TitleResolver | undefined,
  id: string,
  name: string
): string | undefined {
  if (!resolver) return undefined;
  if (typeof resolver === "function") return resolver(id, name);
  return resolver[id];
}

function toSet(values: Iterable<string> | undefined, fallback: readonly string[]): Set<string> {
  return new Set(values ?? fallback);
}

/**
 * Find a freely-licensed Wikimedia image for an entity, with attribution.
 *
 * Tries, in order:
 *  1. If a Wikipedia article title is known (via `options.wikipediaTitles`),
 *     fetch and score all of that article's images, and return the best one
 *     with an allowed license.
 *  2. If (1) found no acceptable candidate, fall back to the article's main
 *     thumbnail image (license unknown — attributed as "See Wikipedia").
 *  3. Otherwise (or if no title was known), search Wikimedia Commons
 *     directly by name, score and filter results, and return the best
 *     acceptable candidate.
 *
 * Returns `null` if no acceptable image was found by any strategy.
 */
export async function findWikimediaImage(
  id: string,
  name: string,
  options: FindImageOptions
): Promise<WikimediaImageResult | null> {
  const ctx: ApiContext = {
    userAgent: options.userAgent,
    fetch: options.fetch ?? globalThis.fetch,
  };

  const allowedLicenses = options.allowedLicenses ?? DEFAULT_ALLOWED_LICENSES;
  const rejectPatterns = options.rejectPatterns ?? DEFAULT_REJECT_PATTERNS;
  const genericWords = toSet(options.genericWords, DEFAULT_GENERIC_WORDS);
  const buildSearchQuery = options.buildSearchQuery ?? ((n: string) => n);
  const skipCommonsSearch = toSet(options.skipCommonsSearch, []);

  const scoreOptions = {
    rejectPatterns,
    genericWords,
    keywords: options.keywords,
  };

  const wikiTitle = resolveTitle(options.wikipediaTitles, id, name);

  if (wikiTitle) {
    // Strategy 1: score all article images, verify license.
    const bestImage = await tryImageList(ctx, wikiTitle, name, scoreOptions, allowedLicenses);
    if (bestImage) {
      const attribution: Attribution = {
        id,
        source: "wikimedia",
        sourceUrl: bestImage.descriptionurl,
        license: bestImage.license,
        author: bestImage.artist,
        fileTitle: bestImage.title,
      };
      return { imageUrl: bestImage.url, attribution };
    }

    // Strategy 2: fall back to the article's main thumbnail.
    const pageImage = await tryPageImage(ctx, wikiTitle);
    if (pageImage) {
      const attribution: Attribution = {
        id,
        source: "wikimedia",
        sourceUrl: `https://en.wikipedia.org/wiki/${wikiTitle}`,
        license: "See Wikipedia",
        author: "See Wikipedia",
        fileTitle: `From article: ${pageImage.pageTitle}`,
      };
      return { imageUrl: pageImage.url, attribution };
    }
  }

  // Strategy 3: search Wikimedia Commons directly (catches images not
  // linked from any Wikipedia article).
  if (skipCommonsSearch.has(id)) return null;

  const commonsImage = await tryCommonsSearch(
    ctx,
    name,
    buildSearchQuery,
    scoreOptions,
    allowedLicenses
  );
  if (commonsImage) {
    const attribution: Attribution = {
      id,
      source: "wikimedia",
      sourceUrl: commonsImage.descriptionurl,
      license: commonsImage.license,
      author: commonsImage.artist,
      fileTitle: commonsImage.title,
    };
    return { imageUrl: commonsImage.url, attribution };
  }

  return null;
}
