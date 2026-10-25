import { z } from "zod";

/**
 * SaaSassin Studies — portable study model (pure, shared by server and browser).
 *
 * A study is an ordered list of blocks. Researchers edit `draftBlocks` while the
 * study is a draft; publishing freezes an immutable StudyVersion that participants
 * answer and that every response is validated against.
 */

export const STUDY_STATUSES = ["draft", "live", "closed"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

export const STUDY_TRANSITIONS = ["publish", "close", "reopen"] as const;
export type StudyTransition = (typeof STUDY_TRANSITIONS)[number];

export const BLOCK_TYPES = [
  "welcome",
  "multiple_choice",
  "opinion_scale",
  "open_text",
  "yes_no",
  "website_task",
  "card_sort",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  welcome: "Welcome & consent",
  multiple_choice: "Multiple choice",
  opinion_scale: "Opinion scale",
  open_text: "Open text",
  yes_no: "Yes / No",
  website_task: "Website task",
  card_sort: "Card sort",
};

const id = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "Ids may only use letters, numbers, - and _.");
const label = z.string().trim().min(1, "Every option needs a label.").max(200);
const prompt = z.string().trim().min(1, "Every question needs a prompt.").max(1000);

/** Skip-to rule: when the answer equals `equals`, jump forward to `goTo` (a later block id, or "end"). */
export const logicRuleSchema = z.object({ equals: z.string().trim().min(1).max(64), goTo: z.string().trim().min(1).max(64) });
export type LogicRule = z.infer<typeof logicRuleSchema>;

const questionBase = {
  id,
  prompt,
  required: z.boolean().default(true),
  logic: z.array(logicRuleSchema).max(20).default([]),
  /** Answers listed here end the study for the participant ("screened out"). */
  screenOut: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
};

const optionSchema = z.object({ id, label });

export const blockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("welcome"),
    id,
    title: z.string().trim().min(1, "The welcome screen needs a title.").max(200),
    body: z.string().trim().max(4000).default(""),
    consentRequired: z.boolean().default(true),
    consentText: z.string().trim().max(2000).default("I agree to take part. My answers are stored without my name or email."),
  }),
  z.object({
    type: z.literal("multiple_choice"),
    ...questionBase,
    allowMultiple: z.boolean().default(false),
    options: z.array(optionSchema).min(2, "Multiple choice needs at least two options.").max(30),
  }),
  z.object({
    type: z.literal("opinion_scale"),
    ...questionBase,
    scale: z.union([z.literal(5), z.literal(10)]).default(5),
    minLabel: z.string().trim().max(80).default(""),
    maxLabel: z.string().trim().max(80).default(""),
  }),
  z.object({
    type: z.literal("open_text"),
    ...questionBase,
    maxLength: z.number().int().min(10).max(5000).default(2000),
  }),
  z.object({
    type: z.literal("yes_no"),
    ...questionBase,
  }),
  z.object({
    type: z.literal("website_task"),
    ...questionBase,
    url: z.url({ protocol: /^https?$/, message: "Website tasks need an http(s) URL." }),
    successQuestion: z.string().trim().min(1).max(300).default("Were you able to complete the task?"),
  }),
  z.object({
    type: z.literal("card_sort"),
    ...questionBase,
    cards: z.array(optionSchema).min(2, "Card sorts need at least two cards.").max(60),
    categories: z.array(optionSchema).min(2, "Card sorts need at least two categories.").max(20),
  }),
]);
export type Block = z.infer<typeof blockSchema>;
export type QuestionBlock = Exclude<Block, { type: "welcome" }>;

export const studySettingsSchema = z.object({
  participantCap: z.number().int().min(1).max(100000).nullable().default(null),
  closeAt: z.iso.datetime().nullable().default(null),
  endMessage: z.string().trim().max(1000).default("Thank you — your responses were recorded."),
});
export type StudySettings = z.infer<typeof studySettingsSchema>;

export const studyDraftSchema = z.object({
  title: z.string().trim().min(1, "Give the study a title.").max(200),
  description: z.string().trim().max(2000).default(""),
  blocks: z.array(blockSchema).max(60),
  settings: studySettingsSchema,
});
export type StudyDraft = z.infer<typeof studyDraftSchema>;

