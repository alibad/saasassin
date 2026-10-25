import {
  blockTitle,
  type Block,
  type CardSortAnswer,
  type ChoiceAnswer,
  type ResponseRecord,
  type ScaleAnswer,
  type StudyRecord,
  type StudyVersion,
  type TextAnswer,
  type WebsiteTaskAnswer,
  type YesNoAnswer,
} from "./model";

/** Pure aggregation of raw responses into per-block results. Raw responses stay available behind every number. */

export type CardSortMatrix = {
  cards: { id: string; label: string }[];
  categories: { id: string; label: string }[];
  /** counts[cardId][categoryId] = participants who placed that card in that category */
  counts: Record<string, Record<string, number>>;
  /** share[cardId][categoryId] in 0..1 of participants who sorted that card */
  share: Record<string, Record<string, number>>;
  /** per-card agreement = largest share for that card (0..1) */
  cardAgreement: Record<string, number>;
  /** mean per-card agreement across cards that were sorted at least once */
  overallAgreement: number;
  sorters: number;
};

export type BlockResult =
  | { blockId: string; type: "welcome"; title: string; reached: number; answered: number; consented: number }
  | {
      blockId: string;
      type: "multiple_choice";
      title: string;
      reached: number;
      answered: number;
      options: { id: string; label: string; count: number; share: number }[];
    }
  | {
      blockId: string;
      type: "opinion_scale";
      title: string;
      reached: number;
      answered: number;
      scale: number;
      distribution: { value: number; count: number }[];
      average: number | null;
    }
  | { blockId: string; type: "yes_no"; title: string; reached: number; answered: number; yes: number; no: number }
  | {
      blockId: string;
      type: "open_text";
      title: string;
      reached: number;
      answered: number;
      entries: { responseId: string; text: string }[];
    }
  | {
      blockId: string;
      type: "website_task";
      title: string;
      reached: number;
      answered: number;
      successes: number;
      successRate: number | null;
      averageMs: number | null;
      medianMs: number | null;
    }
  | { blockId: string; type: "card_sort"; title: string; reached: number; answered: number; matrix: CardSortMatrix };

export type FunnelStep = { blockId: string; title: string; reached: number; dropOff: number };

export type StudyResults = {
  started: number;
  completed: number;
  screenedOut: number;
  inProgress: number;
  completionRate: number | null;
  medianDurationMs: number | null;
  funnel: FunnelStep[];
  averageBlockMs: Record<string, number | null>;
  blocks: BlockResult[];
};

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function cardSortMatrix(
  block: Extract<Block, { type: "card_sort" }>,
  answers: CardSortAnswer[],
): CardSortMatrix {
  const counts: Record<string, Record<string, number>> = {};
  const share: Record<string, Record<string, number>> = {};
  const cardAgreement: Record<string, number> = {};
  for (const card of block.cards) {
    counts[card.id] = Object.fromEntries(block.categories.map((category) => [category.id, 0]));
  }
  for (const answer of answers) {
    for (const [cardId, categoryId] of Object.entries(answer.placements)) {
      if (counts[cardId] && categoryId in counts[cardId]) counts[cardId][categoryId] += 1;
    }
  }
  const agreements: number[] = [];
  for (const card of block.cards) {
    const total = Object.values(counts[card.id]).reduce((sum, value) => sum + value, 0);
    share[card.id] = Object.fromEntries(
      block.categories.map((category) => [category.id, total ? counts[card.id][category.id] / total : 0]),
    );
    const top = total ? Math.max(...Object.values(share[card.id])) : 0;
    cardAgreement[card.id] = top;
    if (total) agreements.push(top);
  }
  return {
    cards: block.cards,
    categories: block.categories,
    counts,
    share,
    cardAgreement,
    overallAgreement: mean(agreements) ?? 0,
    sorters: answers.length,
  };
}

