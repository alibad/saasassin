import { validateStudyStructure, type Answer, type Block } from "./model";

/**
 * Maze results CSV → Studies (pure). Maze exports one row per tester and one column per block
 * (plus sub-columns such as "- Duration" for missions). We infer each block's type from its
 * values, keep only answers, and drop anything that could identify a person or their device.
 * The result is always previewed with a mapping report before anything is written.
 */

export const MAZE_MAX_ROWS = 5000;
export const MAZE_MAX_BYTES = 5 * 1024 * 1024;

export type MazeColumnReport = {
  header: string;
  mapping: "block" | "metadata" | "timing" | "dropped";
  detail: string;
  blockId?: string;
  blockType?: Block["type"];
};

export type MazeResponse = {
  externalId: string | null;
  status: "completed" | "in_progress";
  answers: Record<string, Answer>;
  path: string[];
  blockTimings: Record<string, number>;
  startedAt: string | null;
  submittedAt: string | null;
  durationMs: number | null;
};

export type MazeMapping = {
  blocks: Block[];
  responses: MazeResponse[];
  report: {
    rows: number;
    imported: number;
    skipped: { row: number; reason: string }[];
    columns: MazeColumnReport[];
    warnings: string[];
  };
};

/** RFC 4180: quoted fields, doubled quotes, CR/LF/CRLF line breaks, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ""));
}

const norm = (header: string) => header.trim().toLowerCase().replace(/\s+/g, " ");

const PII = /^(e-?mail( address)?|name|full name|first name|last name|surname|phone( number)?|ip( address)?|user agent|address)$/;
const DEVICE = /^(device( type)?|os|operating system|browser|country|city|region|location|language|screen( size| resolution)?|url|referrer|custom variables?)$/;
const ID = /^(participant|tester|respondent|session|response|result)( ?id)?$|^id$/;
const STARTED = /^(start(ed)?|date started|start(ed)? (at|time|date))$/;
const ENDED = /^(end(ed)?( (at|time|date))?|(completed|submitted|finished) (at|time|date)|date (ended|completed|submitted))$/;
const DURATION = /^(total )?(duration|time spent|time taken|total time)( \((ms|s|sec|seconds|min|minutes)\))?$/;
const STATUS = /^(status|outcome|completion|completed\??|finished\??)$/;
const SUB = /\s*(?:[-–—:]\s*|\()(outcome|result|status|success|duration|time|time spent|time on task|misclicks?|misclick rate|path|clicks|heatmap)\)?$/i;
const NUMBERED = /^(?:block|question|q)?\s*#?(\d+)\s*[.:)\-–—]\s*(.+)$/i;

/** "83", "83s", "1:23", "1m 23s", "2.5 min", "83000ms" → milliseconds. Unit hint from the header. */
export function parseDuration(raw: string, unit: "ms" | "s" | "min" = "s"): number | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  const clock = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/);
  if (clock) return ((Number(clock[1] ?? 0) * 60 + Number(clock[2])) * 60 + Number(clock[3])) * 1000;
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hours?)\b/g)];
  if (parts.length) {
    return Math.round(
      parts.reduce((total, [, amount, suffix]) => {
        const n = Number(amount);
        if (suffix.startsWith("ms") || suffix.startsWith("milli")) return total + n;
        if (suffix.startsWith("h")) return total + n * 3_600_000;
        if (suffix === "m" || suffix.startsWith("min")) return total + n * 60_000;
        return total + n * 1000;
      }, 0),
    );
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    const n = Number(value);
    return Math.round(unit === "ms" ? n : unit === "min" ? n * 60_000 : n * 1000);
  }
  return null;
}

function parseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function slug(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "option";
}

function optionList(labels: string[]) {
  const used = new Set<string>();
  return labels.map((label) => {
    let id = `opt_${slug(label)}`;
    for (let n = 2; used.has(id); n += 1) id = `opt_${slug(label)}_${n}`;
    used.add(id);
    return { id, label: label.slice(0, 200) };
  });
}

type Group = {
  key: string;
  title: string;
  order: number;
  main: number | null;
  /** The main column is a mission outcome ("- Outcome"), always kept as choices. */
  outcome: boolean;
  duration: number | null;
  durationUnit: "ms" | "s" | "min";
  extras: number[];
};

