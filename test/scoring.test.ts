import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreImage, NO_MATCH_SCORE, REJECTED_SCORE } from "../src/scoring.js";
import { DEFAULT_REJECT_PATTERNS, DEFAULT_GENERIC_WORDS } from "../src/defaults.js";

const baseOptions = {
  rejectPatterns: DEFAULT_REJECT_PATTERNS,
  genericWords: new Set(DEFAULT_GENERIC_WORDS),
};

test("scoreImage prefers a relevant, keyword-matching candidate over an irrelevant one", () => {
  const keywords = /\b(lighthouse|beacon)\b/i;

  const relevant = scoreImage("Eddystone_Lighthouse_at_sunset.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords,
    strict: false,
  });

  const irrelevant = scoreImage("Eddystone_railway_station.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords,
    strict: false,
  });

  assert.ok(relevant > irrelevant);
  assert.ok(relevant > 0);
});

test("scoreImage rejects a filename matching a reject pattern outright", () => {
  const score = scoreImage("File:Flag_of_Cornwall.svg", "Eddystone Lighthouse", {
    ...baseOptions,
    strict: false,
  });
  assert.equal(score, REJECTED_SCORE);
});

test("scoreImage in strict mode requires a distinctive name part", () => {
  // "Lighthouse" alone is too generic in this scenario — a real caller
  // would add it to genericWords for their domain. Here it still matches
  // via "Eddystone", which is distinctive.
  const noMatch = scoreImage("Some_unrelated_photo.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    strict: true,
  });
  assert.equal(noMatch, NO_MATCH_SCORE);

  const match = scoreImage("Eddystone_photo.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    strict: true,
  });
  assert.ok(match > NO_MATCH_SCORE);
});

test("scoreImage in strict mode also requires a keyword match when keywords is supplied", () => {
  const keywords = /\b(lighthouse|beacon)\b/i;

  const nameMatchOnly = scoreImage("Eddystone_railway_station.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords,
    strict: true,
  });
  assert.equal(nameMatchOnly, NO_MATCH_SCORE);

  const nameAndKeywordMatch = scoreImage("Eddystone_Lighthouse_beacon.jpg", "Eddystone Lighthouse", {
    ...baseOptions,
    keywords,
    strict: true,
  });
  assert.ok(nameAndKeywordMatch > NO_MATCH_SCORE);
});
