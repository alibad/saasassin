import { describe, expect, it } from "vitest";

import { aggregateResults, blockResponsesToCsv, describeAnswer } from "../src/lib/studies/analysis";
import { blockSchema, checkSubmission, defaultBlock, validateAnswer, validateStudyStructure, type Block, type ResponseRecord } from "../src/lib/studies/model";
import {
  evaluateTreeAttempt,
  isDirectPath,
  parseTreeOutline,
  TREE_ROOT,
  treeTaskResults,
  treeToOutline,
  validateTree,
  type TreeTestAnswer,
} from "../src/lib/studies/tree";

const OUTLINE = ["Billing", "  Invoices", "  Payment methods", "Settings", "  Team", "    Members", "  API keys"].join("\n");
const { nodes } = parseTreeOutline(OUTLINE);
const id = (label: string) => nodes.find((node) => node.label === label)!.id;

const tree: Extract<Block, { type: "tree_test" }> = {
  type: "tree_test",
  id: "tree",
  prompt: "Where would you look?",
  required: true,
  logic: [],
  screenOut: [],
  tree: nodes,
  tasks: [
    { id: "t1", prompt: "Download an invoice", correctNodeIds: [id("Invoices")] },
    { id: "t2", prompt: "Invite a teammate", correctNodeIds: [id("Members")] },
  ],
};

describe("tree outline", () => {
  it("parses indentation into parent links with ids stable across unrelated edits", () => {
    expect(nodes.map((node) => node.label)).toEqual(["Billing", "Invoices", "Payment methods", "Settings", "Team", "Members", "API keys"]);
    expect(nodes.find((node) => node.label === "Members")?.parentId).toBe(id("Team"));
    expect(nodes.find((node) => node.label === "API keys")?.parentId).toBe(id("Settings"));
    expect(treeToOutline(nodes)).toBe(OUTLINE);
    const edited = parseTreeOutline(`${OUTLINE}\nHelp\n  Contact`).nodes;
    expect(edited.find((node) => node.label === "Invoices")?.id).toBe(id("Invoices"));
    // Duplicate labels under the same parent still get unique ids.
    const dupes = parseTreeOutline("A\n  x\n  x").nodes;
    expect(new Set(dupes.map((node) => node.id)).size).toBe(3);
    expect(parseTreeOutline("Only one").errors).toContain("A tree needs at least two items.");
  });

  it("validates tasks against the tree", () => {
    expect(validateTree(nodes, tree.tasks)).toEqual([]);
    expect(validateTree(nodes, [{ id: "x", prompt: "?", correctNodeIds: [] }])[0]).toMatch(/correct destination/);
    expect(validateTree(nodes, [{ id: "x", prompt: "?", correctNodeIds: ["n_missing"] }])[0]).toMatch(/not in the tree/);
    expect(validateTree([{ id: "a", label: "A", parentId: "b" }, { id: "b", label: "B", parentId: null }], [])[0]).toMatch(/after its parent/);
    expect(validateStudyStructure([tree])).toEqual([]);
    expect(blockSchema.safeParse(defaultBlock("tree_test")).success).toBe(true);
    expect(validateStudyStructure([defaultBlock("tree_test")])).toEqual([]);
  });
});

