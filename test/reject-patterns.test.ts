import { test } from "node:test";
import assert from "node:assert/strict";
import { isRejected } from "../src/api.js";
import { DEFAULT_REJECT_PATTERNS } from "../src/defaults.js";

test("isRejected rejects Wikimedia template art and UI chrome", () => {
  for (const bad of [
    "File:Flag_of_France.svg",
    "File:Commons-logo.svg",
    "File:Question_book-new.svg",
    "File:Symbol_support_vote.svg",
    "File:Disambig_gray.svg",
    "File:Wikidata-logo.svg",
    "File:Ambox_important.svg",
    "File:Crystal_Clear_app_kdict.png",
    "File:Nuvola_apps_kalzium.png", // .svg rule does not catch this one
    "File:Text-html.png",
  ]) {
    assert.equal(isRejected(bad, DEFAULT_REJECT_PATTERNS), true, bad);
  }
});

test("isRejected does NOT reject ordinary photographs whose names merely contain a chrome word", () => {
  // Regression: b7e5edd — the default patterns were unanchored substrings,
  // so /icon/ discarded "Silicon Valley", /stub/ discarded "Stubbington",
  // /symbol/ discarded "Symbolist", /tango/ discarded "Tango dancers",
  // /gnome/ discarded "Garden gnome" and /increase/ discarded "Increase
  // Mather". Nine of ten real filenames were thrown away before scoring,
  // and the caller only ever saw a null.
  for (const good of [
    "File:Silicon_Valley_aerial.jpg",
    "File:Tango_dancers_Buenos_Aires.jpg",
    "File:Garden_gnome_collection.jpg",
    "File:Stubbington_village_green.jpg",
    "File:Steady_Brook_Falls_Newfoundland.jpg",
    "File:Symbolist_painting_by_Redon.jpg",
    "File:Iconostasis_of_Saint_Sophia.jpg",
    "File:Increase_Mather_portrait.jpg",
    "File:Map_of_Tanganyika.jpg",
    "File:Nuvolari_racing_1932.jpg",
    "File:Eddystone_Lighthouse_aerial_photo.jpg",
  ]) {
    assert.equal(isRejected(good, DEFAULT_REJECT_PATTERNS), false, good);
  }
});

test("isRejected matches an anchored pattern across underscores AND spaces", () => {
  // Underscore is a word character in JS regex, so \bicon\b would never
  // match File:Some_icon.png unless the filename is also tested spaced out.
  assert.equal(isRejected("File:Some_icon.png", DEFAULT_REJECT_PATTERNS), true);
  assert.equal(isRejected("File:Some icon.png", DEFAULT_REJECT_PATTERNS), true);
  assert.equal(isRejected("File:Some-icon.png", DEFAULT_REJECT_PATTERNS), true);
});

test("isRejected still honours a caller pattern written against the raw filename", () => {
  // Patterns are tested against both forms, so pre-existing caller regexes
  // using underscores keep working alongside the anchored defaults.
  assert.equal(isRejected("File:Flag_of_France.png", [/flag_of/i]), true);
});
