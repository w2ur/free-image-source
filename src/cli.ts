#!/usr/bin/env node
import { findWikimediaImage } from "./index.js";
import { formatAttribution } from "./attribution.js";

const USAGE = `wikimedia-source — find a freely-licensed Wikimedia image, with attribution

Usage:
  npx wikimedia-source <name> [options]

Options:
  --lang <code>       Wikipedia language edition (default: en)
  --title <title>     Known Wikipedia article title, enables the article strategies
  --keywords <regex>  Relevance regex, e.g. "lighthouse|beacon"
  --query <template>  Commons search query; {name} is substituted
  --user-agent <ua>   Override the User-Agent (see the User-Agent policy)
  --json              Emit the full result as JSON
  -h, --help          Show this help

Examples:
  npx wikimedia-source "Eddystone Lighthouse"
  npx wikimedia-source "Maine Coon" --keywords "cat|feline" --json
`;

/**
 * The CLI is a real Wikimedia client in its own right, so it identifies
 * itself as one. Library callers still have to supply their own — see the
 * User-Agent policy section of the README for why there is no default there.
 */
const CLI_USER_AGENT =
  "wikimedia-source-cli/0.2 (https://github.com/w2ur/wikimedia-source)";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      flags.set("help", "true");
    } else if (arg === "--json") {
      flags.set("json", "true");
    } else if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      flags.set(arg.slice(2), next);
      i++;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  const { positional, flags } = parsed;

  if (flags.has("help") || positional.length === 0) {
    process.stdout.write(USAGE);
    return positional.length === 0 && !flags.has("help") ? 2 : 0;
  }

  const name = positional.join(" ");
  const keywordsRaw = flags.get("keywords");
  const queryTemplate = flags.get("query");
  const title = flags.get("title");

  const result = await findWikimediaImage("cli", name, {
    userAgent: flags.get("user-agent") ?? CLI_USER_AGENT,
    lang: flags.get("lang") ?? "en",
    ...(title ? { wikipediaTitles: { cli: title } } : {}),
    ...(keywordsRaw ? { keywords: new RegExp(`\\b(${keywordsRaw})\\b`, "i") } : {}),
    ...(queryTemplate
      ? { buildSearchQuery: (n: string) => queryTemplate.replace("{name}", n) }
      : {}),
  });

  if (!result) {
    process.stderr.write(`No freely-licensed image found for "${name}".\n`);
    return 1;
  }

  if (flags.has("json")) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  process.stdout.write(`${result.imageUrl}\n`);
  process.stdout.write(`${formatAttribution(result.attribution)}\n`);
  if (result.attribution.restrictions) {
    process.stderr.write(
      `Note: non-copyright restrictions apply — ${result.attribution.restrictions}\n`
    );
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
);
