# CLAUDE.md — wikimedia-source

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
- **Tests must never touch the network.** Every test that exercises
  `findWikimediaImage` injects a stub `fetch` via `options.fetch`
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
- This package is **not published to npm** (`"private": true` in
  `package.json`, deliberately). Consumers install it directly from
  GitHub. Do not remove `"private": true` without the owner's explicit
  sign-off.
- No `.nvmrc`, no `engines` pin above Node 24 — see the global CLAUDE.md
  policy on Vercel/Node compatibility (not that this repo deploys to
  Vercel, but the same ceiling applies portfolio-wide).
