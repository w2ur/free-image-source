import { test } from "node:test";
import assert from "node:assert/strict";
import { isRejected } from "../src/api.js";
import { DEFAULT_REJECT_PATTERNS } from "../src/defaults.js";

test("isRejected rejects a known-bad filename", () => {
  assert.equal(isRejected("File:Flag_of_France.svg", DEFAULT_REJECT_PATTERNS), true);
  assert.equal(isRejected("File:Commons-logo.svg", DEFAULT_REJECT_PATTERNS), true);
  assert.equal(isRejected("File:Question_book-new.svg", DEFAULT_REJECT_PATTERNS), true);
});

test("isRejected passes a good filename", () => {
  assert.equal(
    isRejected("File:Eddystone_Lighthouse_aerial_photo.jpg", DEFAULT_REJECT_PATTERNS),
    false
  );
});
