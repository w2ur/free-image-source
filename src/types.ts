/**
 * Attribution captured for a sourced image, sufficient to credit the
 * author and license per Wikimedia's reuse requirements.
 */
export interface Attribution {
  /** The caller-supplied id this image was sourced for. */
  id: string;
  source: "wikimedia";
  /** The Wikimedia/Wikipedia page describing the file (its "File:" page). */
  sourceUrl: string;
  /** Human-readable license name, e.g. "CC BY-SA 4.0". */
  license: string;
  /**
   * Machine-readable license code from `extmetadata.License`, e.g.
   * `"cc-by-sa-4.0"`. `undefined` when Wikimedia did not supply one.
   */
  licenseCode?: string;
  /** Canonical URL of the license deed, when Wikimedia supplies one. */
  licenseUrl?: string;
  /** Author name, HTML stripped and entities decoded. */
  author: string;
  /** The author's Wikimedia user or homepage URL, when the credit links out. */
  authorUrl?: string;
  /** Free-text credit line from the file page ("Own work", a source URL, ...). */
  credit?: string;
  /**
   * Non-copyright restrictions Commons flags on the file — trademark,
   * personality rights, insignia. Empty when unrestricted. **A permissive
   * license does not clear these**; they are surfaced so callers can act
   * on them rather than discover them later.
   */
  restrictions?: string;
  /** The "File:..." title on Wikimedia. */
  fileTitle: string;
}

export interface FreeImageResult {
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
   * Wikipedia language edition to query, as a subdomain code. Defaults to
   * `"en"`. Wikimedia Commons is shared across languages and is always
   * queried at commons.wikimedia.org.
   */
  lang?: string;

  /** Full override for the Wikipedia API endpoint. Takes precedence over `lang`. */
  wikipediaApiUrl?: string;

  /** Full override for the Commons API endpoint. */
  commonsApiUrl?: string;

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
   * License codes (matched as lowercase, hyphen-normalized) that are
   * acceptable to use. Defaults to a permissive-license allowlist
   * (CC-BY, CC-BY-SA, CC0, public domain, GFDL).
   */
  allowedLicenses?: string[];

  /**
   * Filenames matching any of these patterns are rejected outright, before
   * scoring — template art, icons, flags, disambiguation markers, etc.
   * Defaults to a broad, domain-neutral list. Each pattern is tested
   * against both the raw filename and a copy with `_`/`-` replaced by
   * spaces, so `\b`-anchored patterns work against real Commons titles.
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
   * Per-request timeout in milliseconds. Defaults to 10000. Set to 0 to
   * disable. Without this a hung connection hangs the caller indefinitely.
   */
  timeoutMs?: number;

  /**
   * How many times to retry a request Wikimedia asked us to back off from
   * (HTTP 429/503, or a `maxlag` error). Defaults to 2. `Retry-After` is
   * honoured when present.
   */
  maxRetries?: number;

  /** Caller-supplied cancellation, combined with the per-request timeout. */
  signal?: AbortSignal;

  /**
   * Injectable fetch implementation, primarily for testing. Defaults to
   * the global `fetch`.
   */
  fetch?: typeof globalThis.fetch;
}

/** A scored, license-checked, ready-to-use Wikimedia file candidate. */
export interface ImageCandidate {
  title: string;
  url: string;
  descriptionurl: string;
  license: string;
  licenseCode?: string;
  licenseUrl?: string;
  artist: string;
  artistUrl?: string;
  credit?: string;
  restrictions?: string;
  score: number;
}
