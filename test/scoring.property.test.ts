import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { scoreImage, NO_MATCH_SCORE, REJECTED_SCORE } from "../src/scoring.js";
import { isLicenseAllowed, isRejected, decodeEntities, spaced } from "../src/api.js";
import { DEFAULT_ALLOWED_LICENSES, DEFAULT_REJECT_PATTERNS, DEFAULT_GENERIC_WORDS } from "../src/defaults.js";

const RUNS = 1000;

const baseOptions = {
  rejectPatterns: DEFAULT_REJECT_PATTERNS,
  genericWords: new Set(DEFAULT_GENERIC_WORDS),
};

/** A plausible Commons filename: word-ish parts joined by underscores. */
const filename = fc
  .array(fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,11}$/), { minLength: 1, maxLength: 5 })
  .chain((parts) =>
    fc.constantFrom(".jpg", ".jpeg", ".png", ".svg", ".tif").map((ext) => `File:${parts.join("_")}${ext}`)
  );

const entityName = fc
  .array(fc.stringMatching(/^[A-Za-z]{3,12}$/), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(" "));

test("property: scoreImage is total — never NaN, never undefined, always a finite number", () => {
  fc.assert(
    fc.property(filename, entityName, fc.boolean(), (file, name, strict) => {
      const score = scoreImage(file, name, { ...baseOptions, strict });
      assert.ok(Number.isFinite(score), `not finite: ${score}`);
    }),
    { numRuns: RUNS }
  );
});

test("property: a rejected filename always scores REJECTED_SCORE, whatever else is true of it", () => {
  fc.assert(
    fc.property(filename, entityName, fc.boolean(), (file, name, strict) => {
      if (!isRejected(file, DEFAULT_REJECT_PATTERNS)) return true;
      return scoreImage(file, name, { ...baseOptions, strict }) === REJECTED_SCORE;
    }),
    { numRuns: RUNS }
  );
});

test("property: strict mode is never more permissive than loose mode", () => {
  // Strict adds requirements, so anything strict accepts, loose accepts too.
  fc.assert(
    fc.property(filename, entityName, (file, name) => {
      const strict = scoreImage(file, name, { ...baseOptions, strict: true });
      const loose = scoreImage(file, name, { ...baseOptions, strict: false });
      if (strict > NO_MATCH_SCORE) return loose > NO_MATCH_SCORE;
      return true;
    }),
    { numRuns: RUNS }
  );
});

test("property: supplying keywords never makes a candidate score lower in loose mode", () => {
  const keywords = /\b(lighthouse|beacon)\b/i;
  fc.assert(
    fc.property(filename, entityName, (file, name) => {
      const without = scoreImage(file, name, { ...baseOptions, strict: false });
      const with_ = scoreImage(file, name, { ...baseOptions, keywords, strict: false });
      return with_ >= without;
    }),
    { numRuns: RUNS }
  );
});

test("property: isRejected is stable under the underscore/space normalization it performs", () => {
  fc.assert(
    fc.property(filename, (file) => {
      return (
        isRejected(file, DEFAULT_REJECT_PATTERNS) ===
        isRejected(spaced(file), DEFAULT_REJECT_PATTERNS)
      );
    }),
    { numRuns: RUNS }
  );
});

const licenseFamily = fc.constantFrom("cc-by", "cc-by-sa", "cc0", "gfdl", "public domain");
const restrictiveModifier = fc.constantFrom("nc", "nd", "nc-nd", "nc-sa");
const version = fc.constantFrom("1.0", "2.0", "2.5", "3.0", "4.0");

test("property: an allowed family plus a version is always allowed", () => {
  fc.assert(
    fc.property(licenseFamily, version, (family, v) =>
      isLicenseAllowed(`${family} ${v}`, DEFAULT_ALLOWED_LICENSES)
    ),
    { numRuns: RUNS }
  );
});

test("property: a restrictive modifier is NEVER admitted by a permissive family prefix", () => {
  // Regression: b7e5edd — naive substring containment let "CC BY-NC-ND 4.0"
  // satisfy the "cc-by" allowlist entry, so a non-commercial, no-derivatives
  // image passed the free-license gate.
  fc.assert(
    fc.property(restrictiveModifier, version, (mod, v) => {
      const license = `CC BY-${mod.toUpperCase()} ${v}`;
      return isLicenseAllowed(license, DEFAULT_ALLOWED_LICENSES) === false;
    }),
    { numRuns: RUNS }
  );
});

test("property: isLicenseAllowed ignores case, whitespace and separator style", () => {
  fc.assert(
    fc.property(licenseFamily, version, (family, v) => {
      const canonical = isLicenseAllowed(`${family}-${v}`, DEFAULT_ALLOWED_LICENSES);
      const noisy = isLicenseAllowed(
        `  ${family.toUpperCase().replace(/-/g, " ")}   ${v} `,
        DEFAULT_ALLOWED_LICENSES
      );
      return canonical === noisy;
    }),
    { numRuns: RUNS }
  );
});

test("property: an empty allowlist admits nothing", () => {
  fc.assert(
    fc.property(fc.string(), (s) => isLicenseAllowed(s, []) === false),
    { numRuns: RUNS }
  );
});

test("property: decodeEntities never leaves a bare ampersand-entity it claims to know", () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom("&amp;", "&lt;", "&gt;", "&quot;", "&#39;", "&#x27;", "text "), {
        maxLength: 8,
      }),
      (parts) => {
        const decoded = decodeEntities(parts.join(""));
        return !/&(amp|lt|gt|quot|#39|#x27);/.test(decoded);
      }
    ),
    { numRuns: RUNS }
  );
});
