/**
 * Transcript search across a workspace's calls. Whole-word, case-insensitive
 * phrase matching (the same matcher trackers use), returning the exact
 * segment and character span so results link straight to evidence.
 */

import { keywordPattern } from "./analysis";
import type { TranscriptSegment } from "./transcript";

export type SearchableCall = { id: string; title: string; occurredAt: string; dealId: string; segments: TranscriptSegment[] };

export type SearchResult = {
  callId: string;
  title: string;
  dealId: string;
  occurredAt: string;
  segmentIndex: number;
  start: number;
  speaker: string;
  text: string;
  charStart: number;
  charEnd: number;
};

export const MIN_QUERY_LENGTH = 2;

export function searchTranscripts(calls: SearchableCall[], query: string, limit = 100): { results: SearchResult[]; truncated: boolean } {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return { results: [], truncated: false };
  const pattern = keywordPattern(trimmed);
  if (!pattern) return { results: [], truncated: false };
  const results: SearchResult[] = [];
  const ordered = [...calls].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const call of ordered) {
    for (const segment of call.segments) {
      pattern.lastIndex = 0;
      const match = pattern.exec(segment.text);
      if (!match) continue;
      results.push({
        callId: call.id,
        title: call.title,
        dealId: call.dealId,
        occurredAt: call.occurredAt,
        segmentIndex: segment.index,
        start: segment.start,
        speaker: segment.speaker,
        text: segment.text,
        charStart: match.index,
        charEnd: match.index + match[0].length,
      });
      if (results.length > limit) return { results: results.slice(0, limit), truncated: true };
    }
  }
  return { results, truncated: false };
}
