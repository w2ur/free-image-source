---
name: "Free Image Source"
tagline_fr: "Ne publiez jamais une image dont vous n'avez pas vérifié la licence."
tagline_en: "Never publish an image whose license you haven't verified."
about_en: "Find a freely-licensed image on Wikimedia Commons for anything, with the attribution needed to publish it. Zero dependencies, TypeScript, ESM."
facts_fr: "3 stratégies de recherche, 6 licences autorisées, 46 tests sans réseau."
facts_en: "3 search strategies, 6 allowed licenses, 46 tests that never touch the network."
---

# free-image-source

[![CI](https://github.com/w2ur/free-image-source/actions/workflows/ci.yml/badge.svg)](https://github.com/w2ur/free-image-source/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/free-image-source)](https://www.npmjs.com/package/free-image-source)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](https://github.com/w2ur/free-image-source/blob/main/package.json)

Find a freely-licensed image on Wikipedia/Wikimedia Commons for anything —
and get back the attribution you need to publish it legally.

The search is the easy half. The hard half is that Wikimedia hosts plenty of
images you **cannot** reuse: fair-use album covers, non-commercial licenses,
all-rights-reserved press photos. This library will not return them. Every
result has been checked against a license allowlist, and arrives with its
author, license, license URL, and any non-copyright restrictions attached.

```sh
npx free-image-source "Eddystone Lighthouse"
```

```
https://upload.wikimedia.org/wikipedia/commons/2/23/Eddystone_Lighthouse_…jpg
Photo by Andy Talbot, CC BY-SA 2.0, via Wikimedia Commons
```

- **Zero runtime dependencies.** Global `fetch`, nothing else.
- **No unverified results.** There is no code path that returns an image
  whose license was not checked.
- **Domain-neutral.** It knows nothing about lighthouses, cats, or
  cathedrals. You supply the vocabulary; it supplies the plumbing.

**On the name:** Wikimedia Commons is the only backend today. The package is
named for the job rather than the provider so that adding another
free-licensed source later would not require renaming it — but if you need
Wikimedia specifically, that is exactly what you get.

## Install

```sh
npm install free-image-source
```

## Usage

```ts
import { findFreeImage, formatAttribution } from "free-image-source";

const result = await findFreeImage(
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
  console.log(formatAttribution(result.attribution));
  // "Photo by Andy Talbot, CC BY-SA 2.0, via Wikimedia Commons"
}
```

`findFreeImage(id, name, options)` returns
`{ imageUrl, attribution } | null`.

### Attribution

```ts
interface Attribution {
  id: string;
  source: "wikimedia";
  sourceUrl: string;        // the file's own page on Commons
  license: string;          // "CC BY-SA 4.0"
  licenseCode?: string;     // "cc-by-sa-4.0" — machine-readable
  licenseUrl?: string;      // the license deed
  author: string;           // HTML stripped, entities decoded
  authorUrl?: string;       // when the credit links out
  credit?: string;          // "Own work", a source URL, ...
  restrictions?: string;    // trademark, personality rights — see below
  fileTitle: string;
}
```

`formatAttribution(attribution, { format: "html" })` produces the same
credit line with the author, license, and source hyperlinked.

**`restrictions` is worth reading.** Commons flags non-copyright
restrictions — trademarks, personality rights, protected insignia —
separately from the license. A permissive license does not clear them. The
field is surfaced rather than swallowed so you can act on it; it is empty
for most files.

### CLI

```sh
npx free-image-source "Maine Coon" --keywords "cat|feline" --json
npx free-image-source "Tour Eiffel" --lang fr
```

Exits `0` on a hit, `1` when nothing acceptable was found, `2` on a usage
error.

## How it looks for an image

Three strategies, tried in order until one produces an acceptable,
allowed-license candidate:

1. **Article image list** — if you know the entity's Wikipedia article
   title, fetch every image on that article, score them by relevance, and
   return the best one with an allowed license.
2. **Article lead image** — if (1) found nothing usable, try the article's
   own lead image. It goes through the same reject list and the same
   license allowlist as everything else, and is skipped if it fails either.
3. **Commons search** — if no article title is known (or both of the above
   came up empty), search Wikimedia Commons directly by name and pick the
   best scored, license-checked result.

Along the way, filenames matching a broad, domain-neutral reject list
(Wikimedia template art, UI icon themes, flags, disambiguation markers,
`.svg` decoration) are discarded before scoring.

Each strategy is at most **two HTTP requests**: candidate metadata is
fetched in a single batched call rather than one request per candidate, and
Commons search returns its results with license metadata already attached.

## Options

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `userAgent` | **yes** | — | See below. No default is provided. |
| `wikipediaTitles` | no | none | `Record<id, title>` or `(id, name) => title \| undefined`. Enables strategies 1 and 2. |
| `lang` | no | `"en"` | Wikipedia language edition. Commons is shared and always queried at commons.wikimedia.org. |
| `keywords` | no | none | Regex confirming a filename is relevant to your domain. Gates acceptance during Commons search and boosts scoring everywhere. Without it, Commons search relies on name matching alone, which is noisier. |
| `buildSearchQuery` | no | `(name) => name` | Builds the Commons search string from the entity's display name. Callers typically append a domain qualifier, e.g. `` `${name} lighthouse` ``. |
| `allowedLicenses` | no | CC-BY(-SA), CC0, public domain, GFDL | License codes that are acceptable. Matched against Wikimedia's machine-readable `License` value when present. |
| `rejectPatterns` | no | broad, domain-neutral list | Filenames matching any pattern are discarded before scoring. Each is tested against both the raw filename and a copy with `_`/`-` spaced out, so `\b`-anchored patterns work. |
| `genericWords` | no | small English stopword set | Words too generic to count as a distinctive name match during Commons search. Extend with your own domain's generic terms. |
| `skipCommonsSearch` | no | none | Ids for which Commons search (strategy 3) should never run — for entities where free-text search reliably returns unrelated results no heuristic can filter. |
| `timeoutMs` | no | `10000` | Per-request timeout. `0` disables it. |
| `maxRetries` | no | `2` | Retries for requests Wikimedia asked us to back off from (429/503/`maxlag`). `Retry-After` is honoured. Permanent errors are never retried. |
| `signal` | no | none | `AbortSignal` for caller-side cancellation, combined with the timeout. |
| `wikipediaApiUrl` / `commonsApiUrl` | no | derived | Full endpoint overrides. |
| `fetch` | no | global `fetch` | Injectable, mainly for tests. |

### Domain vocabulary belongs to you

`wikipediaTitles`, `keywords`, `buildSearchQuery`, `genericWords`, and
`skipCommonsSearch` all default to empty. That is the design, not a gap:
the package stays useful for lighthouses and Maine Coons alike because it
carries no subject-matter vocabulary of its own. Domain specifics live in
your code.

## User-Agent

**`userAgent` is required and has no default.** Wikimedia's
[User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy)
requires every API client to identify itself with a descriptive string that
includes what the client is and a way to contact its operator — generic or
missing User-Agents are the primary thing Wikimedia rate-limits and blocks.
Shipping a made-up default would mean every consumer identifies itself
identically, defeating the point of the policy. Supply your own:

```
"MyApp/1.0 (https://example.org; contact@example.org)"
```

It is sent as both `User-Agent` and `Api-User-Agent`, because browsers
forbid scripts from setting `User-Agent` and drop it silently —
`Api-User-Agent` is Wikimedia's documented channel for that case. Requests
also carry `maxlag=5`, so Wikimedia can shed load rather than serve it when
its replicas are lagging.

## Tests

`npm test` builds, then runs 46 tests under `node --test` — the Node
built-in runner, no test-framework dependency. Includes property tests
(`fast-check`, 1000 runs each) over the license gate and the scorer.

**No test touches the network.** Every test that exercises
`findFreeImage` injects a stub `fetch` through `options.fetch`, and
that stub throws on any request it does not recognise. An unexpected API
call fails the suite loudly instead of passing quietly against live
Wikimedia — which also means the suite tells you when a refactor changes
*which* endpoints get called, not just what comes back.

## Stability

`findFreeImage` and `formatAttribution` are the public API. Versioned
`0.2.0` — the shape is settled, but minor versions may still add fields to
`Attribution` before 1.0.

---

Made with care by [William](https://william.revah.paris)
