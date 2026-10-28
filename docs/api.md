# API reference

Back to the [README](../README.md).

## `findFreeImage(id, name, options)`

Returns `{ imageUrl, attribution } | null`.

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

## Attribution

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

## Options

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `userAgent` | **yes** | — | See [User-Agent](how-it-works.md#user-agent). No default is provided. |
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

## CLI

```sh
npx free-image-source "Eddystone Lighthouse"
npx free-image-source "Maine Coon" --keywords "cat|feline" --json
npx free-image-source "Tour Eiffel" --lang fr
```

Exits `0` on a hit, `1` when nothing acceptable was found, `2` on a usage
error.

## Stability

`findFreeImage` and `formatAttribution` are the public API. Before 1.0
(the current version is on the npm badge in the README), the shape is
settled, but minor versions may still add fields to `Attribution`.
