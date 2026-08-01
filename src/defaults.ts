/** Permissive, freely-reusable license substrings (lowercase, hyphen-normalized). */
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
 */
export const DEFAULT_REJECT_PATTERNS: readonly RegExp[] = [
  /flag_of/i,
  /commons-logo/i,
  /wiki-logo/i,
  /wikidata-logo/i,
  /crystal_clear/i,
  /ambox/i,
  /edit-clear/i,
  /question_book/i,
  /text-html/i,
  /icon/i,
  /symbol/i,
  /pictogram/i,
  /map_marker/i,
  /increase/i,
  /decrease/i,
  /steady/i,
  /nuvola/i,
  /gnome/i,
  /tango/i,
  /disambig/i,
  /stub/i,
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
