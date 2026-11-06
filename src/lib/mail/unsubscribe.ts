/**
 * Unsubscribe helper: turns a List-Unsubscribe header (RFC 2369) into targets a person can
 * choose to use — a mailto address and/or a web link. SaaSassin never requests either one
 * itself (no one-click POST, no prefetch); the UI only shows them as links.
 */

export type UnsubscribeTargets = {
  mailto: { address: string; subject: string; body: string; href: string } | null;
  web: { href: string; host: string; secure: boolean } | null;
  /** The sender advertises RFC 8058 one-click; we still never send that POST automatically. */
  oneClick: boolean;
};

const ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function parseMailto(target: string): UnsubscribeTargets["mailto"] {
  const rest = target.slice("mailto:".length);
  const [rawAddress, query = ""] = rest.split("?", 2);
  const address = safeDecode(rawAddress).trim();
  if (!ADDRESS.test(address)) return null;
  const params = new Map<string, string>();
  for (const pair of query.split("&")) {
    const [key, value = ""] = pair.split("=", 2);
    if (key) params.set(key.toLowerCase(), safeDecode(value).slice(0, 500));
  }
  const subject = params.get("subject") ?? "unsubscribe";
  const body = params.get("body") ?? "";
  const href = `mailto:${address}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  return { address, subject, body, href };
}

function parseWeb(target: string): UnsubscribeTargets["web"] {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || !url.hostname) return null;
  return { href: url.toString(), host: url.hostname, secure: url.protocol === "https:" };
}

export function parseListUnsubscribe(header: string | null | undefined, postHeader?: string | null): UnsubscribeTargets | null {
  if (!header) return null;
  const candidates = [...header.matchAll(/<\s*([^>]+?)\s*>/g)].map((match) => match[1].replace(/\s+/g, ""));
  // Some senders omit the angle brackets around a single target.
  if (!candidates.length && /^\s*(mailto:|https?:)/i.test(header)) candidates.push(header.trim());
  let mailto: UnsubscribeTargets["mailto"] = null;
  let web: UnsubscribeTargets["web"] = null;
  for (const candidate of candidates) {
    if (!mailto && /^mailto:/i.test(candidate)) mailto = parseMailto(`mailto:${candidate.slice(7)}`);
    else if (!web && /^https?:/i.test(candidate)) web = parseWeb(candidate);
  }
  if (!mailto && !web) return null;
  return { mailto, web, oneClick: Boolean(web?.secure && postHeader && /list-unsubscribe=one-click/i.test(postHeader)) };
}
