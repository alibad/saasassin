/**
 * Pure Dovetail export mapper. Dovetail's highlight CSV/JSON exports vary by workspace and export date,
 * so columns are detected by name and every row is accounted for in a mapping report.
 */

import { UNKNOWN_SPEAKER, type TranscriptSegment } from "./transcript";

export type DovetailRow = Record<string, string>;

export type MappedSource = {
  key: string;
  title: string;
  participantName: string;
  segments: TranscriptSegment[];
};

export type MappedHighlight = {
  sourceKey: string;
  segmentId: string;
  start: number;
  end: number;
  quote: string;
  tags: string[];
  note: string;
  createdAt: string;
};

export type MappingReport = {
  totalRows: number;
  mappedRows: number;
  skipped: Array<{ row: number; reason: string }>;
  columnMap: Partial<Record<DovetailField, string>>;
  unmappedColumns: string[];
  tags: string[];
};

export type DovetailField = "text" | "source" | "tags" | "participant" | "note" | "created";

const FIELD_ALIASES: Record<DovetailField, string[]> = {
  text: ["highlight", "highlight text", "text", "content", "quote", "excerpt", "body"],
  source: ["note", "note title", "source", "source title", "document", "data", "transcript", "project data", "interview"],
  tags: ["tags", "tag", "labels", "highlight tags"],
  participant: ["participant", "person", "customer", "interviewee", "speaker", "contact"],
  note: ["comment", "comments", "notes", "description", "title", "highlight title"],
  created: ["created", "created at", "created date", "date", "timestamp"],
};

const DEFAULT_SOURCE = "Imported Dovetail highlights";
/** Keeps each imported source comfortably under Firestore's 1 MiB document limit (UTF-8 worst case). */
export const MAX_SOURCE_CHARS = 250_000;

export function detectColumns(headers: string[]) {
  const columnMap: Partial<Record<DovetailField, string>> = {};
  const used = new Set<string>();
  for (const field of Object.keys(FIELD_ALIASES) as DovetailField[]) {
    for (const alias of FIELD_ALIASES[field]) {
      const header = headers.find((candidate) => !used.has(candidate) && candidate.trim().toLowerCase() === alias);
      if (header) {
        columnMap[field] = header;
        used.add(header);
        break;
      }
    }
  }
  return { columnMap, unmappedColumns: headers.filter((header) => !used.has(header)) };
}

export function splitTags(value: string) {
  return [
    ...new Set(
      value
        .split(/[,;|]/)
        .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
        .filter((tag) => tag.length > 0 && tag.length <= 40),
    ),
  ];
}

/** Normalizes a Dovetail JSON export (array, {highlights}, or {data}) into flat string rows. */
export function rowsFromDovetailJson(value: unknown): DovetailRow[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as Record<string, unknown>).highlights ?? (value as Record<string, unknown>).data ?? [])
      : [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) =>
      Object.fromEntries(
        Object.entries(item).map(([key, entry]) => {
          if (Array.isArray(entry)) {
            return [key, entry.map((part) => (part && typeof part === "object" ? String((part as Record<string, unknown>).name ?? (part as Record<string, unknown>).title ?? "") : String(part))).join(", ")];
          }
          if (entry && typeof entry === "object") {
            const record = entry as Record<string, unknown>;
            return [key, String(record.name ?? record.title ?? "")];
          }
          return [key, entry === null || entry === undefined ? "" : String(entry)];
        }),
      ),
    );
}

export function mapDovetailRows(rows: DovetailRow[]) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const { columnMap, unmappedColumns } = detectColumns(headers);
  const skipped: MappingReport["skipped"] = [];
  const sources = new Map<string, MappedSource>();
  const sourceChars = new Map<string, number>();
  const parts = new Map<string, number>();
  const highlights: MappedHighlight[] = [];
  const allTags = new Set<string>();

  if (!columnMap.text) {
    return {
      sources: [] as MappedSource[],
      highlights,
      report: {
        totalRows: rows.length,
        mappedRows: 0,
        skipped: rows.map((_, index) => ({ row: index + 1, reason: "No highlight text column was found." })),
        columnMap,
        unmappedColumns,
        tags: [],
      } satisfies MappingReport,
    };
  }

  rows.forEach((row, index) => {
    const text = (row[columnMap.text!] ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      skipped.push({ row: index + 1, reason: "Empty highlight text." });
      return;
    }
    if (text.length > 20_000) {
      skipped.push({ row: index + 1, reason: "Highlight text is longer than 20,000 characters." });
      return;
    }
    const title = (columnMap.source ? row[columnMap.source] : "")?.trim() || DEFAULT_SOURCE;
    const participantName = (columnMap.participant ? row[columnMap.participant] : "")?.trim() ?? "";
    const baseKey = title.toLowerCase();
    let part = parts.get(baseKey) ?? 1;
    let key = part === 1 ? baseKey : `${baseKey}#${part}`;
    let source = sources.get(key);
    if (source && sourceChars.get(key)! + text.length > MAX_SOURCE_CHARS) {
      part += 1;
      parts.set(baseKey, part);
      key = `${baseKey}#${part}`;
      source = undefined;
    }
    if (!source) {
      const label = part === 1 ? title : `${title} (part ${part})`;
      source = { key, title: label.slice(0, 120), participantName, segments: [] };
      sources.set(key, source);
      sourceChars.set(key, 0);
    }
    sourceChars.set(key, sourceChars.get(key)! + text.length);
    const segmentId = `seg-${source.segments.length + 1}`;
    source.segments.push({ id: segmentId, speaker: participantName || UNKNOWN_SPEAKER, startMs: null, endMs: null, text });
    const tags = columnMap.tags ? splitTags(row[columnMap.tags] ?? "").slice(0, 12) : [];
    tags.forEach((tag) => allTags.add(tag));
    highlights.push({
      sourceKey: key,
      segmentId,
      start: 0,
      end: text.length,
      quote: text,
      tags,
      note: ((columnMap.note ? row[columnMap.note] : "") ?? "").trim().slice(0, 1000),
      createdAt: ((columnMap.created ? row[columnMap.created] : "") ?? "").trim(),
    });
  });

  return {
    sources: [...sources.values()],
    highlights,
    report: {
      totalRows: rows.length,
      mappedRows: highlights.length,
      skipped,
      columnMap,
      unmappedColumns,
      tags: [...allTags].sort(),
    } satisfies MappingReport,
  };
}
