import { describe, expect, it } from "vitest";

import {
  aggregateResults,
  blockResponsesToCsv,
  buildStudyExport,
  cardSortMatrix,
  csvEscape,
} from "../src/lib/studies/analysis";
import {
  applyTransition,
  availableTransitions,
  blockSchema,
  checkSubmission,
  closedReason,
  effectiveStatus,
  nextStep,
  validateAnswer,
  validateStudyStructure,
  type Block,
  type ResponseRecord,
  type StudySettings,
} from "../src/lib/studies/model";

const settings: StudySettings = { participantCap: null, closeAt: null, endMessage: "Thanks" };

const blocks: Block[] = [
  { type: "welcome", id: "w", title: "Hi", body: "", consentRequired: true, consentText: "I agree" },
  {
    type: "yes_no",
    id: "screen",
    prompt: "Are you over 18?",
    required: true,
    logic: [],
    screenOut: ["no"],
  },
  {
    type: "multiple_choice",
    id: "role",
    prompt: "Role?",
    required: true,
    logic: [{ equals: "pm", goTo: "sort" }],
    screenOut: [],
    allowMultiple: false,
    options: [
      { id: "pm", label: "PM" },
      { id: "eng", label: "Engineer" },
    ],
  },
  { type: "opinion_scale", id: "ease", prompt: "Ease?", required: true, logic: [], screenOut: [], scale: 5, minLabel: "", maxLabel: "" },
  {
    type: "website_task",
    id: "task",
    prompt: "Find pricing",
    required: true,
    logic: [],
    screenOut: [],
    url: "https://example.com",
    successQuestion: "Done?",
  },
  {
    type: "card_sort",
    id: "sort",
    prompt: "Sort",
    required: true,
    logic: [],
    screenOut: [],
    cards: [
      { id: "c1", label: "Invoices" },
      { id: "c2", label: "Keys" },
    ],
    categories: [
      { id: "billing", label: "Billing" },
      { id: "settings", label: "Settings" },
    ],
  },
  { type: "open_text", id: "notes", prompt: "Anything else?", required: false, logic: [], screenOut: [], maxLength: 50 },
];

function response(partial: Partial<ResponseRecord> & { id: string }): ResponseRecord {
  return {
    studyId: "s1",
    version: 1,
    status: "completed",
    answers: {},
    path: [],
    blockTimings: {},
    startedAt: "2026-10-26T00:00:00.000Z",
    submittedAt: "2026-10-26T00:05:00.000Z",
    durationMs: 1000,
    ...partial,
  };
}

describe("study state machine", () => {
  it("allows only draft→live→closed→live", () => {
    expect(availableTransitions("draft")).toEqual(["publish"]);
    expect(availableTransitions("live")).toEqual(["close"]);
    expect(availableTransitions("closed")).toEqual(["reopen"]);
    expect(applyTransition("draft", "publish", blocks)).toEqual({ ok: true, to: "live" });
    expect(applyTransition("live", "close")).toEqual({ ok: true, to: "closed" });
    expect(applyTransition("closed", "reopen")).toEqual({ ok: true, to: "live" });
    expect(applyTransition("draft", "close").ok).toBe(false);
    expect(applyTransition("live", "publish", blocks).ok).toBe(false);
  });

  it("refuses to publish an empty or broken study", () => {
    expect(applyTransition("draft", "publish", [blocks[0]])).toEqual({
      ok: false,
      error: "Add at least one question or task before publishing.",
    });
    const backwards = structuredClone(blocks);
    (backwards[3] as Extract<Block, { type: "opinion_scale" }>).logic = [{ equals: "3", goTo: "screen" }];
    expect(validateStudyStructure(backwards)[0]).toMatch(/skip forward/);
    const misplacedWelcome = [blocks[1], blocks[0]];
    expect(validateStudyStructure(misplacedWelcome)).toContain("The welcome screen must be the first block.");
  });

  it("auto-closes live studies at the cap or close date", () => {
    const live = { status: "live" as const, settings, completedCount: 3 };
    expect(effectiveStatus(live)).toBe("live");
    expect(effectiveStatus({ ...live, settings: { ...settings, participantCap: 3 } })).toBe("closed");
    const closeAt = { ...live, settings: { ...settings, closeAt: "2026-01-01T00:00:00.000Z" } };
    expect(effectiveStatus(closeAt, new Date("2026-02-01"))).toBe("closed");
    expect(effectiveStatus(closeAt, new Date("2025-12-01"))).toBe("live");
    expect(closedReason({ ...live, status: "closed" })).toBe("This study is closed.");
  });
});

