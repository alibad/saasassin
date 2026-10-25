/**
 * Pure TypeScript RFC 5322 / MIME parser for imported .eml and .mbox files.
 * No DOM, no Node APIs: runs identically in the browser, the route handler and vitest.
 * HTML bodies are reduced to text with htmlToText — raw email HTML is never kept for rendering.
 */
import { htmlToText } from "./html";

export type MailAddress = { name: string; email: string };

export type MailAttachment = { filename: string; contentType: string; size: number };

export type ParsedMessage = {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  replyTo: MailAddress[];
  date: string | null;
  text: string;
  bodySource: "text" | "html" | "none";
  listUnsubscribe: string | null;
  hasCalendarInvite: boolean;
  attachments: MailAttachment[];
};

export const MAX_BODY_CHARS = 60_000;

type HeaderMap = Map<string, string[]>;

type MimePart = {
  headers: HeaderMap;
  body: string;
};

/* ---------- small helpers ---------- */

export function hashString(input: string) {
  // FNV-1a, two independent 32-bit lanes → 16 hex chars. Deterministic ids for idempotent import.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code + index;
    h2 = Math.imul(h2, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function decodeBytes(bytes: Uint8Array, charset = "utf-8") {
  const label = charset.trim().toLowerCase().replace(/^"|"$/g, "") || "utf-8";
  try {
    return new TextDecoder(label === "us-ascii" || label === "ascii" ? "utf-8" : label).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(bytes);
    } catch {
      return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    }
  }
}

function latin1Bytes(input: string) {
  const bytes = new Uint8Array(input.length);
  for (let index = 0; index < input.length; index += 1) bytes[index] = input.charCodeAt(index) & 0xff;
  return bytes;
}

export function base64ToBytes(input: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

export function quotedPrintableToBytes(input: string, headerMode = false) {
  const source = headerMode ? input.replace(/_/g, " ") : input.replace(/=\r?\n/g, "");
  const output: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "=" && /^[0-9a-fA-F]{2}$/.test(source.slice(index + 1, index + 3))) {
      output.push(parseInt(source.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      const code = source.charCodeAt(index);
      if (code < 0x80) output.push(code);
      else for (const byte of new TextEncoder().encode(char)) output.push(byte);
    }
  }
  return Uint8Array.from(output);
}

/** RFC 2047 encoded words: =?charset?B|Q?text?= ; whitespace between adjacent words is dropped. */
export function decodeEncodedWords(value: string) {
  const pattern = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;
  const joined = value.replace(/(=\?[^?\s]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?[^?]*\?=)/g, "$1");
  return joined.replace(pattern, (_match, charset: string, encoding: string, text: string) => {
    const cleanCharset = charset.split("*")[0];
    const bytes = encoding.toUpperCase() === "B" ? base64ToBytes(text) : quotedPrintableToBytes(text, true);
    return decodeBytes(bytes, cleanCharset);
  });
}

/* ---------- headers ---------- */

function splitHeadBody(raw: string) {
  const normalized = raw.replace(/^﻿/, "");
  const match = /\r?\n\r?\n/.exec(normalized);
  if (!match) return { head: normalized, body: "" };
  return { head: normalized.slice(0, match.index), body: normalized.slice(match.index + match[0].length) };
}

export function parseHeaders(head: string): HeaderMap {
  const headers: HeaderMap = new Map();
  const lines = head.split(/\r?\n/);
  let current: { name: string; value: string } | null = null;
  const flush = () => {
    if (!current) return;
    const key = current.name.toLowerCase();
    headers.set(key, [...(headers.get(key) ?? []), current.value.trim()]);
  };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && current) {
      current.value += ` ${line.trim()}`;
      continue;
    }
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    flush();
    current = { name: line.slice(0, colon).trim(), value: line.slice(colon + 1) };
  }
  flush();
  return headers;
}

function header(headers: HeaderMap, name: string) {
  return headers.get(name.toLowerCase())?.[0] ?? null;
}

type ParamValue = { value: string; params: Record<string, string> };

