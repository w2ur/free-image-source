---
name: "wikimedia-source"
tagline_fr: "Trouver une image Wikimedia librement réutilisable, avec son attribution."
tagline_en: "Find a freely-licensed Wikimedia image for a thing, with attribution."
about_en: "Find a freely-licensed Wikimedia image for a thing, with attribution. Zero dependencies, TypeScript, ESM."
---

# wikimedia-source

A small, zero-dependency TypeScript module that finds a freely-licensed
image on Wikipedia/Wikimedia Commons for a given entity, and captures the
attribution needed to credit it correctly.

It is domain-neutral: it knows nothing about breweries, hops, cats, or
lighthouses. You supply the entity's id and name, and optionally a title
map, a relevance-keyword regex, and a Commons search-query builder — the
module handles the API calls, license filtering, junk-image rejection, and
scoring.

## How it looks for an image

Three strategies, tried in order until one produces an acceptable,
allowed-license candidate:

1. **Article image list** — if you know the entity's Wikipedia article
   title, fetch every image on that article, score them by relevance, and
   return the best one with an allowed license.
2. **Article thumbnail** — if (1) found nothing usable, fall back to the
   article's main thumbnail image (its license isn't individually checked,
   so it's attributed as `"See Wikipedia"`).
3. **Commons search** — if no article title is known (or both of the above
   came up empty), search Wikimedia Commons directly by name and pick the
   best scored, license-checked result.

Along the way: filenames matching a broad, domain-neutral reject list
(icons, flags, template art, disambiguation markers, `.svg` decoration) are
discarded before scoring, and only files whose license matches an allowlist
(CC-BY, CC-BY-SA, CC0, public domain, GFDL by default) are ever returned.

## Install

Not published to npm. Install directly from GitHub:

```sh
npm install github:w2ur/wikimedia-source
```

or clone it and `npm run build` to get a local `dist/`.

## Usage

```ts
import { findWikimediaImage } from "wikimedia-source";

const result = await findWikimediaImage(
  "eddystone-lighthouse",
  "Eddystone Lighthouse",
  {
    userAgent: "MyLighthouseApp/1.0 (https://example.org; contact@example.org)",
    wikipediaTitles: { "eddystone-lighthouse": "Eddystone_Lighthouse" },
    keywords: /\b(lighthouse|beacon)\b/i,
    buildSearchQuery: (name) => `${name} lighthouse`,
  }
);

if (result) {
  console.log(result.imageUrl);
  // { id, source: "wikimedia", sourceUrl, license, author, fileTitle }
  console.log(result.attribution);
}
```

`findWikimediaImage(id, name, options)` returns
`{ imageUrl, attribution } | null`.

## Options

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `userAgent` | **yes** | — | See below. No default is provided. |
| `wikipediaTitles` | no | none | `Record<id, title>` or `(id, name) => title \| undefined`. Enables strategies 1 and 2. |
| `keywords` | no | none | Regex confirming a filename is relevant to your domain. Gates acceptance during Commons search and boosts scoring everywhere. Without it, Commons search relies on name matching alone, which is noisier. |
| `buildSearchQuery` | no | `(name) => name` | Builds the Commons search string from the entity's display name. Callers typically append a domain qualifier, e.g. `` `${name} lighthouse` ``. |
| `allowedLicenses` | no | CC-BY(-SA), CC0, public domain, GFDL | License substrings (lowercased, hyphen-normalized) that are acceptable. |
| `rejectPatterns` | no | broad, domain-neutral list | Filenames matching any pattern are discarded before scoring. |
| `genericWords` | no | small English stopword set | Words too generic to count as a distinctive name match during Commons search. Extend with your own domain's generic terms. |
| `skipCommonsSearch` | no | none | Ids for which Commons search (strategy 3) should never run — for entities where free-text search reliably returns unrelated results no heuristic can filter. |
| `fetch` | no | global `fetch` | Injectable, mainly for tests. |

## User-Agent

**`userAgent` is required and has no default.** Wikimedia's
[User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy)
requires every API client to identify itself with a descriptive string that
includes what the client is and a way to contact its operator — generic or
missing User-Agents are the primary thing Wikimedia rate-limits and blocks.
Shipping a made-up default here would mean every consumer of this package
identifies itself identically to Wikimedia, defeating the point of the
policy. Supply your own, e.g.:

```
"MyApp/1.0 (https://example.org; contact@example.org)"
```

## Tests

`npm test` builds, then runs 14 tests under `node --test` — the Node
built-in runner, no test-framework dependency.

**No test touches the network.** Every test that exercises
`findWikimediaImage` injects a stub `fetch` through `options.fetch`, and
that stub throws on any request it does not recognise. An unexpected API
call fails the suite loudly instead of passing quietly against live
Wikimedia — which also means the suite tells you when a refactor changes
*which* endpoints get called, not just what comes back.

## Stability

`findWikimediaImage` is the entire public API, and its signature is
settled. The package is versioned `0.1.0` and installed from a git ref
rather than npm, so pin a commit if you need reproducible builds.

---

Made with care by [William](https://william.revah.paris)
