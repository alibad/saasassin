/** Highlight span validation, re-anchoring after transcript correction, and redaction. */

export const MAX_HIGHLIGHT_CHARS = 2_000;
export const REDACTION_MARKER = "[redacted]";

export type Span = { start: number; end: number };
export type AnchoredSpan = Span & { quote: string };

export type SpanValidation = { ok: true; quote: string } | { ok: false; error: string };

export function validateHighlightSpan(text: string, start: number, end: number): SpanValidation {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return { ok: false, error: "Span offsets must be whole numbers." };
  if (start < 0 || end > text.length) return { ok: false, error: "The selection is outside the transcript segment." };
  if (end <= start) return { ok: false, error: "Select at least one character." };
  if (end - start > MAX_HIGHLIGHT_CHARS) return { ok: false, error: `Highlights are limited to ${MAX_HIGHLIGHT_CHARS} characters.` };
  const quote = text.slice(start, end);
  if (!quote.trim()) return { ok: false, error: "Select words, not just whitespace." };
  return { ok: true, quote };
}

/** Trims surrounding whitespace from a selection so stored spans start and end on visible characters. */
export function tightenSpan(text: string, start: number, end: number): Span {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  return { start: s, end: e };
}

/** Expands a selection that starts or ends mid-word to whole words, then trims whitespace. */
export function snapToWords(text: string, start: number, end: number): Span {
  const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}'’-]/u.test(char);
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s > 0 && isWord(text[s - 1]) && isWord(text[s])) s -= 1;
  while (e < text.length && isWord(text[e - 1]) && isWord(text[e])) e += 1;
  return tightenSpan(text, s, e);
}

/**
 * After a segment's text is corrected, keep each highlight pointing at the same words.
 * Unchanged offsets win; otherwise the closest occurrence of the quote is used; otherwise it is flagged stale.
 */
export function reanchorSpan(newText: string, span: AnchoredSpan): AnchoredSpan & { stale: boolean } {
  if (newText.slice(span.start, span.end) === span.quote) return { ...span, stale: false };
  let best = -1;
  let from = 0;
  while (span.quote) {
    const index = newText.indexOf(span.quote, from);
    if (index === -1) break;
    if (best === -1 || Math.abs(index - span.start) < Math.abs(best - span.start)) best = index;
    from = index + 1;
  }
  if (best >= 0) return { start: best, end: best + span.quote.length, quote: span.quote, stale: false };
  const start = Math.min(span.start, newText.length);
  const end = Math.min(Math.max(span.end, start), newText.length);
  return { start, end, quote: span.quote, stale: true };
}

/** Replaces [start,end) with the redaction marker and returns the length delta. */
export function redactText(text: string, start: number, end: number, marker = REDACTION_MARKER) {
  const validation = validateHighlightSpan(text, start, end);
  if (!validation.ok) throw new Error(validation.error);
  return {
    text: `${text.slice(0, start)}${marker}${text.slice(end)}`,
    removedLength: end - start,
    delta: marker.length - (end - start),
  };
}

/** Moves or rewrites a highlight so it stays consistent after redacting [rStart,rEnd). */
export function adjustSpanForRedaction(
  newText: string,
  span: AnchoredSpan,
  rStart: number,
  rEnd: number,
  marker = REDACTION_MARKER,
): AnchoredSpan & { redacted: boolean } {
  const delta = marker.length - (rEnd - rStart);
  if (span.end <= rStart) return { ...span, redacted: false };
  if (span.start >= rEnd) {
    return { start: span.start + delta, end: span.end + delta, quote: span.quote, redacted: false };
  }
  const start = Math.min(span.start, rStart);
  const end = Math.max(span.end, rEnd) + delta;
  return { start, end, quote: newText.slice(start, end), redacted: true };
}
