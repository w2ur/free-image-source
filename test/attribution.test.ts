import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAttribution } from "../src/attribution.js";
import type { Attribution } from "../src/types.js";

const base: Attribution = {
  id: "eddystone",
  source: "wikimedia",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Eddystone.jpg",
  license: "CC BY-SA 2.0",
  licenseCode: "cc-by-sa-2.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
  author: "Anna Irene",
  authorUrl: "https://commons.wikimedia.org/wiki/User:AnnaIrene",
  fileTitle: "File:Eddystone.jpg",
};

test("formatAttribution builds a plain credit line", () => {
  assert.equal(
    formatAttribution(base),
    "Photo by Anna Irene, CC BY-SA 2.0, via Wikimedia Commons"
  );
});

test("formatAttribution links the author, license and source in html mode", () => {
  const html = formatAttribution(base, { format: "html" });
  assert.match(html, /<a href="https:\/\/commons\.wikimedia\.org\/wiki\/User:AnnaIrene"[^>]*>Anna Irene<\/a>/);
  assert.match(html, /<a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/2\.0"[^>]*>CC BY-SA 2\.0<\/a>/);
  assert.match(html, /via Wikimedia Commons<\/a>/);
});

test("formatAttribution escapes html in author names", () => {
  const html = formatAttribution({ ...base, author: 'A & B <script>' }, { format: "html" });
  assert.ok(!html.includes("<script>"));
  assert.match(html, /A &amp; B/);
});

test("formatAttribution omits the author clause when there is no author", () => {
  const line = formatAttribution({ ...base, author: "Unknown", authorUrl: undefined });
  assert.ok(!line.includes("Unknown"));
  assert.ok(line.startsWith("Eddystone.jpg"));
});

test("formatAttribution does not demand a license notice for public domain works", () => {
  const pd = formatAttribution({
    ...base,
    license: "Public domain",
    licenseCode: "pd",
    licenseUrl: undefined,
  });
  assert.equal(pd, "Photo by Anna Irene, Public domain, via Wikimedia Commons");
  // Control: a CC work still gets its license linked, so the branch above
  // is a real branch and not the only path through the function.
  assert.match(formatAttribution(base, { format: "html" }), /<a href="https:\/\/creativecommons/);
});

test("formatAttribution can omit the source clause", () => {
  assert.equal(
    formatAttribution(base, { includeSource: false }),
    "Photo by Anna Irene, CC BY-SA 2.0"
  );
});
