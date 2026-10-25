/**
 * HTML → plain text. Email HTML is NEVER rendered: every tag is removed, script/style/head
 * content is dropped entirely, links are reduced to their visible text plus the URL, and
 * entities are decoded. The output is rendered by React as escaped text.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  euro: "€",
  pound: "£",
  zwnj: "",
  zwj: "",
};

export function decodeEntities(input: string) {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}

export function htmlToText(html: string) {
  let text = html;
  // Remove comments, then whole elements whose content must never surface.
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<(script|style|head|title|template|noscript|svg|object|iframe)\b[\s\S]*?<\/\1\s*>/gi, "");
  text = text.replace(/<(script|style|head|title|template|noscript|svg|object|iframe)\b[^>]*\/?>/gi, "");
  // Links: keep visible text and show the destination as plain text (never clickable).
  text = text.replace(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, _q, d1, d2, d3, inner: string) => {
    const href = String(d1 ?? d2 ?? d3 ?? "").trim();
    const label = inner.replace(/<[^>]*>/g, "").trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return label;
    const cleanHref = decodeEntities(href);
    if (!label || decodeEntities(label) === cleanHref) return `${cleanHref}`;
    return `${label} [${cleanHref}]`;
  });
  // Images become their alt text only; remote images (tracking pixels) are never fetched.
  text = text.replace(/<img\b[^>]*?\balt\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, a1, a2) => {
    const alt = String(a1 ?? a2 ?? "").trim();
    return alt ? `[${alt}]` : "";
  });
  // Block structure → line breaks.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<li\b[^>]*>/gi, "\n• ");
  text = text.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|blockquote|section|article|header|footer|pre)\s*>/gi, "\n\n");
  text = text.replace(/<(p|div|h[1-6]|tr|blockquote|section|article|pre)\b[^>]*>/gi, "\n");
  text = text.replace(/<\/(td|th)\s*>/gi, "\t");
  text = text.replace(/<hr\b[^>]*>/gi, "\n————\n");
  // Strip every remaining tag (including unterminated ones at the end).
  text = text.replace(/<\/?[a-z!][^>]*>/gi, "");
  text = text.replace(/<[a-z!/][^>]*$/i, "");
  text = decodeEntities(text);
  // Normalise whitespace.
  text = text.replace(/\r\n?/g, "\n");
  text = text.replace(/[ \t ]+/g, (spaces) => (spaces.includes("\t") ? "  " : " "));
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