describe("tree attempts", () => {
  const direct = { path: [id("Billing"), id("Invoices")], selectedNodeId: id("Invoices"), durationMs: 8000 };
  const backtracked = { path: [id("Settings"), TREE_ROOT, id("Billing"), id("Invoices")], selectedNodeId: id("Invoices"), durationMs: 20000 };
  const wrong = { path: [id("Billing"), id("Payment methods")], selectedNodeId: id("Payment methods"), durationMs: 5000 };

  it("classifies direct/indirect success and failure and skips", () => {
    expect(isDirectPath(nodes, direct.path)).toBe(true);
    expect(isDirectPath(nodes, backtracked.path)).toBe(false);
    expect(evaluateTreeAttempt(nodes, tree.tasks[0], direct)).toBe("direct_success");
    expect(evaluateTreeAttempt(nodes, tree.tasks[0], backtracked)).toBe("indirect_success");
    expect(evaluateTreeAttempt(nodes, tree.tasks[0], wrong)).toBe("direct_failure");
    expect(evaluateTreeAttempt(nodes, tree.tasks[0], { path: [id("Settings"), id("Billing")], selectedNodeId: id("Billing"), durationMs: 1 })).toBe("indirect_failure");
    expect(evaluateTreeAttempt(nodes, tree.tasks[0], { path: [], selectedNodeId: null, durationMs: 1 })).toBe("skip");
  });

  it("validates answers server-side", () => {
    const answer: TreeTestAnswer = { tasks: { t1: direct, t2: { path: [id("Settings")], selectedNodeId: null, durationMs: 3000 } } };
    expect(validateAnswer(tree, answer)).toEqual({ ok: true, answer });
    expect(validateAnswer(tree, { tasks: { t1: direct } })).toMatchObject({ ok: false, error: expect.stringMatching(/Finish every task/) });
    expect(validateAnswer(tree, { tasks: { t1: direct, t9: direct } })).toMatchObject({ ok: false, error: expect.stringMatching(/unknown task/) });
    expect(validateAnswer(tree, { tasks: { t1: { ...direct, path: ["n_fake"] }, t2: direct } }).ok).toBe(false);
    expect(validateAnswer(tree, { tasks: { t1: { ...direct, path: [id("Billing")] }, t2: direct } })).toMatchObject({ ok: false, error: expect.stringMatching(/not opened/) });
    expect(validateAnswer(tree, {}).ok).toBe(false);
    expect(checkSubmission([tree], { tree: answer }, true)).toMatchObject({ ok: true, outcome: "completed" });
  });

  it("aggregates success, directness, time and first-click distribution", () => {
    const [first] = treeTaskResults(nodes, tree.tasks, [
      { tasks: { t1: direct } },
      { tasks: { t1: backtracked } },
      { tasks: { t1: wrong } },
      { tasks: { t1: { path: [], selectedNodeId: null, durationMs: 1000 } } },
    ]);
    expect(first).toMatchObject({ attempts: 4, successes: 2, successRate: 0.5, directness: 0.5, medianMs: 6500 });
    expect(first.outcomes).toEqual({ direct_success: 1, indirect_success: 1, direct_failure: 1, indirect_failure: 0, skip: 1 });
    expect(first.firstClicks[0]).toMatchObject({ label: "Billing", count: 2, correct: true });
    expect(first.firstClicks.find((entry) => entry.label === "Settings")).toMatchObject({ count: 1, correct: false });
    expect(first.destinations[0]).toMatchObject({ label: "Billing › Invoices", count: 2, correct: true });
  });

  it("feeds results, CSV and the session viewer", () => {
    const response: ResponseRecord = {
      id: "r1",
      studyId: "s",
      version: 1,
      status: "completed",
      answers: { tree: { tasks: { t1: backtracked, t2: { path: [id("Settings"), id("Team"), id("Members")], selectedNodeId: id("Members"), durationMs: 4000 } } } },
      path: ["tree"],
      blockTimings: {},
      startedAt: null,
      submittedAt: null,
      durationMs: 30000,
      quality: null,
      source: "participant",
    };
    const result = aggregateResults([tree], [response]).blocks[0];
    expect(result.type === "tree_test" && result.tasks[1].outcomes.direct_success).toBe(1);
    const csv = blockResponsesToCsv(tree, [response]).trim().split("\n");
    expect(csv[0]).toBe("response_id,study_version,status,excluded,submitted_at,task,outcome,selected,clicks,path,duration_ms");
    expect(csv[1]).toContain("indirect_success,Billing › Invoices,4,Settings > (top) > Billing > Invoices,20000");
    expect(csv).toHaveLength(3);
    expect(describeAnswer(tree, response.answers.tree)).toContain("Task 2: Settings › Team › Members (direct success, 3 clicks)");
  });
});
