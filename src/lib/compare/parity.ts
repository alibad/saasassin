/**
 * Reads a competitor parity matrix (docs/competitors/<slug>/parity.md) into counts the
 * compare page can show. The daily build loop edits that file as slices ship, so the
 * page picks up progress on the next deploy without anyone touching page code.
 *
 * The parser is deliberately forgiving: it looks for markdown tables whose header has a
 * "capability" column and a "status" column, reads `have` / `partial` / `missing` from
 * the start of the status cell (bold or not), and ignores every other table. If nothing
 * recognisable is found it returns null and the page hides the section.
 */

export type ParityStatus = "have" | "partial" | "missing";
export type ParityValue = "H" | "M" | "L";

export type ParityRow = {
  id: string;
  capability: string;
  /** Short module label from the nearest heading, e.g. "ORG". */
  module: string;
  status: ParityStatus;
  value: ParityValue | null;
  /** Build-order rank; null when the row has none ("—"). */
  rank: number | null;
};

export type ParityModuleSummary = {
  module: string;
  have: number;
  partial: number;
  missing: number;
};

export type ParitySummary = {
  total: number;
  have: number;
  partial: number;
  missing: number;
  rows: ParityRow[];
  /** High-value rows with status `missing`, lowest rank (next to build) first. */
  highValueMissing: ParityRow[];
  modules: ParityModuleSummary[];
};

const STATUS_PATTERN = /^(have|partial|missing)\b/;
const SEPARATOR_PATTERN = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Splits one markdown table line into trimmed cells, honouring escaped pipes (`\|`). */
export function splitMarkdownRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;

  const cells: string[] = [];
  let current = "";
  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && trimmed[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  // A row normally ends with "|"; keep a trailing cell only when it does not.
  if (current.trim()) cells.push(current.trim());
  return cells;
}

/** Removes the inline markdown the matrix uses: bold, italics, code and links. */
export function stripInlineMarkdown(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\W)\*([^*]+)\*(?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStatus(cell: string): ParityStatus | null {
  const plain = cell.replace(/[*`_]/g, "").trim().toLowerCase();
  const match = plain.match(STATUS_PATTERN);
  return match ? (match[1] as ParityStatus) : null;
}

function parseValue(cell: string | undefined): ParityValue | null {
  const plain = (cell ?? "").replace(/[*`_]/g, "").trim().toUpperCase();
  return plain === "H" || plain === "M" || plain === "L" ? plain : null;
}

function parseRank(cell: string | undefined): number | null {
  const plain = (cell ?? "").replace(/[*`_]/g, "").trim();
  return /^\d+$/.test(plain) ? Number(plain) : null;
}

function moduleLabel(heading: string) {
  const plain = stripInlineMarkdown(heading);
  const [label] = plain.split(/\s+[—–-]\s+/);
  return label.trim() || plain;
}

type ColumnMap = { id: number; capability: number; status: number; value: number; rank: number };

function columnsFor(header: string[]): ColumnMap | null {
  const names = header.map((cell) => stripInlineMarkdown(cell).toLowerCase());
  const find = (predicate: (name: string) => boolean) => names.findIndex(predicate);
  const columns = {
    id: find((name) => name === "id"),
    capability: find((name) => name === "capability"),
    status: find((name) => name.includes("status")),
    value: find((name) => name === "value"),
    rank: find((name) => name === "rank"),
  };
  return columns.capability >= 0 && columns.status >= 0 ? columns : null;
}

function compareRank(left: ParityRow, right: ParityRow) {
  const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.id.localeCompare(right.id);
}

export function parseParityMarkdown(markdown: string): ParitySummary | null {
  if (typeof markdown !== "string" || !markdown.trim()) return null;

  const lines = markdown.split(/\r?\n/);
  const rows: ParityRow[] = [];
  let currentModule = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = line.match(/^#{2,4}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      currentModule = moduleLabel(heading[1]);
      continue;
    }

    const header = splitMarkdownRow(line);
    if (!header || !SEPARATOR_PATTERN.test((lines[index + 1] ?? "").trim())) continue;

    const columns = columnsFor(header);
    index += 1; // skip the separator
    while (index + 1 < lines.length) {
      const cells = splitMarkdownRow(lines[index + 1]);
      if (!cells) break;
      index += 1;
      if (!columns) continue;

      const status = parseStatus(cells[columns.status] ?? "");
      const capability = stripInlineMarkdown(cells[columns.capability] ?? "");
      if (!status || !capability) continue;

      rows.push({
        id: columns.id >= 0 ? stripInlineMarkdown(cells[columns.id] ?? "") : "",
        capability,
        module: currentModule,
        status,
        value: columns.value >= 0 ? parseValue(cells[columns.value]) : null,
        rank: columns.rank >= 0 ? parseRank(cells[columns.rank]) : null,
      });
    }
  }

  if (rows.length === 0) return null;

  const modules: ParityModuleSummary[] = [];
  for (const row of rows) {
    let summary = modules.find((entry) => entry.module === row.module);
    if (!summary) {
      summary = { module: row.module, have: 0, partial: 0, missing: 0 };
      modules.push(summary);
    }
    summary[row.status] += 1;
  }

  const count = (status: ParityStatus) => rows.filter((row) => row.status === status).length;

  return {
    total: rows.length,
    have: count("have"),
    partial: count("partial"),
    missing: count("missing"),
    rows,
    highValueMissing: rows
      .filter((row) => row.status === "missing" && row.value === "H")
      .sort(compareRank),
    modules,
  };
}

/** Whole-number percentage of `part` in `total`, safe for an empty matrix. */
export function percentOf(part: number, total: number) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}
