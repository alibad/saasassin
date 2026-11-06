"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, CircleCheck, CornerLeftUp, Folder, FileText, Plus, SkipForward, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { newId, type Block } from "@/lib/studies/model";
import {
  childrenOf,
  lineage,
  parseTreeOutline,
  TREE_OUTCOME_LABELS,
  TREE_OUTCOMES,
  TREE_ROOT,
  treeToOutline,
  type TreeTaskAttempt,
  type TreeTaskResult,
  type TreeTestAnswer,
} from "@/lib/studies/tree";

import { panel, pct, seconds } from "./results-view";

type TreeBlock = Extract<Block, { type: "tree_test" }>;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function TreeTestFields({ block, onChange, disabled }: { block: TreeBlock; onChange: (block: Block) => void; disabled: boolean }) {
  const [outline, setOutline] = useState(() => treeToOutline(block.tree));
  const [errors, setErrors] = useState<string[]>([]);
  const depth = new Map<string, number>();
  for (const node of block.tree) depth.set(node.id, node.parentId ? (depth.get(node.parentId) ?? 0) + 1 : 0);

  function updateOutline(text: string) {
    setOutline(text);
    const parsed = parseTreeOutline(text);
    setErrors(parsed.errors);
    if (parsed.errors.length) return;
    const known = new Set(parsed.nodes.map((node) => node.id));
    onChange({
      ...block,
      tree: parsed.nodes,
      tasks: block.tasks.map((task) => ({ ...task, correctNodeIds: task.correctNodeIds.filter((id) => known.has(id)) })),
    });
  }

  const setTask = (taskId: string, patch: Partial<TreeBlock["tasks"][number]>) =>
    onChange({ ...block, tasks: block.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)) });

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${block.id}-outline`}>Navigation tree</Label>
        <Textarea
          id={`${block.id}-outline`}
          rows={Math.min(14, Math.max(6, block.tree.length + 1))}
          className="font-mono text-sm"
          disabled={disabled}
          value={outline}
          onChange={(event) => updateOutline(event.target.value)}
        />
        <p className="text-xs text-[#555]">One item per line; indent two spaces per level. Correct answers survive edits as long as the item keeps its name and place.</p>
        {errors.length ? <p className="text-sm text-[#8a1c1c]">{errors[0]}</p> : null}
      </div>
      <ol className="grid gap-3">
        {block.tasks.map((task, index) => (
          <li key={task.id} className="grid gap-2 border border-[#111] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${task.id}-prompt`}>Task {index + 1}</Label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove task ${index + 1}`}
                disabled={disabled || block.tasks.length <= 1}
                onClick={() => onChange({ ...block, tasks: block.tasks.filter((candidate) => candidate.id !== task.id) })}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <Textarea id={`${task.id}-prompt`} rows={2} disabled={disabled} value={task.prompt} onChange={(event) => setTask(task.id, { prompt: event.target.value })} />
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-sm font-medium">Correct destination(s)</legend>
              <div className="grid max-h-56 gap-1 overflow-y-auto border border-dashed border-[#111] p-2">
                {block.tree.map((node) => (
                  <label key={node.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${(depth.get(node.id) ?? 0) * 16}px` }}>
                    <Checkbox
                      checked={task.correctNodeIds.includes(node.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        setTask(task.id, {
                          correctNodeIds: checked ? [...task.correctNodeIds, node.id] : task.correctNodeIds.filter((id) => id !== node.id),
                        })
                      }
                    />
                    {node.label}
                  </label>
                ))}
              </div>
              {task.correctNodeIds.length === 0 ? <p className="text-sm text-[#8a1c1c]">Pick at least one correct destination.</p> : null}
            </fieldset>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={disabled || block.tasks.length >= 10}
        onClick={() => onChange({ ...block, tasks: [...block.tasks, { id: newId("task"), prompt: "Where would you find…", correctNodeIds: [] }] })}
      >
        <Plus className="size-4" aria-hidden="true" /> Add task
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