function inferBlock(id: string, title: string, values: string[], forceChoice: boolean): { block: Block; detail: string } | null {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (!filled.length) return null;
  const base = { id, prompt: title.slice(0, 1000) || "Untitled question", required: false, logic: [], screenOut: [] };
  const distinct = [...new Set(filled)];
  const lower = distinct.map((value) => value.toLowerCase());

  if (!forceChoice && distinct.every((value) => /^-?\d+$/.test(value))) {
    const numbers = distinct.map(Number);
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    if (min >= 1 && max <= 5) return { block: { type: "opinion_scale", ...base, scale: 5, minLabel: "", maxLabel: "" }, detail: "Opinion scale 1–5" };
    if (min >= 1 && max <= 10) return { block: { type: "opinion_scale", ...base, scale: 10, minLabel: "", maxLabel: "" }, detail: "Opinion scale 1–10" };
    if (min >= 0 && max <= 10) {
      const options = optionList(Array.from({ length: 11 }, (_, n) => String(n)));
      return { block: { type: "multiple_choice", ...base, allowMultiple: false, options }, detail: "0–10 rating (e.g. NPS), kept as choices 0–10" };
    }
  }
  if (!forceChoice && lower.every((value) => ["yes", "no", "y", "n", "true", "false"].includes(value)) && distinct.length <= 2) {
    return { block: { type: "yes_no", ...base }, detail: "Yes / No" };
  }
  const multi = filled.some((value) => /[|;]/.test(value));
  if (multi) {
    const tokens = [...new Set(filled.flatMap((value) => value.split(/[|;]/).map((token) => token.trim()).filter(Boolean)))];
    if (tokens.length >= 2 && tokens.length <= 30) {
      return { block: { type: "multiple_choice", ...base, allowMultiple: true, options: optionList(tokens) }, detail: `Multiple choice (multi-select, ${tokens.length} options)` };
    }
  }
  // Choices repeat: a column only becomes multiple choice when testers picked the same values.
  const fewDistinct =
    distinct.length >= 2 &&
    distinct.length <= 30 &&
    distinct.length < filled.length &&
    distinct.length <= Math.ceil(filled.length * 0.6) &&
    distinct.every((value) => value.length <= 120);
  if (forceChoice ? distinct.length >= 2 && distinct.length <= 30 : fewDistinct) {
    return {
      block: { type: "multiple_choice", ...base, allowMultiple: false, options: optionList(distinct) },
      detail: forceChoice ? `Mission outcome (${distinct.length} outcomes) kept as choices` : `Multiple choice (${distinct.length} options)`,
    };
  }
  const longest = Math.max(...filled.map((value) => value.length));
  return { block: { type: "open_text", ...base, maxLength: Math.min(5000, Math.max(2000, longest)) }, detail: "Open text" };
}

function toAnswer(block: Block, raw: string): Answer | null {
  const value = raw.trim();
  if (!value) return null;
  switch (block.type) {
    case "opinion_scale": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= block.scale ? { value: n } : null;
    }
    case "yes_no":
      return { value: ["yes", "y", "true"].includes(value.toLowerCase()) ? "yes" : "no" };
    case "multiple_choice": {
      const labels = block.allowMultiple ? value.split(/[|;]/).map((token) => token.trim()).filter(Boolean) : [value];
      const selected = labels.map((label) => block.options.find((option) => option.label === label.slice(0, 200))?.id).filter((id): id is string => Boolean(id));
      return selected.length ? { selected: [...new Set(selected)] } : null;
    }
    case "open_text":
      return { text: value.slice(0, block.maxLength) };
    default:
      return null;
  }
}

