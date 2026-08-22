import {
  type ApiContext,
  type FileInfo,
  DEFAULT_COMMONS_API,
  getImageInfo,
  wikipediaApiUrl,
} from "./api.js";
import {
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_GENERIC_WORDS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_REJECT_PATTERNS,
  DEFAULT_TIMEOUT_MS,
} from "./defaults.js";
import {
  tryPageImage,
  tryImageList,
  tryCommonsSearch,
  isUsableFile,
  candidateFrom,
} from "./strategies.js";
import type {
  Attribution,
  FindImageOptions,
  TitleResolver,
  ImageCandidate,
  FreeImageResult,
} from "./types.js";

export type {
  Attribution,
  FindImageOptions,
  TitleResolver,
  ImageCandidate,
  FreeImageResult,
} from "./types.js";

export { formatAttribution, type FormatAttributionOptions } from "./attribution.js";
export {
  DEFAULT_ALLOWED_LICENSES,
  DEFAULT_REJECT_PATTERNS,
  DEFAULT_GENERIC_WORDS,
} from "./defaults.js";

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

function attributionFrom(id: string, c: ImageCandidate): Attribution {
  return {
    id,
    source: "wikimedia",
    sourceUrl: c.descriptionurl,
    license: c.license,
    licenseCode: c.licenseCode,
    licenseUrl: c.licenseUrl,
    author: c.artist,
    authorUrl: c.artistUrl,
    credit: c.credit,
    restrictions: c.restrictions,
    fileTitle: c.title,
  };
}

/**
 * Find a freely-licensed Wikimedia image for an entity, with attribution.
 *
 * Tries, in order:
 *  1. If a Wikipedia article title is known (via `options.wikipediaTitles`),
 *     fetch and score all of that article's images, and return the best one
 *     with an allowed license.
 *  2. If (1) found no acceptable candidate, fall back to the article's lead
 *     image — which is put through the same reject list and license
 *     allowlist as every other candidate, and skipped if it fails either.
 *  3. Otherwise (or if no title was known), search Wikimedia Commons
 *     directly by name, score and filter results, and return the best
 *     acceptable candidate.
 *
 * Returns `null` if no acceptable image was found by any strategy. **A
 * non-null result is always a file whose license matched the allowlist** —
 * there is no path that returns an unverified image.
 */
export async function findFreeImage(
  id: string,
  name: string,
  options: FindImageOptions
): Promise<FreeImageResult | null> {
  const lang = options.lang ?? "en";

  const ctx: ApiContext = {
    userAgent: options.userAgent,
    fetch: options.fetch ?? globalThis.fetch,
    wikipediaApi: options.wikipediaApiUrl ?? wikipediaApiUrl(lang),
    commonsApi: options.commonsApiUrl ?? DEFAULT_COMMONS_API,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    signal: options.signal,
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
      return { imageUrl: bestImage.url, attribution: attributionFrom(id, bestImage) };
    }

    // Strategy 2: the article's lead image — verified, not assumed.
    const pageImage = await tryPageImage(ctx, wikiTitle);
    if (pageImage?.fileTitle) {
      let info: FileInfo | null = null;
      try {
        info = await getImageInfo(ctx, pageImage.fileTitle);
      } catch {
        info = null;
      }
      if (info && isUsableFile(info, pageImage.fileTitle, rejectPatterns, allowedLicenses)) {
        const candidate = candidateFrom(info, pageImage.fileTitle, 0);
        return {
          imageUrl: candidate.url || pageImage.url,
          attribution: attributionFrom(id, candidate),
        };
      }
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
    return { imageUrl: commonsImage.url, attribution: attributionFrom(id, commonsImage) };
  }

  return null;
}
