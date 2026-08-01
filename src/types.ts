/**
 * Attribution captured for a sourced image, sufficient to credit the
 * author and license per Wikimedia's reuse requirements.
 */
export interface Attribution {
  /** The caller-supplied id this image was sourced for. */
  id: string;
  source: "wikimedia";
  /** The Wikimedia/Wikipedia page describing the file (its "File:" or article page). */
  sourceUrl: string;
  license: string;
  author: string;
  /** The "File:..." title on Wikimedia, or a description of the source article. */
  fileTitle: string;
}

export interface WikimediaImageResult {
  imageUrl: string;
  attribution: Attribution;
}

/**
 * Resolves a caller id (and optionally its display name) to a known
 * Wikipedia article title, enabling the fast, high-confidence strategies
 * (article images, article thumbnail) before falling back to Commons search.
 *
 * Can be a plain `id -> title` map, or a function for more dynamic lookups.
 */
export type TitleResolver =
  | Record<string, string>
  | ((id: string, name: string) => string | undefined);

export interface FindImageOptions {
  /**
   * Required. Wikimedia's User-Agent policy requires a descriptive,
   * identifying string — see README for details. There is no default.
   */
  userAgent: string;

  /**
   * Maps a caller id to a known Wikipedia article title. When a title is
   * found, the article-based strategies run first (more reliable, since the
   * image is already known to be on the right page).
   */
  wikipediaTitles?: TitleResolver;

  /**
   * Regex confirming a candidate filename is relevant to the caller's
   * domain (e.g. /\b(cat|feline)\b/i). Used to:
   *  - gate acceptance during Commons search (strategy 3), where name
   *    matching alone is unreliable, and
   *  - boost the score of candidates that match it in any strategy.
   * If omitted, Commons search falls back to name matching alone, which is
   * noisier.
   */
  keywords?: RegExp;

  /**
   * Builds the Wikimedia Commons search query from the entity's display
   * name. Defaults to the identity function. Callers typically append a
   * domain qualifier (e.g. `${name} cat breed`) for better precision.
   */
  buildSearchQuery?: (name: string) => string;

  /**
   * License strings (matched as lowercase, hyphen-normalized substrings)
   * that are acceptable to use. Defaults to a permissive-license allowlist
   * (CC-BY, CC-BY-SA, CC0, public domain, GFDL).
   */
  allowedLicenses?: string[];

  /**
   * Filenames matching any of these patterns are rejected outright, before
   * scoring — template art, icons, flags, disambiguation markers, etc.
   * Defaults to a broad, domain-neutral list.
   */
  rejectPatterns?: RegExp[];

  /**
   * Words too generic to count as a distinctive match of the entity's name
   * on their own (stopwords, common nouns). Only used during Commons search
   * scoring. Defaults to a small English stopword set; callers with a
   * specific domain should extend it with their own generic terms.
   */
  genericWords?: Iterable<string>;

  /**
   * Caller ids for which Commons search (strategy 3) should never run —
   * for entities where free-text search reliably returns unrelated results
   * that heuristics can't filter out. Defaults to none.
   */
  skipCommonsSearch?: Iterable<string>;

  /**
   * Injectable fetch implementation, primarily for testing. Defaults to
   * the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;
}

/** A scored, license-checked, ready-to-use Wikimedia file candidate. */
export interface WikiImageCandidate {
  title: string;
  url: string;
  descriptionurl: string;
  license: string;
  artist: string;
  score: number;
}
