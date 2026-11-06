/**
 * Tree testing (pure). A tree is a flat list of nodes whose parent always appears earlier,
 * so it cannot contain cycles and fits Firestore without nested arrays. Participants navigate
 * from the top level; every node they open is recorded in order ("root" = back to the top).
 */

export type TreeNode = { id: string; label: string; parentId: string | null };
export type TreeTask = { id: string; prompt: string; correctNodeIds: string[] };
export type TreeTaskAttempt = { path: string[]; selectedNodeId: string | null; durationMs: number };
export type TreeTestAnswer = { tasks: Record<string, TreeTaskAttempt> };

export const TREE_ROOT = "root";

export const TREE_OUTCOMES = ["direct_success", "indirect_success", "direct_failure", "indirect_failure", "skip"] as const;
export type TreeOutcome = (typeof TREE_OUTCOMES)[number];
export const TREE_OUTCOME_LABELS: Record<TreeOutcome, string> = {
  direct_success: "Direct success",
  indirect_success: "Indirect success",
  direct_failure: "Direct failure",
  indirect_failure: "Indirect failure",
  skip: "Skipped",
};

/** FNV-1a: a stable, short id derived from the node's label path, so edits keep correct answers. */
function hashId(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `n_${(hash >>> 0).toString(36)}`;
}

/**
 * Parses an indented outline (two spaces or a tab per level) into nodes. Ids come from the
 * label path, so renaming a node changes only its own id (and its children's).
 */
export function parseTreeOutline(text: string): { nodes: TreeNode[]; errors: string[] } {
  const nodes: TreeNode[] = [];
  const errors: string[] = [];
  const stack: { indent: number; id: string; path: string }[] = [];
  const used = new Set<string>();
  text.split(/\r?\n/).forEach((raw, lineIndex) => {
    if (!raw.trim()) return;
    const indent = raw.replace(/\t/g, "  ").match(/^ */)?.[0].length ?? 0;
    const label = raw.trim().replace(/^[-*•]\s+/, "").slice(0, 200);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    if (!parent && indent > 0 && nodes.length === 0) {
      errors.push(`Line ${lineIndex + 1}: the first line must not be indented.`);
    }
    const path = parent ? `${parent.path} > ${label.toLowerCase()}` : label.toLowerCase();
    let id = hashId(path);
    for (let suffix = 2; used.has(id); suffix += 1) id = hashId(`${path}#${suffix}`);
    used.add(id);
    nodes.push({ id, label, parentId: parent?.id ?? null });
    stack.push({ indent, id, path });
  });
  if (nodes.length < 2) errors.push("A tree needs at least two items.");
  if (nodes.length > 300) errors.push("Trees can have at most 300 items.");
  return { nodes, errors };
}

export function treeToOutline(nodes: TreeNode[]): string {
  const depth = new Map<string, number>();
  return nodes
    .map((node) => {
      const level = node.parentId ? (depth.get(node.parentId) ?? 0) + 1 : 0;
      depth.set(node.id, level);
      return `${"  ".repeat(level)}${node.label}`;
    })
    .join("\n");
}

/** Structural problems (publish gate). */
export function validateTree(nodes: TreeNode[], tasks: TreeTask[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.id === TREE_ROOT || seen.has(node.id)) problems.push("Tree items need unique ids.");
    if (node.parentId !== null && !seen.has(node.parentId)) problems.push(`"${node.label}" must come after its parent.`);
    seen.add(node.id);
  }
  const taskIds = new Set<string>();
  tasks.forEach((task, index) => {
    if (taskIds.has(task.id)) problems.push("Tree tasks need unique ids.");
    taskIds.add(task.id);
    if (!task.correctNodeIds.length) problems.push(`Tree task ${index + 1} needs at least one correct destination.`);
    if (task.correctNodeIds.some((id) => !seen.has(id))) problems.push(`Tree task ${index + 1} points to an item that is not in the tree.`);
  });
  return [...new Set(problems)];
}

export function childrenOf(nodes: TreeNode[], parentId: string | null) {
  return nodes.filter((node) => node.parentId === parentId);
}

/** Root-first ancestors including the node itself. */
export function lineage(nodes: TreeNode[], nodeId: string | null): TreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: TreeNode[] = [];
  let current = nodeId ? byId.get(nodeId) : undefined;
  while (current && chain.length <= nodes.length) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function nodePathLabel(nodes: TreeNode[], nodeId: string | null) {
  if (!nodeId) return "—";
  return lineage(nodes, nodeId).map((node) => node.label).join(" › ") || nodeId;
}

