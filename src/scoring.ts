import { isRejected, spaced } from "./api.js";

/** Score below which a candidate is discarded outright. */
export const NO_MATCH_SCORE = -100;
export const REJECTED_SCORE = -999;

export interface ScoreOptions {
  rejectPatterns: readonly RegExp[];
  genericWords: ReadonlySet<string>;
  keywords?: RegExp;
  /**
   * Strict mode is used for Commons search results, where a filename isn't
   * already known to live on the right article: it requires a distinctive
   * (non-generic) name part to match, and — if `keywords` is supplied — a
   * domain keyword too. Non-strict mode (article image lists) only
   * requires a name-part match, since the image is already on a
   * known-correct page.
   */
  strict: boolean;
}

function nameParts(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[\s\-']+/)
    .filter((p) => p.length > 2);
}

export function scoreImage(
  filename: string,
  entityName: string,
  options: ScoreOptions
): number {
  if (isRejected(filename, options.rejectPatterns)) return REJECTED_SCORE;

  const lower = filename.toLowerCase();
  const parts = nameParts(entityName);
  // `spaced` because underscore is a word character in JS regex, so a
  // caller-authored /\bword\b/ would otherwise never match File:A_Word.jpg.
  const matchesKeywords = options.keywords?.test(spaced(lower)) ?? false;

  if (options.strict) {
    // Require a distinctive (non-generic) name part to match — this
    // prevents e.g. a single common word from matching unrelated subjects.
    const distinctiveParts = parts.filter((p) => !options.genericWords.has(p));
    const distinctiveMatch = distinctiveParts.some((part) => lower.includes(part));
    if (!distinctiveMatch) return NO_MATCH_SCORE;

    // If a domain-keyword regex was supplied, the filename must match it too.
    if (options.keywords && !matchesKeywords) return NO_MATCH_SCORE;
  } else {
    const nameMatch = parts.some((part) => lower.includes(part));
    if (!nameMatch) return NO_MATCH_SCORE;
  }

  let score = 0;

  // Boost candidates that also match the caller's domain keywords.
  if (matchesKeywords) score += 10;

  // Prefer JPG (usually photos) over PNG (usually graphics).
  if (/\.jpe?g$/i.test(lower)) score += 2;

  // Deprioritize logos.
  if (/logo/i.test(lower)) score -= 5;

  // Prefer larger, more descriptive filenames (usually real photos, not icons).
  if (lower.length > 30) score += 1;

  return score;
}
