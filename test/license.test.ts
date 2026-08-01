import { test } from "node:test";
import assert from "node:assert/strict";
import { isLicenseAllowed } from "../src/api.js";
import { DEFAULT_ALLOWED_LICENSES } from "../src/defaults.js";

test("isLicenseAllowed accepts a known-permissive license", () => {
  assert.equal(isLicenseAllowed("CC BY-SA 4.0", DEFAULT_ALLOWED_LICENSES), true);
  assert.equal(isLicenseAllowed("Public domain", DEFAULT_ALLOWED_LICENSES), true);
  assert.equal(isLicenseAllowed("CC0 1.0 Universal", DEFAULT_ALLOWED_LICENSES), true);
});

test("isLicenseAllowed rejects a restrictive or unknown license", () => {
  assert.equal(isLicenseAllowed("All rights reserved", DEFAULT_ALLOWED_LICENSES), false);
  assert.equal(isLicenseAllowed("CC BY-NC-ND 4.0", DEFAULT_ALLOWED_LICENSES), false);
  assert.equal(isLicenseAllowed("Unknown", DEFAULT_ALLOWED_LICENSES), false);
});

test("isLicenseAllowed respects a caller-supplied allowlist override", () => {
  const custom = ["cc-by-nc"];
  assert.equal(isLicenseAllowed("CC BY-NC 2.0", custom), true);
  // A license accepted by the default allowlist is rejected once overridden.
  assert.equal(isLicenseAllowed("CC0", custom), false);
});