/** Validates one attempt; the selection (if any) must be the last item the participant opened. */
export function checkTreeAttempt(nodes: TreeNode[], attempt: TreeTaskAttempt): string | null {
  const known = new Set(nodes.map((node) => node.id));
  if (attempt.path.some((id) => id !== TREE_ROOT && !known.has(id))) return "contains an unknown tree item";
  if (attempt.selectedNodeId !== null) {
    if (!known.has(attempt.selectedNodeId)) return "selected an unknown tree item";
    if (attempt.path.at(-1) !== attempt.selectedNodeId) return "selected an item that was not opened";
  }
  return null;
}

/** Direct = went straight down from the top level without ever backing up. */
export function isDirectPath(nodes: TreeNode[], path: string[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return path.every((id, index) => {
    const node = byId.get(id);
    if (!node) return false;
    return index === 0 ? node.parentId === null : node.parentId === path[index - 1];
  });
}

export function evaluateTreeAttempt(nodes: TreeNode[], task: TreeTask, attempt: TreeTaskAttempt): TreeOutcome {
  if (attempt.selectedNodeId === null) return "skip";
  const success = task.correctNodeIds.includes(attempt.selectedNodeId);
  const direct = isDirectPath(nodes, attempt.path);
  if (success) return direct ? "direct_success" : "indirect_success";
  return direct ? "direct_failure" : "indirect_failure";
}

export type TreeDistributionEntry = { nodeId: string; label: string; count: number; share: number; correct: boolean };

export type TreeTaskResult = {
  taskId: string;
  prompt: string;
  attempts: number;
  successes: number;
  successRate: number | null;
  /** Share of attempts that never backed up (skips count as not direct). */
  directness: number | null;
  outcomes: Record<TreeOutcome, number>;
  medianMs: number | null;
  averageMs: number | null;
  /** First item opened; `correct` = it lies on the way to a correct destination. */
  firstClicks: TreeDistributionEntry[];
  /** Where participants said they would find it; `correct` = a correct destination. */
  destinations: TreeDistributionEntry[];
};

function distribution(nodes: TreeNode[], ids: string[], isCorrect: (id: string) => boolean): TreeDistributionEntry[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([nodeId, count]) => ({ nodeId, label: nodePathLabel(nodes, nodeId), count, share: ids.length ? count / ids.length : 0, correct: isCorrect(nodeId) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function treeTaskResults(nodes: TreeNode[], tasks: TreeTask[], answers: TreeTestAnswer[]): TreeTaskResult[] {
  return tasks.map((task) => {
    const attempts = answers.map((answer) => answer.tasks?.[task.id]).filter((attempt): attempt is TreeTaskAttempt => Boolean(attempt));
    const outcomes = Object.fromEntries(TREE_OUTCOMES.map((outcome) => [outcome, 0])) as Record<TreeOutcome, number>;
    for (const attempt of attempts) outcomes[evaluateTreeAttempt(nodes, task, attempt)] += 1;
    const successes = outcomes.direct_success + outcomes.indirect_success;
    const onCorrectPath = new Set(task.correctNodeIds.flatMap((id) => lineage(nodes, id).map((node) => node.id)));
    const firsts = attempts.map((attempt) => attempt.path.find((id) => id !== TREE_ROOT)).filter((id): id is string => Boolean(id));
    const durations = attempts.map((attempt) => attempt.durationMs);
    return {
      taskId: task.id,
      prompt: task.prompt,
      attempts: attempts.length,
      successes,
      successRate: attempts.length ? successes / attempts.length : null,
      directness: attempts.length ? (outcomes.direct_success + outcomes.direct_failure) / attempts.length : null,
      outcomes,
      medianMs: median(durations),
      averageMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null,
      firstClicks: distribution(nodes, firsts, (id) => onCorrectPath.has(id)),
      destinations: distribution(
        nodes,
        attempts.map((attempt) => attempt.selectedNodeId).filter((id): id is string => id !== null),
        (id) => task.correctNodeIds.includes(id),
      ),
    };
  });
}

export const SAMPLE_TREE_OUTLINE = ["Billing", "  Invoices", "  Payment methods", "Settings", "  Team members", "  API keys", "Help", "  Contact support"].join("\n");
