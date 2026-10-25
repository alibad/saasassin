/**
 * Pure transcript parsing for SaaSassin Revenue.
 *
 * Accepts WebVTT, SRT, or plain "Speaker: text" lines (optionally prefixed with
 * a [mm:ss] / [hh:mm:ss] timestamp). No audio is processed anywhere in Revenue.
 * Runs identically in the browser (live preview) and on the server (authoritative).
 */

export type TranscriptFormat = "vtt" | "srt" | "plain";

export type TranscriptSegment = {
  index: number;
  speaker: string;
  /** Seconds from the start of the call. */
  start: number;
  end: number;
  text: string;
};

export type ParsedTranscript = {
  format: TranscriptFormat;
  segments: TranscriptSegment[];
  speakers: string[];
  /** True when the source had no timestamps and timing was estimated from word count. */
  timingEstimated: boolean;
};

export class TranscriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptParseError";
  }
}

export const UNKNOWN_SPEAKER = "Unknown speaker";
export const MAX_TRANSCRIPT_CHARS = 400_000;
export const MAX_SEGMENTS = 4_000;
/** Speaking rate used only when the source carries no timestamps (150 words per minute). */
export const ESTIMATED_WORDS_PER_SECOND = 2.5;

const CUE_TIMING = /^\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;
const PLAIN_TIMESTAMP = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\]?\s*[-–]?\s*/;
const SPEAKER_PREFIX = /^([^:\n]{1,60}?):\s+(.+)$/;
const VTT_VOICE = /^<v(?:\.[^\s>]+)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/;

/** "01:02:03.500" | "02:03,5" | "2:03" → seconds. */
export function parseTimestamp(value: string): number {
  const [clock, fraction = "0"] = value.trim().replace(",", ".").split(".");
  const parts = clock.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new TranscriptParseError(`Invalid timestamp "${value}".`);
  }
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds + Number(`0.${fraction}`);
}

export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function detectFormat(raw: string): TranscriptFormat {
  const text = raw.replace(/^﻿/, "").trimStart();
  if (/^WEBVTT/.test(text)) return "vtt";
  const lines = text.split(/\r?\n/).slice(0, 12);
  if (lines.some((line) => CUE_TIMING.test(line))) {
    return lines.some((line) => /-->/.test(line) && /\d,\d/.test(line)) ? "srt" : "vtt";
  }
  return "plain";
}

function splitSpeaker(text: string): { speaker: string | null; text: string } {
  const voice = text.match(VTT_VOICE);
  if (voice) return { speaker: voice[1].trim(), text: stripTags(voice[2]).trim() };
  const prefixed = text.match(SPEAKER_PREFIX);
  if (prefixed && !/^https?$/i.test(prefixed[1].trim())) {
    return { speaker: prefixed[1].trim(), text: prefixed[2].trim() };
  }
  return { speaker: null, text: text.trim() };
}

function stripTags(text: string) {
  return text.replace(/<[^>]+>/g, "");
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function parseCues(raw: string): Array<Omit<TranscriptSegment, "index">> {
  const blocks = raw.replace(/^﻿/, "").split(/\r?\n\s*\r?\n/);
  const cues: Array<Omit<TranscriptSegment, "index">> = [];
  let lastSpeaker: string | null = null;
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => CUE_TIMING.test(line));
    if (timingIndex === -1) continue;
    const timing = lines[timingIndex].match(CUE_TIMING)!;
    const body = lines.slice(timingIndex + 1).join(" ").trim();
    if (!body) continue;
    const { speaker, text } = splitSpeaker(body);
    const cleaned = stripTags(text).trim();
    if (!cleaned) continue;
    const resolved: string = speaker ?? lastSpeaker ?? UNKNOWN_SPEAKER;
    lastSpeaker = resolved;
    const start = parseTimestamp(timing[1]);
    const end = Math.max(start, parseTimestamp(timing[2]));
    cues.push({ speaker: resolved, start, end, text: cleaned });
  }
  return cues;
}

function parsePlain(raw: string): { cues: Array<Omit<TranscriptSegment, "index">>; estimated: boolean } {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  type Draft = { speaker: string; start: number | null; text: string };
  const drafts: Draft[] = [];
  for (const line of lines) {
    let rest = line;
    let start: number | null = null;
    const stamp = rest.match(PLAIN_TIMESTAMP);
    if (stamp && stamp[0].length < rest.length) {
      start = parseTimestamp(stamp[1]);
      rest = rest.slice(stamp[0].length);
    }
    const { speaker, text } = splitSpeaker(rest);
    if (!text) continue;
    if (!speaker && start === null && drafts.length) {
      // A continuation line belongs to the previous speaker turn.
      drafts[drafts.length - 1].text += ` ${text}`;
      continue;
    }
    drafts.push({ speaker: speaker ?? drafts.at(-1)?.speaker ?? UNKNOWN_SPEAKER, start, text });
  }

  const hasTimestamps = drafts.length > 0 && drafts.every((draft) => draft.start !== null);
  let cursor = 0;
  const cues = drafts.map((draft, i) => {
    const spoken = wordCount(draft.text) / ESTIMATED_WORDS_PER_SECOND;
    const start = hasTimestamps ? (draft.start as number) : cursor;
    const next = hasTimestamps ? drafts[i + 1]?.start ?? null : null;
    const end = next !== null && next !== undefined && next > start ? next : start + Math.max(1, spoken);
    cursor = end;
    return { speaker: draft.speaker, start, end: round(end), text: draft.text };
  });
  return { cues, estimated: !hasTimestamps };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function parseTranscript(raw: string, format: TranscriptFormat | "auto" = "auto"): ParsedTranscript {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TranscriptParseError("Paste or upload a transcript.");
  }
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new TranscriptParseError("Transcripts are limited to 400,000 characters.");
  }
  const resolved = format === "auto" ? detectFormat(raw) : format;
  let cues: Array<Omit<TranscriptSegment, "index">>;
  let timingEstimated = false;
  if (resolved === "plain") {
    const plain = parsePlain(raw);
    cues = plain.cues;
    timingEstimated = plain.estimated;
  } else {
    cues = parseCues(raw);
  }
  if (!cues.length) {
    throw new TranscriptParseError(
      resolved === "plain"
        ? "No speaker turns found. Use one \"Speaker: text\" line per turn."
        : "No timed cues with text were found in this file.",
    );
  }
  if (cues.length > MAX_SEGMENTS) {
    throw new TranscriptParseError(`Transcripts are limited to ${MAX_SEGMENTS} segments.`);
  }
  const segments = cues
    .map((cue, index) => ({ ...cue, index }))
    .sort((a, b) => a.start - b.start || a.index - b.index)
    .map((cue, index) => ({ ...cue, index }));
  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  return { format: resolved, segments, speakers, timingEstimated };
}
