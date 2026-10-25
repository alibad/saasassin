/** Insight version history: every create/edit is stored as an immutable version; this diffs two of them. */

export type InsightVersion = {
  id: string;
  insightId: string;
  projectId: string;
  version: number;
  title: string;
  body: string;
  highlightIds: string[];
  themeId: string | null;
  editedBy: string;
  editedAt: string | null;
};

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

const MAX_CELLS = 2_000_000;

/** Word-level diff (longest common subsequence). Very long texts fall back to a whole replacement. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (before === after) return before ? [{ type: "same", text: before }] : [];
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...(before ? [{ type: "removed" as const, text: before }] : []),
      ...(after ? [{ type: "added" as const, text: after }] : []),
    ];
  }
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("removed", a[i]);
      i += 1;
    } else {
      push("added", b[j]);
      j += 1;
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}

export function diffVersions(previous: Pick<InsightVersion, "title" | "body" | "highlightIds" | "themeId"> | null, next: Pick<InsightVersion, "title" | "body" | "highlightIds" | "themeId">) {
  const before = previous ?? { title: "", body: "", highlightIds: [], themeId: null };
  return {
    title: diffWords(before.title, next.title),
    body: diffWords(before.body, next.body),
    evidenceAdded: next.highlightIds.filter((id) => !before.highlightIds.includes(id)),
    evidenceRemoved: before.highlightIds.filter((id) => !next.highlightIds.includes(id)),
    themeChanged: before.themeId !== next.themeId,
  };
}
