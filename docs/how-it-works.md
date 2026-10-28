# How it works

Back to the [README](../README.md).

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

## On the name

Wikimedia Commons is the only backend today. The package is named for the
job rather than the provider so that adding another free-licensed source
later would not require renaming it — but if you need Wikimedia
specifically, that is exactly what you get.

## Tests

`npm test` builds, then runs the suite under `node --test` — the Node
built-in runner, no test-framework dependency. It includes property tests
(`fast-check`, run count set by `RUNS` in
[`test/scoring.property.test.ts`](../test/scoring.property.test.ts)) over
the license gate and the scorer.

**No test touches the network.** Every test that exercises
`findFreeImage` injects a stub `fetch` through `options.fetch`, and
that stub throws on any request it does not recognise. An unexpected API
call fails the suite loudly instead of passing quietly against live
Wikimedia — which also means the suite tells you when a refactor changes
*which* endpoints get called, not just what comes back.