export function aggregateResults(blocks: Block[], responses: ResponseRecord[]): StudyResults {
  const reachedBy = (blockId: string) => responses.filter((response) => response.path.includes(blockId));
  const completed = responses.filter((response) => response.status === "completed");
  const screenedOut = responses.filter((response) => response.status === "screened_out");
  const inProgress = responses.filter((response) => response.status === "in_progress");

  const funnel: FunnelStep[] = blocks.map((block, index) => {
    const reached = reachedBy(block.id).length;
    const previous = index === 0 ? responses.length : reachedBy(blocks[index - 1].id).length;
    return { blockId: block.id, title: blockTitle(block), reached, dropOff: Math.max(previous - reached, 0) };
  });

  const averageBlockMs: Record<string, number | null> = {};
  for (const block of blocks) {
    const timings = responses
      .map((response) => response.blockTimings?.[block.id])
      .filter((value): value is number => typeof value === "number" && value >= 0);
    averageBlockMs[block.id] = mean(timings);
  }

  const results: BlockResult[] = blocks.map((block) => {
    const reachedResponses = reachedBy(block.id);
    const answered = reachedResponses.filter((response) => response.answers[block.id] !== undefined);
    const base = { blockId: block.id, title: blockTitle(block), reached: reachedResponses.length, answered: answered.length };
    switch (block.type) {
      case "welcome":
        return {
          ...base,
          type: "welcome",
          consented: answered.filter((response) => (response.answers[block.id] as { consented?: boolean }).consented).length,
        };
      case "multiple_choice": {
        const selections = answered.map((response) => (response.answers[block.id] as ChoiceAnswer).selected);
        return {
          ...base,
          type: "multiple_choice",
          options: block.options.map((option) => {
            const count = selections.filter((selected) => selected.includes(option.id)).length;
            return { ...option, count, share: answered.length ? count / answered.length : 0 };
          }),
        };
      }
      case "opinion_scale": {
        const values = answered.map((response) => (response.answers[block.id] as ScaleAnswer).value);
        return {
          ...base,
          type: "opinion_scale",
          scale: block.scale,
          distribution: Array.from({ length: block.scale }, (_, index) => ({
            value: index + 1,
            count: values.filter((value) => value === index + 1).length,
          })),
          average: mean(values),
        };
      }
      case "yes_no": {
        const values = answered.map((response) => (response.answers[block.id] as YesNoAnswer).value);
        return { ...base, type: "yes_no", yes: values.filter((value) => value === "yes").length, no: values.filter((value) => value === "no").length };
      }
      case "open_text":
        return {
          ...base,
          type: "open_text",
          entries: answered
            .map((response) => ({ responseId: response.id, text: (response.answers[block.id] as TextAnswer).text }))
            .filter((entry) => entry.text.trim()),
        };
      case "website_task": {
        const tasks = answered.map((response) => response.answers[block.id] as WebsiteTaskAnswer);
        const successes = tasks.filter((task) => task.success).length;
        const durations = tasks.map((task) => task.durationMs);
        return {
          ...base,
          type: "website_task",
          successes,
          successRate: tasks.length ? successes / tasks.length : null,
          averageMs: mean(durations),
          medianMs: median(durations),
        };
      }
      case "card_sort":
        return {
          ...base,
          type: "card_sort",
          matrix: cardSortMatrix(block, answered.map((response) => response.answers[block.id] as CardSortAnswer)),
        };
    }
  });

  return {
    started: responses.length,
    completed: completed.length,
    screenedOut: screenedOut.length,
    inProgress: inProgress.length,
    completionRate: responses.length ? completed.length / responses.length : null,
    medianDurationMs: median(
      [...completed, ...screenedOut]
        .map((response) => response.durationMs)
        .filter((value): value is number => typeof value === "number"),
    ),
    funnel,
    averageBlockMs,
    blocks: results,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const RESPONSES_EXPORT_SCHEMA = "net.saasassin.studies.responses";
export const RESPONSES_EXPORT_VERSION = "1.0.0";

export function buildStudyExport(study: StudyRecord, versions: StudyVersion[], responses: ResponseRecord[], exportedAt = new Date()) {
  return {
    schema: RESPONSES_EXPORT_SCHEMA,
    version: RESPONSES_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    study: {
      id: study.id,
      title: study.title,
      description: study.description,
      status: study.status,
      currentVersion: study.currentVersion,
      settings: study.settings,
    },
    versions,
    responses: [...responses].sort((a, b) => String(a.startedAt ?? "").localeCompare(String(b.startedAt ?? ""))),
  };
}

export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

/** One row per response that answered the block. Pure: same inputs, same CSV. */
export function blockResponsesToCsv(block: Block, responses: ResponseRecord[]): string {
  const answered = responses.filter((response) => response.answers[block.id] !== undefined);
  const lead = (response: ResponseRecord) => [response.id, response.version, response.status, response.submittedAt ?? ""];
  const head = ["response_id", "study_version", "status", "submitted_at"];
  switch (block.type) {
    case "welcome":
      return toCsv([[...head, "consented"], ...answered.map((r) => [...lead(r), (r.answers[block.id] as { consented: boolean }).consented])]);
    case "multiple_choice": {
      const labels = new Map(block.options.map((option) => [option.id, option.label]));
      return toCsv([
        [...head, "selected_ids", "selected_labels"],
        ...answered.map((r) => {
          const selected = (r.answers[block.id] as ChoiceAnswer).selected;
          return [...lead(r), selected.join("|"), selected.map((value) => labels.get(value) ?? value).join("|")];
        }),
      ]);
    }
    case "opinion_scale":
      return toCsv([[...head, "value"], ...answered.map((r) => [...lead(r), (r.answers[block.id] as ScaleAnswer).value])]);
    case "yes_no":
      return toCsv([[...head, "value"], ...answered.map((r) => [...lead(r), (r.answers[block.id] as YesNoAnswer).value])]);
    case "open_text":
      return toCsv([[...head, "text"], ...answered.map((r) => [...lead(r), (r.answers[block.id] as TextAnswer).text])]);
    case "website_task":
      return toCsv([
        [...head, "success", "duration_ms", "opened_site"],
        ...answered.map((r) => {
          const task = r.answers[block.id] as WebsiteTaskAnswer;
          return [...lead(r), task.success, task.durationMs, task.opened];
        }),
      ]);
    case "card_sort": {
      const categories = new Map(block.categories.map((category) => [category.id, category.label]));
      return toCsv([
        [...head, ...block.cards.map((card) => card.label)],
        ...answered.map((r) => {
          const placements = (r.answers[block.id] as CardSortAnswer).placements;
          return [...lead(r), ...block.cards.map((card) => categories.get(placements[card.id]) ?? "")];
        }),
      ]);
    }
  }
}