export function mapMazeCsv(text: string): { ok: true; mapping: MazeMapping } | { ok: false; error: string } {
  if (text.length > MAZE_MAX_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "The CSV needs a header row and at least one tester row." };
  const [header, ...body] = rows;
  if (body.length > MAZE_MAX_ROWS) return { ok: false, error: `Maze imports are limited to ${MAZE_MAX_ROWS} rows per file.` };

  const columns: MazeColumnReport[] = [];
  const warnings: string[] = [];
  const meta: { id?: number; started?: number; ended?: number; duration?: number; durationUnit: "ms" | "s" | "min"; status?: number } = { durationUnit: "s" };
  const groups = new Map<string, Group>();

  header.forEach((rawHeader, index) => {
    const label = rawHeader.trim() || `Column ${index + 1}`;
    const key = norm(label);
    if (PII.test(key)) return columns.push({ header: label, mapping: "dropped", detail: "Not imported: it can identify a person." });
    if (DEVICE.test(key)) return columns.push({ header: label, mapping: "dropped", detail: "Not imported: Studies does not store device or location data." });
    if (meta.id === undefined && ID.test(key)) {
      meta.id = index;
      return columns.push({ header: label, mapping: "metadata", detail: "Tester id (kept as the session's external reference)" });
    }
    if (meta.started === undefined && STARTED.test(key)) {
      meta.started = index;
      return columns.push({ header: label, mapping: "metadata", detail: "Session start time" });
    }
    if (meta.ended === undefined && ENDED.test(key)) {
      meta.ended = index;
      return columns.push({ header: label, mapping: "metadata", detail: "Session end time" });
    }
    if (meta.duration === undefined && DURATION.test(key)) {
      meta.duration = index;
      meta.durationUnit = /\(ms\)/.test(key) ? "ms" : /\(min/.test(key) ? "min" : "s";
      return columns.push({ header: label, mapping: "metadata", detail: "Session duration" });
    }
    if (meta.status === undefined && STATUS.test(key)) {
      meta.status = index;
      return columns.push({ header: label, mapping: "metadata", detail: "Completion status" });
    }
    const sub = label.match(SUB);
    const stem = sub ? label.slice(0, sub.index).trim() : label;
    const numbered = stem.match(NUMBERED);
    const groupKey = norm(numbered ? `${numbered[1]}` : stem);
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      title: (numbered ? numbered[2] : stem).trim(),
      order: numbered ? Number(numbered[1]) : 10_000 + index,
      main: null,
      outcome: false,
      duration: null,
      durationUnit: "s" as const,
      extras: [],
    };
    const kind = sub?.[1].toLowerCase();
    if (!kind || ["outcome", "result", "status", "success"].includes(kind)) {
      if (group.main === null) {
        group.main = index;
        group.outcome = Boolean(kind);
      } else group.extras.push(index);
    } else if (["duration", "time", "time spent", "time on task"].includes(kind) && group.duration === null) {
      group.duration = index;
      group.durationUnit = /\bms\b/i.test(label) ? "ms" : "s";
    } else group.extras.push(index);
    groups.set(groupKey, group);
  });

  const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
  const blocks: Block[] = [];
  const blockColumns: { block: Block; main: number; duration: number | null; durationUnit: "ms" | "s" | "min" }[] = [];
  ordered.forEach((group) => {
    const columnHeader = (index: number) => header[index]?.trim() || `Column ${index + 1}`;
    if (group.main === null) {
      for (const index of [group.duration, ...group.extras].filter((value): value is number => value !== null)) {
        columns.push({ header: columnHeader(index), mapping: "dropped", detail: "Not imported: no answer column for this block." });
      }
      return;
    }
    const id = `maze_${blocks.length + 1}`;
    const inferred = inferBlock(id, group.title, body.map((row) => row[group.main!] ?? ""), group.outcome);
    if (!inferred) {
      columns.push({ header: columnHeader(group.main), mapping: "dropped", detail: "Not imported: the column is empty." });
      return;
    }
    blocks.push(inferred.block);
    blockColumns.push({ block: inferred.block, main: group.main, duration: group.duration, durationUnit: group.durationUnit });
    columns.push({ header: columnHeader(group.main), mapping: "block", detail: inferred.detail, blockId: id, blockType: inferred.block.type });
    if (group.duration !== null) columns.push({ header: columnHeader(group.duration), mapping: "timing", detail: "Time on this block", blockId: id });
    for (const index of group.extras) {
      columns.push({ header: columnHeader(index), mapping: "dropped", detail: "Not imported: click paths, misclicks and heatmaps are not in a portable form." });
    }
  });

  if (!blocks.length) return { ok: false, error: "No question or mission columns were found in this CSV." };
  const problems = validateStudyStructure(blocks);
  if (problems.length) return { ok: false, error: problems[0] };

  const responses: MazeResponse[] = [];
  const skipped: { row: number; reason: string }[] = [];
  let unmatched = 0;
  body.forEach((row, rowIndex) => {
    const answers: Record<string, Answer> = {};
    const blockTimings: Record<string, number> = {};
    for (const column of blockColumns) {
      const raw = row[column.main] ?? "";
      const answer = toAnswer(column.block, raw);
      if (answer) answers[column.block.id] = answer;
      else if (raw.trim()) unmatched += 1;
      if (column.duration !== null) {
        const ms = parseDuration(row[column.duration] ?? "", column.durationUnit);
        if (ms !== null && answer) blockTimings[column.block.id] = Math.min(ms, 6 * 3_600_000);
      }
    }
    if (!Object.keys(answers).length) {
      skipped.push({ row: rowIndex + 2, reason: "No answers in this row." });
      return;
    }
    const startedAt = meta.started !== undefined ? parseDate(row[meta.started] ?? "") : null;
    const submittedAt = meta.ended !== undefined ? parseDate(row[meta.ended] ?? "") : null;
    let durationMs = meta.duration !== undefined ? parseDuration(row[meta.duration] ?? "", meta.durationUnit) : null;
    if (durationMs === null && startedAt && submittedAt) durationMs = Math.max(0, Date.parse(submittedAt) - Date.parse(startedAt));
    const statusText = meta.status !== undefined ? (row[meta.status] ?? "").trim().toLowerCase() : "";
    const incomplete = /^(abandon|drop|incomplete|in progress|partial|false|no|not )/.test(statusText);
    let externalId = meta.id !== undefined ? (row[meta.id] ?? "").trim().slice(0, 128) || null : null;
    if (externalId?.includes("@")) externalId = null;
    responses.push({
      externalId,
      status: incomplete ? "in_progress" : "completed",
      answers,
      path: blocks.filter((block) => answers[block.id]).map((block) => block.id),
      blockTimings,
      startedAt,
      submittedAt,
      durationMs,
    });
  });

  if (unmatched) warnings.push(`${unmatched} cell(s) did not fit the inferred block type and were left out.`);
  if (header.some((cell) => /email/i.test(cell)) && meta.id !== undefined) warnings.push("Tester ids that look like email addresses are not kept.");
  if (columns.some((column) => column.detail.includes("click paths"))) warnings.push("Maze click paths and heatmaps are not part of this import; only answers and outcomes are.");
  if (meta.duration === undefined && (meta.started === undefined || meta.ended === undefined)) warnings.push("No duration column: speeder flags will not apply to these sessions.");

  return { ok: true, mapping: { blocks, responses, report: { rows: body.length, imported: responses.length, skipped, columns, warnings } } };
}