/** Text-only navigation (no visual design), one task at a time; every opened item is recorded. */
export function TreeTestInput({ block, value, onChange }: { block: TreeBlock; value: unknown; onChange: (value: TreeTestAnswer) => void }) {
  const done = (value as TreeTestAnswer | undefined)?.tasks ?? {};
  const task = block.tasks.find((candidate) => !done[candidate.id]);
  const taskIndex = task ? block.tasks.indexOf(task) : block.tasks.length;
  const [current, setCurrent] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
  }, [task?.id]);

  if (!task) {
    return (
      <div className="grid gap-2">
        <h1 className="break-words text-xl font-semibold sm:text-2xl">{block.prompt}</h1>
        <p className="flex items-center gap-2 border border-[#111] bg-white p-3">
          <CircleCheck className="size-5" aria-hidden="true" /> All {block.tasks.length} tasks done. Press Next to continue.
        </p>
      </div>
    );
  }

  function open(nodeId: string | null) {
    setPath((previous) => [...previous, nodeId ?? TREE_ROOT]);
    setCurrent(nodeId);
  }

  function finish(selectedNodeId: string | null) {
    if (!task) return;
    const attempt: TreeTaskAttempt = { path, selectedNodeId, durationMs: Math.max(0, Date.now() - startedAt.current) };
    onChange({ tasks: { ...done, [task.id]: attempt } });
    setPath([]);
    setCurrent(null);
  }

  const crumbs = lineage(block.tree, current);
  const items = childrenOf(block.tree, current);
  const here = current ? block.tree.find((node) => node.id === current) : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <p className="text-sm text-[#555]">{block.prompt}</p>
        <p className="text-xs font-semibold uppercase tracking-wide">
          Task {taskIndex + 1} of {block.tasks.length}
        </p>
        <h1 className="break-words text-xl font-semibold sm:text-2xl">{task.prompt}</h1>
      </div>
      <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-sm">
        <Button type="button" size="sm" variant={current === null ? "default" : "outline"} onClick={() => current !== null && open(null)}>
          Top
        </Button>
        {crumbs.map((node) => (
          <span key={node.id} className="flex items-center gap-1">
            <ChevronRight className="size-4" aria-hidden="true" />
            <Button type="button" size="sm" variant={node.id === current ? "default" : "outline"} onClick={() => node.id !== current && open(node.id)}>
              {node.label}
            </Button>
          </span>
        ))}
      </nav>
      {items.length ? (
        <ul className="grid gap-2" aria-label={here ? `Inside ${here.label}` : "Top level"}>
          {items.map((node) => {
            const hasChildren = block.tree.some((candidate) => candidate.parentId === node.id);
            return (
              <li key={node.id}>
                <Button type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => open(node.id)}>
                  {hasChildren ? <Folder className="size-4 shrink-0" aria-hidden="true" /> : <FileText className="size-4 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 break-words">{node.label}</span>
                  {hasChildren ? <ChevronRight className="size-4 shrink-0" aria-hidden="true" /> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border border-dashed border-[#111] p-3 text-sm">“{here?.label}” has nothing inside it.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={!here} onClick={() => finish(current)}>
          <CircleCheck className="size-4" aria-hidden="true" /> {here ? `I'd find it in “${here.label}”` : "Open an item to choose it"}
        </Button>
        {here ? (
          <Button type="button" variant="outline" onClick={() => open(here.parentId)}>
            <CornerLeftUp className="size-4" aria-hidden="true" /> Back up
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => finish(null)}>
          <SkipForward className="size-4" aria-hidden="true" /> Skip this task
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ShareBar({ label, share, count, marker }: { label: string; share: number; count: number; marker?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-2 break-words">
          {label}
          {marker ? <Badge variant="outline">{marker}</Badge> : null}
        </span>
        <span className="shrink-0 tabular-nums text-[#555]">
          {count} · {pct(share)}
        </span>
      </div>
      <div className="h-3 border border-[#111] bg-white" aria-hidden="true">
        <div className="h-full bg-[#ffbd2e]" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}

const OUTCOME_COLORS: Record<string, string> = {
  direct_success: "#1f7a3a",
  indirect_success: "#7cc48f",
  direct_failure: "#b3261e",
  indirect_failure: "#e8a19b",
  skip: "#bbbbbb",
};

export function TreeTestResultBody({ tasks }: { tasks: TreeTaskResult[] }) {
  return (
    <div className="grid gap-4">
      {tasks.map((task, index) => (
        <div key={task.taskId} className="grid gap-3 border border-[#111] bg-white p-3">
          <p className="font-medium">
            Task {index + 1}: {task.prompt}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Success", pct(task.successRate)],
              ["Directness", pct(task.directness)],
              ["Median time", seconds(task.medianMs)],
              ["Attempts", String(task.attempts)],
            ].map(([label, value]) => (
              <div key={label} className={`${panel} p-2`}>
                <div className="text-xs uppercase tracking-wide text-[#555]">{label}</div>
                <div className="text-xl font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          {task.attempts ? (
            <>
              <div className="flex h-4 border border-[#111]" role="img" aria-label={TREE_OUTCOMES.map((outcome) => `${TREE_OUTCOME_LABELS[outcome]} ${task.outcomes[outcome]}`).join(", ")}>
                {TREE_OUTCOMES.map((outcome) =>
                  task.outcomes[outcome] ? (
                    <div key={outcome} style={{ width: `${(task.outcomes[outcome] / task.attempts) * 100}%`, background: OUTCOME_COLORS[outcome] }} />
                  ) : null,
                )}
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {TREE_OUTCOMES.map((outcome) => (
                  <li key={outcome} className="flex items-center gap-1">
                    <span className="inline-block size-3 border border-[#111]" style={{ background: OUTCOME_COLORS[outcome] }} aria-hidden="true" />
                    {TREE_OUTCOME_LABELS[outcome]} {task.outcomes[outcome]}
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">First click</h4>
                  {task.firstClicks.length ? (
                    task.firstClicks.map((entry) => (
                      <ShareBar key={entry.nodeId} label={entry.label} share={entry.share} count={entry.count} marker={entry.correct ? "on the right path" : undefined} />
                    ))
                  ) : (
                    <p className="text-sm text-[#555]">Everyone skipped without opening anything.</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <h4 className="text-sm font-semibold">Chosen destination</h4>
                  {task.destinations.length ? (
                    task.destinations.map((entry) => (
                      <ShareBar key={entry.nodeId} label={entry.label} share={entry.share} count={entry.count} marker={entry.correct ? "correct" : undefined} />
                    ))
                  ) : (
                    <p className="text-sm text-[#555]">No destinations chosen yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#555]">No attempts yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
