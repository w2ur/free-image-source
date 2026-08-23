# CLAUDE.md — free-image-source

## Project Overview

A small, focused TypeScript library: given an id, a display name, and a
Wikimedia-compliant User-Agent, find a freely-licensed image on
Wikipedia/Wikimedia Commons and return it with attribution. Domain-neutral
by design — see the "Options" table in `README.md`.

## Tech Stack

- TypeScript, ESM (`"type": "module"`), Node ≥20
- **Zero runtime dependencies.** It uses only the global `fetch`. Do not
  add a runtime dependency without updating this file and the README to
  explain why.
- Build: `tsc` (see `tsconfig.json`; `rootDir` is the project root, so
  build output lands at `dist/src/` and `dist/test/`).
- Ships a CLI (`src/cli.ts` -> `bin: free-image-source`). The CLI supplies
  its own User-Agent because it *is* the client; the library still refuses
  to invent one for callers.

## User-Facing Language

English.

## Development

```sh
npm install
npm run build       # tsc -> dist/
npm run typecheck   # tsc --noEmit
npm test            # builds, then runs dist/test/ with node --test
```

## Testing

- `node --test`, the Node.js built-in runner. No test framework dependency.
- `fast-check` is a **devDependency only** — property tests over the pure
  transforms (`scoreImage`, `isLicenseAllowed`, `decodeEntities`). It never
  reaches the published bundle; the zero-runtime-dependency rule stands.
- **Tests must never touch the network.** Every test that exercises
  `findFreeImage` injects a stub `fetch` via `options.fetch`
  (see `test/helpers.ts`, `createFetchStub`). Do not write a test that
  relies on the global `fetch` reaching `*.wikipedia.org` or
  `commons.wikimedia.org`.
- `test/helpers.ts` is not itself a test file (no `test()` calls); it holds
  the shared stub-fetch machinery.

## Project-Specific Rules

- **The domain-specific maps and regexes are caller options by design, not
  gaps to fill in.** `wikipediaTitles`, `keywords`, `buildSearchQuery`,
  `genericWords`, and `skipCommonsSearch` all default to empty/neutral —
  do not add a beer, hop, or any other domain default. If you need
  something more specific for a particular consumer, that belongs in the
  consumer's own code, not in this package.
- `src/` must stay free of any subject-matter vocabulary. If a change
  introduces a domain-specific word or regex into `src/`, it's a
  regression of the point of this extraction — move it to a caller option
  instead.
- **The license gate is the product.** There must be no code path that
  returns an image whose license was not checked against `allowedLicenses`.
  Strategy 2 (the article lead image) violated this until 0.2.0 by
  returning the thumbnail with `license: "See Wikipedia"`; that is what the
  regression tests in `test/find-wikimedia-image.test.ts` pin. If a change
  makes any strategy return a candidate without passing `isUsableFile` or
  an equivalent check, it is a regression of the point of the package.
- **Default `rejectPatterns` must stay anchored.** Unanchored substrings
  discard real photographs silently — `/icon/` eats "Silicon Valley",
  `/stub/` eats "Stubbington". Word-anchor chrome vocabulary; prefix-anchor
  icon themes; and never add a theme whose prefix is an ordinary English
  word (see the Tango/Breeze note in `src/defaults.ts`).
- Published to npm as `free-image-source`. `prepublishOnly` builds and runs
  the suite, so a publish cannot ship a failing build.