export function parseParams(value: string | null): ParamValue {
  if (!value) return { value: "", params: {} };
  const parts: string[] = [];
  let buffer = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === ";" && !quoted) {
      parts.push(buffer);
      buffer = "";
    } else buffer += char;
  }
  parts.push(buffer);
  const params: Record<string, string> = {};
  const continuations: Record<string, string[]> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    let paramValue = part.slice(eq + 1).trim();
    if (paramValue.startsWith('"') && paramValue.endsWith('"')) paramValue = paramValue.slice(1, -1).replace(/\\(.)/g, "$1");
    const continuation = /^(.*?)\*(\d+)\*?$/.exec(key);
    if (continuation) {
      (continuations[continuation[1]] ??= [])[Number(continuation[2])] = paramValue;
      continue;
    }
    if (key.endsWith("*")) {
      params[key.slice(0, -1)] = decodeRfc2231(paramValue);
      continue;
    }
    params[key] = decodeEncodedWords(paramValue);
  }
  for (const [key, pieces] of Object.entries(continuations)) {
    const joined = pieces.join("");
    params[key] = /^[^']*'[^']*'/.test(joined) ? decodeRfc2231(joined) : joined;
  }
  return { value: parts[0].trim().toLowerCase(), params };
}

function decodeRfc2231(value: string) {
  const match = /^([^']*)'[^']*'(.*)$/.exec(value);
  if (!match) return value;
  const bytes: number[] = [];
  const text = match[2];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "%" && /^[0-9a-fA-F]{2}$/.test(text.slice(index + 1, index + 3))) {
      bytes.push(parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(text.charCodeAt(index) & 0xff);
  }
  return decodeBytes(Uint8Array.from(bytes), match[1] || "utf-8");
}

/* ---------- addresses ---------- */

export function parseAddressList(value: string | null): MailAddress[] {
  if (!value) return [];
  const withoutGroups = value.replace(/^[^:<"]*:\s*/, "").replace(/;\s*$/, "");
  const items: string[] = [];
  let buffer = "";
  let quoted = false;
  let angle = 0;
  for (const char of withoutGroups) {
    if (char === '"') quoted = !quoted;
    if (!quoted && char === "<") angle += 1;
    if (!quoted && char === ">") angle = Math.max(0, angle - 1);
    if (char === "," && !quoted && angle === 0) {
      items.push(buffer);
      buffer = "";
    } else buffer += char;
  }
  items.push(buffer);
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const angleMatch = /^(.*?)<\s*([^>]+?)\s*>\s*$/.exec(item);
      if (angleMatch) {
        const name = decodeEncodedWords(angleMatch[1].trim().replace(/^"|"$/g, "").replace(/\\(.)/g, "$1")).trim();
        return { name, email: angleMatch[2].trim().toLowerCase() };
      }
      const commentMatch = /^([^\s(]+@[^\s(]+)\s*\(([^)]*)\)$/.exec(item);
      if (commentMatch) return { name: decodeEncodedWords(commentMatch[2].trim()), email: commentMatch[1].toLowerCase() };
      return { name: "", email: item.replace(/^"|"$/g, "").toLowerCase() };
    })
    .filter((address) => address.email.includes("@"));
}

function parseMessageIds(value: string | null) {
  if (!value) return [];
  const ids = value.match(/<[^<>\s]+>/g);
  if (ids) return ids.map((id) => id.slice(1, -1).trim().toLowerCase());
  return value.split(/\s+/).map((id) => id.trim().toLowerCase()).filter((id) => id.includes("@"));
}

/* ---------- bodies ---------- */

function decodePartBody(part: MimePart) {
  const encoding = (header(part.headers, "content-transfer-encoding") ?? "7bit").trim().toLowerCase();
  const { params } = parseParams(header(part.headers, "content-type"));
  const charset = params.charset ?? "utf-8";
  if (encoding === "base64") return decodeBytes(base64ToBytes(part.body), charset);
  if (encoding === "quoted-printable") return decodeBytes(quotedPrintableToBytes(part.body), charset);
  // 7bit/8bit/binary: the file was read as text already; legacy single-byte charsets are re-decoded.
  const lower = charset.toLowerCase();
  if (lower !== "utf-8" && lower !== "us-ascii" && /[\u0080-ÿ]/.test(part.body) && !/[Ā-￿]/.test(part.body)) {
    return decodeBytes(latin1Bytes(part.body), charset);
  }
  return part.body;
}

function byteLength(part: MimePart) {
  const encoding = (header(part.headers, "content-transfer-encoding") ?? "").trim().toLowerCase();
  if (encoding === "base64") return Math.floor((part.body.replace(/[^A-Za-z0-9+/]/g, "").length * 3) / 4);
  return part.body.length;
}

function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const lines = body.split(/\r?\n/);
  const parts: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed === `${delimiter}--`) {
      if (current) parts.push(current.join("\n"));
      current = null;
      break;
    }
    if (trimmed === delimiter) {
      if (current) parts.push(current.join("\n"));
      current = [];
      continue;
    }
    current?.push(line);
  }
  if (current && current.length) parts.push(current.join("\n"));
  return parts;
}

type Collected = {
  plain: string[];
  html: string[];
  attachments: MailAttachment[];
  calendar: boolean;
};

function walk(part: MimePart, collected: Collected, depth: number) {
  if (depth > 12) return;
  const contentType = parseParams(header(part.headers, "content-type") ?? "text/plain");
  const disposition = parseParams(header(part.headers, "content-disposition"));
  const type = contentType.value || "text/plain";
  const filename = disposition.params.filename ?? contentType.params.name ?? "";

  if (type === "text/calendar" || type === "application/ics" || filename.toLowerCase().endsWith(".ics")) {
    collected.calendar = true;
  }

  if (type.startsWith("multipart/") && contentType.params.boundary) {
    const children = splitMultipart(part.body, contentType.params.boundary).map((raw) => {
      const { head, body } = splitHeadBody(raw);
      return { headers: parseHeaders(head), body };
    });
    if (type === "multipart/alternative") {
      const plain = children.find((child) => parseParams(header(child.headers, "content-type") ?? "text/plain").value === "text/plain");
      const preferred = plain ?? children.find((child) => parseParams(header(child.headers, "content-type")).value === "text/html");
      for (const child of children) {
        const childType = parseParams(header(child.headers, "content-type") ?? "text/plain").value;
        if (child === preferred || !childType.startsWith("text/")) walk(child, collected, depth + 1);
        else if (childType === "text/calendar") collected.calendar = true;
      }
      return;
    }
    for (const child of children) walk(child, collected, depth + 1);
    return;
  }

  const isAttachment = disposition.value === "attachment" || (Boolean(filename) && !type.startsWith("text/plain") && !type.startsWith("text/html"));
  if (isAttachment || type === "message/rfc822" || (!type.startsWith("text/") && !type.startsWith("multipart/"))) {
    collected.attachments.push({ filename: filename || "attachment", contentType: type, size: byteLength(part) });
    return;
  }
  if (type === "text/html") collected.html.push(decodePartBody(part));
  else if (type === "text/plain" || type === "text/enriched") collected.plain.push(decodePartBody(part));
}

/* ---------- public API ---------- */

export function parseEml(raw: string): ParsedMessage {
  const { head, body } = splitHeadBody(raw.replace(/^From [^\n]*\n/, ""));
  const headers = parseHeaders(head);
  const collected: Collected = { plain: [], html: [], attachments: [], calendar: false };
  walk({ headers, body }, collected, 0);

  let text = collected.plain.join("\n\n").replace(/\r\n?/g, "\n").trim();
  let bodySource: ParsedMessage["bodySource"] = text ? "text" : "none";
  if (!text && collected.html.length) {
    text = htmlToText(collected.html.join("\n"));
    bodySource = text ? "html" : "none";
  }
  if (text.length > MAX_BODY_CHARS) text = `${text.slice(0, MAX_BODY_CHARS)}\n\n[Message truncated on import]`;

  const subject = decodeEncodedWords(header(headers, "subject") ?? "").replace(/\s+/g, " ").trim();
  const from = parseAddressList(header(headers, "from"))[0] ?? null;
  const dateValue = header(headers, "date");
  const parsedDate = dateValue ? Date.parse(dateValue.replace(/\s*\([^)]*\)\s*$/, "")) : NaN;
  const date = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;
  const explicitId = parseMessageIds(header(headers, "message-id"))[0];
  const messageId = explicitId ?? `generated-${hashString(`${from?.email ?? ""}|${date ?? ""}|${subject}|${text.slice(0, 200)}`)}@saasassin.mail`;
  const inReplyTo = parseMessageIds(header(headers, "in-reply-to"))[0] ?? null;
  const references = parseMessageIds(header(headers, "references"));

  return {
    messageId,
    inReplyTo,
    references,
    subject,
    from,
    to: parseAddressList(header(headers, "to")),
    cc: parseAddressList(header(headers, "cc")),
    replyTo: parseAddressList(header(headers, "reply-to")),
    date,
    text,
    bodySource,
    listUnsubscribe: header(headers, "list-unsubscribe"),
    hasCalendarInvite: collected.calendar,
    attachments: collected.attachments,
  };
}

/**
 * Splits an mbox file (mboxo/mboxrd) into raw messages. A message starts at a "From " line at the
 * top of the file or after a blank line; ">From " escaping is reversed.
 */
export function splitMbox(raw: string): string[] {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  const messages: string[] = [];
  let current: string[] | null = null;
  let previousBlank = true;
  for (const line of lines) {
    if (line.startsWith("From ") && previousBlank) {
      if (current) messages.push(current.join("\n").replace(/\n+$/, "\n"));
      current = [];
      previousBlank = false;
      continue;
    }
    previousBlank = line.trim() === "";
    if (!current) {
      if (line.trim() === "") continue;
      current = [];
    }
    current.push(/^>+From /.test(line) ? line.slice(1) : line);
  }
  if (current && current.some((line) => line.trim())) messages.push(current.join("\n").replace(/\n+$/, "\n"));
  return messages.filter((message) => /^[\w-]+:/m.test(message));
}

/** Detects whether a file's content is an mbox (several messages) or a single .eml. */
export function splitMailFile(name: string, content: string): string[] {
  if (/\.mbox$/i.test(name) || /^From \S+/.test(content.replace(/^﻿/, ""))) return splitMbox(content);
  return [content];
}