export type StudyRecord = {
  id: string;
  title: string;
  description: string;
  status: StudyStatus;
  draftBlocks: Block[];
  settings: StudySettings;
  currentVersion: number;
  completedCount: number;
  startedCount: number;
  shareToken: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StudyVersion = {
  studyId: string;
  version: number;
  title: string;
  blocks: Block[];
  settings: StudySettings;
  publishedAt: string | null;
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export type WelcomeAnswer = { consented: boolean };
export type ChoiceAnswer = { selected: string[] };
export type ScaleAnswer = { value: number };
export type TextAnswer = { text: string };
export type YesNoAnswer = { value: "yes" | "no" };
export type WebsiteTaskAnswer = { success: boolean; durationMs: number; opened: boolean };
export type CardSortAnswer = { placements: Record<string, string> };
export type Answer = WelcomeAnswer | ChoiceAnswer | ScaleAnswer | TextAnswer | YesNoAnswer | WebsiteTaskAnswer | CardSortAnswer;

export type ResponseRecord = {
  id: string;
  studyId: string;
  version: number;
  status: "in_progress" | "completed" | "screened_out";
  answers: Record<string, Answer>;
  path: string[];
  blockTimings: Record<string, number>;
  startedAt: string | null;
  submittedAt: string | null;
  durationMs: number | null;
};

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const TRANSITION_TABLE: Record<StudyTransition, { from: StudyStatus; to: StudyStatus }> = {
  publish: { from: "draft", to: "live" },
  close: { from: "live", to: "closed" },
  reopen: { from: "closed", to: "live" },
};

export function availableTransitions(status: StudyStatus): StudyTransition[] {
  return STUDY_TRANSITIONS.filter((transition) => TRANSITION_TABLE[transition].from === status);
}

export type TransitionResult = { ok: true; to: StudyStatus } | { ok: false; error: string };

/** Pure transition guard. Publishing also requires a structurally valid study. */
export function applyTransition(status: StudyStatus, transition: StudyTransition, blocks: Block[] = []): TransitionResult {
  const rule = TRANSITION_TABLE[transition];
  if (rule.from !== status) {
    return { ok: false, error: `A ${status} study cannot ${transition}.` };
  }
  if (transition === "publish") {
    const problems = validateStudyStructure(blocks);
    if (problems.length) return { ok: false, error: problems[0] };
  }
  return { ok: true, to: rule.to };
}

/** Live studies close themselves once the cap is reached or the close date passes. */
export function effectiveStatus(
  study: Pick<StudyRecord, "status" | "settings" | "completedCount">,
  now: Date = new Date(),
): StudyStatus {
  if (study.status !== "live") return study.status;
  if (study.settings.participantCap !== null && study.completedCount >= study.settings.participantCap) return "closed";
  if (study.settings.closeAt && new Date(study.settings.closeAt).getTime() <= now.getTime()) return "closed";
  return "live";
}

export function closedReason(
  study: Pick<StudyRecord, "status" | "settings" | "completedCount">,
  now: Date = new Date(),
): string | null {
  if (study.status === "draft") return "This study has not been published yet.";
  if (study.status === "closed") return "This study is closed.";
  if (study.settings.participantCap !== null && study.completedCount >= study.settings.participantCap) {
    return "This study has reached its participant limit.";
  }
  if (study.settings.closeAt && new Date(study.settings.closeAt).getTime() <= now.getTime()) {
    return "This study closed on its scheduled date.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Structure validation (publish gate)
// ---------------------------------------------------------------------------

export function answerKeysFor(block: Block): string[] {
  switch (block.type) {
    case "multiple_choice":
      return block.options.map((option) => option.id);
    case "yes_no":
      return ["yes", "no"];
    case "opinion_scale":
      return Array.from({ length: block.scale }, (_, index) => String(index + 1));
    case "website_task":
      return ["success", "failure"];
    default:
      return [];
  }
}

export function validateStudyStructure(blocks: Block[]): string[] {
  const problems: string[] = [];
  const parsed = z.array(blockSchema).safeParse(blocks);
  if (!parsed.success) return [parsed.error.issues[0]?.message ?? "A block is invalid."];
  if (!blocks.some((block) => block.type !== "welcome")) problems.push("Add at least one question or task before publishing.");
  const ids = new Set<string>();
  blocks.forEach((block, index) => {
    if (ids.has(block.id)) problems.push(`Block ids must be unique (${block.id}).`);
    ids.add(block.id);
    if (block.type === "welcome" && index !== 0) problems.push("The welcome screen must be the first block.");
    if (block.type === "welcome") return;
    const keys = answerKeysFor(block);
    for (const rule of block.logic) {
      if (keys.length && !keys.includes(rule.equals)) problems.push(`"${block.prompt}" has a logic rule for an unknown answer.`);
      if (rule.goTo === "end") continue;
      const target = blocks.findIndex((candidate) => candidate.id === rule.goTo);
      if (target <= index) problems.push(`"${block.prompt}" can only skip forward to a later block.`);
    }
    for (const value of block.screenOut) {
      if (keys.length && !keys.includes(value)) problems.push(`"${block.prompt}" screens out an unknown answer.`);
    }
    if (block.type === "multiple_choice" || block.type === "card_sort") {
      const optionIds = (block.type === "card_sort" ? [...block.cards, ...block.categories] : block.options).map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) problems.push(`"${block.prompt}" has duplicate option ids.`);
    }
  });
  return problems;
}

// ---------------------------------------------------------------------------
// Answer validation & navigation
// ---------------------------------------------------------------------------

export function isEmptyAnswer(block: Block, answer: unknown): boolean {
  if (answer === undefined || answer === null) return true;
  if (block.type === "multiple_choice") return !(answer as ChoiceAnswer).selected?.length;
  if (block.type === "open_text") return !(answer as TextAnswer).text?.trim();
  if (block.type === "card_sort") return !Object.keys((answer as CardSortAnswer).placements ?? {}).length;
  return false;
}

/** Validates one answer against its block schema. Returns the normalized answer or an error. */
export function validateAnswer(block: Block, raw: unknown): { ok: true; answer: Answer | null } | { ok: false; error: string } {
  const label = block.type === "welcome" ? block.title : block.prompt;
  if (isEmptyAnswer(block, raw)) {
    if (block.type === "welcome") {
      return block.consentRequired ? { ok: false, error: "Consent is required to take part." } : { ok: true, answer: { consented: false } };
    }
    return block.required ? { ok: false, error: `"${label}" needs an answer.` } : { ok: true, answer: null };
  }
  switch (block.type) {
    case "welcome": {
      const parsed = z.object({ consented: z.boolean() }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: "Consent answer is malformed." };
      if (block.consentRequired && !parsed.data.consented) return { ok: false, error: "Consent is required to take part." };
      return { ok: true, answer: parsed.data };
    }
    case "multiple_choice": {
      const parsed = z.object({ selected: z.array(z.string()).min(1) }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" answer is malformed.` };
      const known = new Set(block.options.map((option) => option.id));
      const selected = [...new Set(parsed.data.selected)];
      if (selected.some((value) => !known.has(value))) return { ok: false, error: `"${label}" has an unknown option.` };
      if (!block.allowMultiple && selected.length > 1) return { ok: false, error: `"${label}" accepts one option.` };
      return { ok: true, answer: { selected } };
    }
    case "opinion_scale": {
      const parsed = z.object({ value: z.number().int().min(1).max(block.scale) }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" must be between 1 and ${block.scale}.` };
      return { ok: true, answer: parsed.data };
    }
    case "open_text": {
      const parsed = z.object({ text: z.string().trim().max(block.maxLength) }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" is too long.` };
      return { ok: true, answer: parsed.data };
    }
    case "yes_no": {
      const parsed = z.object({ value: z.enum(["yes", "no"]) }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" must be yes or no.` };
      return { ok: true, answer: parsed.data };
    }
    case "website_task": {
      const parsed = z
        .object({ success: z.boolean(), durationMs: z.number().int().min(0).max(1000 * 60 * 60 * 6), opened: z.boolean() })
        .safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" task result is malformed.` };
      return { ok: true, answer: parsed.data };
    }
    case "card_sort": {
      const parsed = z.object({ placements: z.record(z.string(), z.string()) }).safeParse(raw);
      if (!parsed.success) return { ok: false, error: `"${label}" sort is malformed.` };
      const cards = new Set(block.cards.map((card) => card.id));
      const categories = new Set(block.categories.map((category) => category.id));
      for (const [card, category] of Object.entries(parsed.data.placements)) {
        if (!cards.has(card) || !categories.has(category)) return { ok: false, error: `"${label}" has an unknown card or category.` };
      }
      if (block.required && Object.keys(parsed.data.placements).length !== cards.size) {
        return { ok: false, error: `Sort every card in "${label}".` };
      }
      return { ok: true, answer: parsed.data };
    }
  }
}

/** The values an answer "matches" for logic and screener rules. */
export function answerMatchKeys(block: Block, answer: Answer | null): string[] {
  if (!answer) return [];
  switch (block.type) {
    case "multiple_choice":
      return (answer as ChoiceAnswer).selected;
    case "yes_no":
      return [(answer as YesNoAnswer).value];
    case "opinion_scale":
      return [String((answer as ScaleAnswer).value)];
    case "website_task":
      return [(answer as WebsiteTaskAnswer).success ? "success" : "failure"];
    default:
      return [];
  }
}

export type NextStep = { kind: "block"; blockId: string } | { kind: "end" } | { kind: "screened_out" };

export function nextStep(blocks: Block[], currentId: string, answer: Answer | null): NextStep {
  const index = blocks.findIndex((block) => block.id === currentId);
  const block = blocks[index];
  if (!block) return { kind: "end" };
  if (block.type !== "welcome") {
    const keys = answerMatchKeys(block, answer);
    if (block.screenOut.some((value) => keys.includes(value))) return { kind: "screened_out" };
    const rule = block.logic.find((candidate) => keys.includes(candidate.equals));
    if (rule) {
      if (rule.goTo === "end") return { kind: "end" };
      const target = blocks.findIndex((candidate) => candidate.id === rule.goTo);
      if (target > index) return { kind: "block", blockId: rule.goTo };
    }
  }
  const following = blocks[index + 1];
  return following ? { kind: "block", blockId: following.id } : { kind: "end" };
}

export type SubmissionCheck =
  | {
      ok: true;
      path: string[];
      answers: Record<string, Answer>;
      outcome: "completed" | "screened_out" | "in_progress";
    }
  | { ok: false; error: string };

/**
 * Server-side validation of a (partial or final) submission against a frozen version.
 * The path is recomputed from the answers — the browser never decides which blocks
 * a participant saw, and answers to blocks off the path are dropped.
 */
export function checkSubmission(blocks: Block[], rawAnswers: Record<string, unknown>, final: boolean): SubmissionCheck {
  const path: string[] = [];
  const answers: Record<string, Answer> = {};
  let current: Block | undefined = blocks[0];
  while (current) {
    path.push(current.id);
    const raw = rawAnswers[current.id];
    if (raw === undefined && !final) {
      return { ok: true, path, answers, outcome: "in_progress" };
    }
    const result = validateAnswer(current, raw);
    if (!result.ok) return { ok: false, error: result.error };
    if (result.answer) answers[current.id] = result.answer;
    const step = nextStep(blocks, current.id, result.answer);
    if (step.kind === "screened_out") return { ok: true, path, answers, outcome: "screened_out" };
    if (step.kind === "end") return { ok: true, path, answers, outcome: "completed" };
    current = blocks.find((block) => block.id === step.blockId);
  }
  return { ok: true, path, answers, outcome: "completed" };
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

export function newId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${random}`;
}

export function defaultBlock(type: BlockType): Block {
  const base = { id: newId(type.split("_")[0]), required: true, logic: [], screenOut: [] };
  switch (type) {
    case "welcome":
      return {
        type,
        id: newId("welcome"),
        title: "Welcome to our study",
        body: "This takes about 5 minutes. There are no right or wrong answers.",
        consentRequired: true,
        consentText: "I agree to take part. My answers are stored without my name or email.",
      };
    case "multiple_choice":
      return {
        type,
        ...base,
        prompt: "Which option best describes you?",
        allowMultiple: false,
        options: [
          { id: newId("opt"), label: "Option A" },
          { id: newId("opt"), label: "Option B" },
        ],
      };
    case "opinion_scale":
      return { type, ...base, prompt: "How easy was that?", scale: 5, minLabel: "Very hard", maxLabel: "Very easy" };
    case "open_text":
      return { type, ...base, prompt: "What, if anything, was confusing?", required: false, maxLength: 2000 };
    case "yes_no":
      return { type, ...base, prompt: "Have you used a product like this before?" };
    case "website_task":
      return {
        type,
        ...base,
        prompt: "Find the pricing page and pick the plan you would choose.",
        url: "https://example.com",
        successQuestion: "Were you able to complete the task?",
      };
    case "card_sort":
      return {
        type,
        ...base,
        prompt: "Sort each card into the group where you would expect to find it.",
        cards: [
          { id: newId("card"), label: "Invoices" },
          { id: newId("card"), label: "Team members" },
          { id: newId("card"), label: "API keys" },
        ],
        categories: [
          { id: newId("cat"), label: "Billing" },
          { id: newId("cat"), label: "Settings" },
        ],
      };
  }
}

export function blockTitle(block: Block) {
  return block.type === "welcome" ? block.title : block.prompt;
}
