import type { Attribution } from "./types.js";

export interface FormatAttributionOptions {
  /**
   * `"text"` (default) produces a plain credit line. `"html"` produces the
   * same line with the author and license linked, which is what the
   * Creative Commons attribution guidance actually asks for when the medium
   * supports links.
   */
  format?: "text" | "html";
  /** Append ", via Wikimedia Commons". Defaults to true. */
  includeSource?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function link(text: string, href: string | undefined, html: boolean): string {
  const safe = html ? escapeHtml(text) : text;
  if (!html || !href) return safe;
  return `<a href="${escapeHtml(href)}" rel="noopener">${safe}</a>`;
}

/**
 * Build a ready-to-display credit line from a captured `Attribution`.
 *
 * This is the last mile the rest of the library exists to reach: having the
 * license and author as separate fields is not the same as having something
 * you can put under an image. Omits the author clause when Wikimedia had no
 * author on file rather than printing "by Unknown", and omits the license
 * clause for public-domain works, which require no license notice.
 *
 * @example
 * formatAttribution(result.attribution)
 * // "Photo by Anna Irene, CC BY-SA 2.0, via Wikimedia Commons"
 */
export function formatAttribution(
  attribution: Attribution,
  options: FormatAttributionOptions = {}
): string {
  const html = options.format === "html";
  const includeSource = options.includeSource ?? true;

  const parts: string[] = [];

  const hasAuthor = attribution.author && attribution.author !== "Unknown";
  if (hasAuthor) {
    parts.push(`Photo by ${link(attribution.author, attribution.authorUrl, html)}`);
  } else {
    parts.push(link(attribution.fileTitle.replace(/^File:/, ""), attribution.sourceUrl, html));
  }

  const isPublicDomain = /^(pd|cc0)\b/i.test(attribution.licenseCode ?? "")
    || /public domain/i.test(attribution.license);

  if (attribution.license && attribution.license !== "Unknown" && !isPublicDomain) {
    parts.push(link(attribution.license, attribution.licenseUrl, html));
  } else if (isPublicDomain) {
    parts.push(html ? escapeHtml(attribution.license) : attribution.license);
  }

  if (includeSource) {
    parts.push(link("via Wikimedia Commons", attribution.sourceUrl, html));
  }

  return parts.join(", ");
}
