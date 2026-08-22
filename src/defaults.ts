/**
 * Permissive, freely-reusable license codes.
 *
 * Matched against Wikimedia's machine-readable `extmetadata.License` value
 * (e.g. `"cc-by-sa-4.0"`, `"pd"`) when present, and against the
 * human-readable `LicenseShortName` otherwise. Both are lowercased and
 * hyphen-normalized before comparison.
 */
export const DEFAULT_ALLOWED_LICENSES: readonly string[] = [
  "cc-by-sa",
  "cc-by",
  "cc0",
  "public domain",
  "pd",
  "gfdl",
];

/**
 * Filenames matching any of these are rejected before scoring — Wikimedia
 * template art, UI icons, flags, and disambiguation/maintenance markers
 * that show up disproportionately often in article image lists and Commons
 * search results, regardless of subject domain.
 *
 * **Every pattern here is anchored, deliberately.** These are tested
 * against filenames, and an unanchored substring is catastrophically
 * over-broad on real Commons titles: `/icon/` discards
 * `File:Silicon_Valley_aerial.jpg`, `/stub/` discards
 * `File:Stubbington_village_green.jpg`, `/symbol/` discards
 * `File:Symbolist_painting_by_Redon.jpg`.
 *
 * Two kinds of anchor, because the two kinds of junk differ:
 *
 *  - **Word-anchored** (`\bicon\b`) for chrome vocabulary that can appear
 *    anywhere in a template filename.
 *  - **Prefix-anchored** (`^File:Gnome\b`) for the icon *themes*. Word
 *    anchoring is not enough for these — `\bgnome\b` still discards
 *    `File:Garden_gnome_collection.jpg` — but every file in those themes is
 *    named after it, and no photograph of a garden gnome starts with the
 *    word. Note these cannot be folded into the `.svg` rule below: the
 *    themes ship PNGs too (`File:Nuvola_apps_kalzium.png`).
 *
 * The Tango and Breeze themes are deliberately NOT listed. Both prefixes
 * are ordinary English words, so a prefix rule discards
 * `File:Tango_dancers_Buenos_Aires.jpg` and `File:Breeze_at_the_beach.jpg`
 * — and there is no anchor that separates the theme from the subject. Both
 * themes are overwhelmingly SVG, so the `.svg` rule covers the common case;
 * a stray theme PNG still has to pass name-relevance scoring afterwards.
 * Discarding real photographs is the worse failure, and it is silent.
 *
 * `isRejected` tests both the raw filename and a copy with `_`/`-` spaced
 * out, so `\b` behaves the way it reads — underscore is a word character in
 * JS regex, so `\bicon\b` would otherwise never match `File:Some_icon.png`.
 */
export const DEFAULT_REJECT_PATTERNS: readonly RegExp[] = [
  // Chrome vocabulary, anywhere in the name.
  /\bflag of\b/i,
  /\bcommons logo\b/i,
  /\bwiki\w* logo\b/i,
  /\bambox\b/i,
  /\bedit clear\b/i,
  /\bquestion book\b/i,
  /\btext html\b/i,
  /\bicons?\b/i,
  /\bsymbols?\b/i,
  /\bpictograms?\b/i,
  /\bmap marker\b/i,
  /\bdisambig\w*\b/i,
  /\bstubs?\b/i,
  // Icon themes, anchored to the start of the filename.
  /^(?:file:)?\s*nuvola\b/i,
  /^(?:file:)?\s*gnome\b/i,
  /^(?:file:)?\s*crystal clear\b/i,
  /^(?:file:)?\s*oojs ui\b/i,
  // Decoration and diagrams rather than photographs.
  /\.svg$/i,
];

/**
 * Common English stopwords that shouldn't count as a distinctive match of
 * an entity's name on their own during Commons search scoring. Callers
 * with a specific domain should extend this with their own generic terms
 * (e.g. category names that recur across many unrelated entities).
 */
export const DEFAULT_GENERIC_WORDS: readonly string[] = [
  "the",
  "and",
  "company",
  "co",
  "inc",
  "all",
  "new",
];

/** Wikimedia asks API clients to back off when replication lag is high. */
export const DEFAULT_MAXLAG_SECONDS = 5;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RETRIES = 2;
