/**
 * Transcript parsing for WebVTT, SubRip (SRT) and plain "Speaker: text" transcripts.
 * Pure and deterministic so it runs identically in the browser preview and on the server.
 */

export type TranscriptFormat = "vtt" | "srt" | "plain";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  startMs: number | null;
  endMs: number | null;
  text: string;
};

export type ParsedTranscript = {
  format: TranscriptFormat;
  segments: TranscriptSegment[];
  speakers: string[];
  warnings: string[];
};

export const MAX_TRANSCRIPT_CHARS = 400_000;
export const MAX_SEGMENTS = 4_000;
export const UNKNOWN_SPEAKER = "Unknown speaker";

const TIMING = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)/;
const SPEAKER_PREFIX = /^([A-Za-zÀ-ɏ][\wÀ-ɏ .'’()-]{0,38}?)\s*:\s+([\s\S]+)$/;
const PLAIN_TIMESTAMP = /^\s*\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*[-–]?\s*/;

/** Parses "hh:mm:ss.mmm", "mm:ss,mmm" or "m:ss" into milliseconds. */
export function parseTimestamp(value: string): number | null {
  const match = value.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return null;
  const [, h, m, s, frac] = match;
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds >= 60 || (h !== undefined && minutes >= 60)) return null;
  const ms = frac ? Number(frac.padEnd(3, "0")) : 0;
  return ((Number(h ?? 0) * 60 + minutes) * 60 + seconds) * 1000 + ms;
}

export function formatTimestamp(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function detectTranscriptFormat(raw: string): TranscriptFormat {
  const text = raw.replace(/^﻿/, "").trimStart();
  if (/^WEBVTT/.test(text)) return "vtt";
  const lines = text.split(/\r?\n/).slice(0, 4);
  if (/^\d+\s*$/.test(lines[0] ?? "") && TIMING.test(lines[1] ?? "")) return "srt";
  if (TIMING.test(lines[0] ?? "")) return "srt";
  return "plain";
}

function stripTags(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitSpeaker(text: string): { speaker: string | null; text: string } {
  const voice = text.match(/^<v(?:\.[\w.]+)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/);
  if (voice) return { speaker: voice[1].trim(), text: stripTags(voice[2]) };
  const cleaned = stripTags(text);
  const prefix = cleaned.match(SPEAKER_PREFIX);
  if (prefix && !/^https?$/i.test(prefix[1])) return { speaker: prefix[1].trim(), text: prefix[2].trim() };
  return { speaker: null, text: cleaned };
}

function parseCueBlocks(raw: string, format: "vtt" | "srt") {
  const blocks = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  const cues: Array<{ startMs: number | null; endMs: number | null; body: string }> = [];
  const warnings: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) continue;
    if (format === "vtt" && /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1) {
      warnings.push(`Skipped a block without timing: "${lines[0].slice(0, 40)}"`);
      continue;
    }
    const timing = lines[timingIndex].match(TIMING)!;
    const body = lines.slice(timingIndex + 1).join(" ").trim();
    if (!body) continue;
    cues.push({ startMs: parseTimestamp(timing[1]), endMs: parseTimestamp(timing[2]), body });
  }
  return { cues, warnings };
}

export function parseTranscript(raw: string, format: TranscriptFormat | "auto" = "auto"): ParsedTranscript {
  if (raw.length > MAX_TRANSCRIPT_CHARS) {
    throw new Error(`Transcripts are limited to ${MAX_TRANSCRIPT_CHARS.toLocaleString("en-US")} characters.`);
  }
  const resolved = format === "auto" ? detectTranscriptFormat(raw) : format;
  const segments: TranscriptSegment[] = [];
  let warnings: string[] = [];

  const push = (speaker: string | null, text: string, startMs: number | null, endMs: number | null) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const previous = segments[segments.length - 1];
    // A timed cue with no speaker continues the previous speaker's turn.
    if (previous && speaker === null && previous.text.length < 600) {
      previous.text = `${previous.text} ${trimmed}`;
      previous.endMs = endMs ?? previous.endMs;
      return;
    }
    segments.push({
      id: `seg-${segments.length + 1}`,
      speaker: speaker ?? UNKNOWN_SPEAKER,
      startMs,
      endMs,
      text: trimmed,
    });
  };

  if (resolved === "plain") {
    const lines = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      let rest = line;
      let startMs: number | null = null;
      const stamp = rest.match(PLAIN_TIMESTAMP);
      if (stamp && parseTimestamp(stamp[1]) !== null) {
        startMs = parseTimestamp(stamp[1]);
        rest = rest.slice(stamp[0].length);
      }
      const { speaker, text } = splitSpeaker(rest);
      if (speaker === null && startMs === null && segments.length > 0) {
        segments[segments.length - 1].text += ` ${text}`;
        continue;
      }
      if (speaker === null) {
        segments.push({ id: `seg-${segments.length + 1}`, speaker: segments.at(-1)?.speaker ?? UNKNOWN_SPEAKER, startMs, endMs: null, text });
        continue;
      }
      segments.push({ id: `seg-${segments.length + 1}`, speaker, startMs, endMs: null, text });
    }
  } else {
    const parsed = parseCueBlocks(raw, resolved);
    warnings = parsed.warnings;
    for (const cue of parsed.cues) {
      const { speaker, text } = splitSpeaker(cue.body);
      push(speaker, text, cue.startMs, cue.endMs);
    }
  }

  if (segments.length > MAX_SEGMENTS) {
    throw new Error(`Transcripts are limited to ${MAX_SEGMENTS} segments.`);
  }
  if (segments.length === 0) warnings.push("No transcript text was found.");
  const speakers = [...new Set(segments.map((segment) => segment.speaker))];
  return { format: resolved, segments, speakers, warnings };
}
