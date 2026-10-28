<!-- portfolio
name: "Free Image Source"
tagline_fr: "Ne publiez jamais une image dont vous n'avez pas vérifié la licence."
tagline_en: "Never publish an image whose license you haven't verified."
about_en: "Find a freely-licensed image on Wikimedia Commons for anything, with the attribution needed to publish it. Zero dependencies, TypeScript, ESM."
facts_fr: "3 stratégies de recherche, 6 licences autorisées, 46 tests sans réseau."
facts_en: "3 search strategies, 6 allowed licenses, 46 tests that never touch the network."
-->

# Free Image Source

Find a freely-licensed image on Wikipedia/Wikimedia Commons for anything,
and get back the attribution you need to publish it legally.

**Status:** maintained · public · [on npm](https://www.npmjs.com/package/free-image-source)

[![CI](https://github.com/w2ur/free-image-source/actions/workflows/ci.yml/badge.svg)](https://github.com/w2ur/free-image-source/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/free-image-source)](https://www.npmjs.com/package/free-image-source)
[![npm downloads](https://img.shields.io/npm/dm/free-image-source)](https://www.npmjs.com/package/free-image-source)
[![node](https://img.shields.io/node/v/free-image-source)](package.json)
[![license](https://img.shields.io/npm/l/free-image-source)](LICENSE)

```sh
npx free-image-source "Eddystone Lighthouse"
```

```
https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/Phare-d-Eddystone-Rocks.jpg/960px-…
Photo by Pline, Public domain, via Wikimedia Commons
```

(A live run on 2026-10-28; the pick follows what Wikimedia hosts that day.)

It was pulled out of [I P Yeah!](https://william.revah.paris/en/stories/ipa-vibecoding/),
a pun turned illustrated directory, whose pipeline had a script fetching
images from Wikimedia Commons. One of two pieces pulled out of my own apps,
published for whoever needs them.

## Why

The search is the easy half. The hard half is that Wikimedia hosts plenty of
images you **cannot** reuse: fair-use album covers, non-commercial licenses,
all-rights-reserved press photos. This library will not return them. Every
result has been checked against a license allowlist, and arrives with its
author, license, license URL, and any non-copyright restrictions attached.

- **Zero runtime dependencies.** Global `fetch`, nothing else.
- **No unverified results.** There is no code path that returns an image
  whose license was not checked.
- **Domain-neutral.** It knows nothing about lighthouses, cats, or
  cathedrals. You supply the vocabulary; it supplies the plumbing.

## Install and use

```sh
npm install free-image-source
```

```ts
import { findFreeImage, formatAttribution } from "free-image-source";

const result = await findFreeImage("eddystone-lighthouse", "Eddystone Lighthouse", {
  userAgent: "MyLighthouseApp/1.0 (https://example.org; contact@example.org)",
  keywords: /\b(lighthouse|beacon)\b/i,
});

if (result) {
  console.log(result.imageUrl);
  console.log(formatAttribution(result.attribution));
}
```

**`userAgent` is required and has no default**: Wikimedia's
[User-Agent policy](https://meta.wikimedia.org/wiki/User-Agent_policy) asks
every client to identify itself and its operator. **Read `restrictions`** on
the returned attribution: trademarks and personality rights are flagged
separately, and a permissive license does not clear them.

## Documentation

- [API reference](docs/api.md): the `Attribution` shape, every option, the CLI and its exit codes, stability.
- [How it works](docs/how-it-works.md): the three search strategies, the User-Agent rationale, the name, the tests.

## Run locally

Node 20 or later.

```sh
npm install
npm run typecheck
npm test            # builds, then runs the suite with node --test; no test touches the network
```

## Publish

Published to npm as `free-image-source`. `prepublishOnly` builds and runs
the suite, so a publish cannot ship a failing build.

## License

MIT — see [LICENSE](LICENSE).

---

Made with care by [William](https://william.revah.paris)