describe("block schemas and answer validation", () => {
  it("rejects malformed blocks", () => {
    expect(blockSchema.safeParse({ type: "multiple_choice", id: "x", prompt: "Q", options: [{ id: "a", label: "A" }] }).success).toBe(false);
    expect(blockSchema.safeParse({ type: "website_task", id: "x", prompt: "Q", url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("validates answers against each block type", () => {
    expect(validateAnswer(blocks[0], { consented: false }).ok).toBe(false);
    expect(validateAnswer(blocks[2], { selected: ["pm", "eng"] }).ok).toBe(false);
    expect(validateAnswer(blocks[2], { selected: ["nope"] }).ok).toBe(false);
    expect(validateAnswer(blocks[3], { value: 6 }).ok).toBe(false);
    expect(validateAnswer(blocks[3], { value: 4 })).toEqual({ ok: true, answer: { value: 4 } });
    expect(validateAnswer(blocks[5], { placements: { c1: "billing" } }).ok).toBe(false);
    expect(validateAnswer(blocks[5], { placements: { c1: "billing", c2: "ghost" } }).ok).toBe(false);
    expect(validateAnswer(blocks[6], undefined)).toEqual({ ok: true, answer: null });
    expect(validateAnswer(blocks[6], { text: "x".repeat(51) }).ok).toBe(false);
  });
});

describe("navigation and submission checks", () => {
  it("follows skip logic and screeners", () => {
    expect(nextStep(blocks, "screen", { value: "no" })).toEqual({ kind: "screened_out" });
    expect(nextStep(blocks, "role", { selected: ["pm"] })).toEqual({ kind: "block", blockId: "sort" });
    expect(nextStep(blocks, "role", { selected: ["eng"] })).toEqual({ kind: "block", blockId: "ease" });
    expect(nextStep(blocks, "notes", null)).toEqual({ kind: "end" });
  });

  it("recomputes the path server-side and drops off-path answers", () => {
    const result = checkSubmission(
      blocks,
      {
        w: { consented: true },
        screen: { value: "yes" },
        role: { selected: ["pm"] },
        ease: { value: 2 },
        sort: { placements: { c1: "billing", c2: "settings" } },
      },
      true,
    );
    expect(result).toMatchObject({ ok: true, outcome: "completed", path: ["w", "screen", "role", "sort", "notes"] });
    if (result.ok) expect(result.answers.ease).toBeUndefined();
  });

  it("ends screened-out participants and rejects missing required answers", () => {
    expect(checkSubmission(blocks, { w: { consented: true }, screen: { value: "no" } }, true)).toMatchObject({
      ok: true,
      outcome: "screened_out",
      path: ["w", "screen"],
    });
    expect(checkSubmission(blocks, { w: { consented: true }, screen: { value: "yes" } }, true).ok).toBe(false);
    expect(checkSubmission(blocks, { w: { consented: true }, screen: { value: "yes" } }, false)).toMatchObject({
      ok: true,
      outcome: "in_progress",
      path: ["w", "screen", "role"],
    });
    expect(checkSubmission(blocks, {}, true)).toEqual({ ok: false, error: "Consent is required to take part." });
  });
});

describe("result aggregation", () => {
  const responses = [
    response({
      id: "r1",
      path: ["w", "screen", "role", "ease", "task", "sort", "notes"],
      answers: {
        w: { consented: true },
        screen: { value: "yes" },
        role: { selected: ["eng"] },
        ease: { value: 4 },
        task: { success: true, durationMs: 10000, opened: true },
        sort: { placements: { c1: "billing", c2: "settings" } },
        notes: { text: "Nice" },
      },
      blockTimings: { ease: 2000 },
    }),
    response({
      id: "r2",
      path: ["w", "screen", "role", "ease", "task", "sort", "notes"],
      answers: {
        w: { consented: true },
        screen: { value: "yes" },
        role: { selected: ["eng"] },
        ease: { value: 2 },
        task: { success: false, durationMs: 30000, opened: true },
        sort: { placements: { c1: "billing", c2: "billing" } },
      },
      blockTimings: { ease: 4000 },
    }),
    response({ id: "r3", status: "screened_out", path: ["w", "screen"], answers: { w: { consented: true }, screen: { value: "no" } } }),
    response({ id: "r4", status: "in_progress", path: ["w"], answers: {}, submittedAt: null, durationMs: null }),
  ];

  it("computes counts, distributions, averages, funnel and time on task", () => {
    const results = aggregateResults(blocks, responses);
    expect(results).toMatchObject({ started: 4, completed: 2, screenedOut: 1, inProgress: 1, completionRate: 0.5 });
    expect(results.funnel.map((step) => step.reached)).toEqual([4, 3, 2, 2, 2, 2, 2]);
    expect(results.funnel[0]).toMatchObject({ dropOff: 1, screenedOut: 0 });
    expect(results.funnel[1]).toMatchObject({ dropOff: 0, screenedOut: 1 });
    expect(results.funnel.slice(2).every((step) => step.dropOff === 0)).toBe(true);
    expect(results.averageBlockMs.ease).toBe(3000);
    const ease = results.blocks.find((block) => block.blockId === "ease");
    expect(ease).toMatchObject({ average: 3, answered: 2 });
    if (ease?.type === "opinion_scale") expect(ease.distribution.map((step) => step.count)).toEqual([0, 1, 0, 1, 0]);
    expect(results.blocks.find((block) => block.blockId === "screen")).toMatchObject({ yes: 2, no: 1 });
    expect(results.blocks.find((block) => block.blockId === "task")).toMatchObject({ successRate: 0.5, averageMs: 20000, medianMs: 20000 });
    expect(results.blocks.find((block) => block.blockId === "notes")).toMatchObject({ entries: [{ responseId: "r1", text: "Nice" }] });
    const role = results.blocks.find((block) => block.blockId === "role");
    if (role?.type === "multiple_choice") expect(role.options.map((option) => option.share)).toEqual([0, 1]);
  });

  it("computes card-sort agreement", () => {
    const sortBlock = blocks[5] as Extract<Block, { type: "card_sort" }>;
    const matrix = cardSortMatrix(sortBlock, [
      { placements: { c1: "billing", c2: "settings" } },
      { placements: { c1: "billing", c2: "billing" } },
      { placements: { c1: "billing", c2: "settings" } },
      { placements: { c1: "settings" } },
    ]);
    expect(matrix.counts.c1).toEqual({ billing: 3, settings: 1 });
    expect(matrix.share.c1.billing).toBe(0.75);
    expect(matrix.cardAgreement.c1).toBe(0.75);
    expect(matrix.cardAgreement.c2).toBeCloseTo(2 / 3);
    expect(matrix.overallAgreement).toBeCloseTo((0.75 + 2 / 3) / 2);
    expect(cardSortMatrix(sortBlock, []).overallAgreement).toBe(0);
  });

  it("exports versioned JSON and per-block CSV", () => {
    const exported = buildStudyExport(
      {
        id: "s1",
        title: "T",
        description: "",
        status: "live",
        draftBlocks: blocks,
        settings,
        currentVersion: 1,
        completedCount: 2,
        startedCount: 4,
        shareToken: "secret",
        createdAt: null,
        updatedAt: null,
      },
      [],
      responses,
      new Date("2026-10-26T00:00:00.000Z"),
    );
    expect(exported).toMatchObject({ schema: "net.saasassin.studies.responses", version: "1.0.0" });
    expect(JSON.stringify(exported)).not.toContain("secret");
    expect(blockResponsesToCsv(blocks[5], responses)).toBe(
      "response_id,study_version,status,submitted_at,Invoices,Keys\n" +
        "r1,1,completed,2026-10-26T00:05:00.000Z,Billing,Settings\n" +
        "r2,1,completed,2026-10-26T00:05:00.000Z,Billing,Billing\n",
    );
    expect(csvEscape('He said "hi", then\nleft')).toBe('"He said ""hi"", then\nleft"');
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
  });
});
