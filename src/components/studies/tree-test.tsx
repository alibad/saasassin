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

import { pct, seconds } from "./results-view";

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
        <p className="text-xs text-muted-foreground">One item per line; indent two spaces per level. Correct answers survive edits as long as the item keeps its name and place.</p>
        {errors.length ? <p className="text-sm text-destructive">{errors[0]}</p> : null}
      </div>
      <ol className="grid gap-3">
        {block.tasks.map((task, index) => (
          <li key={task.id} className="grid gap-2 rounded-lg border border-border bg-background p-3">
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
              <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border border-dashed border-border p-2">
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
              {task.correctNodeIds.length === 0 ? <p className="text-sm text-destructive">Pick at least one correct destination.</p> : null}
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
        <h1 className="break-words brand-heading text-xl sm:text-2xl">{block.prompt}</h1>
        <p className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
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
        <p className="text-sm text-muted-foreground">{block.prompt}</p>
        <p className="text-xs font-semibold">
          Task {taskIndex + 1} of {block.tasks.length}
        </p>
        <h1 className="break-words brand-heading text-xl sm:text-2xl">{task.prompt}</h1>
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
        <p className="rounded-lg border border-dashed border-border p-3 text-sm">“{here?.label}” has nothing inside it.</p>
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

function ShareBar({ label, share, count, marker, good = false }: { label: string; share: number; count: number; marker?: string; good?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-2 break-words">
          {label}
          {marker ? <Badge variant="secondary">{marker}</Badge> : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {count} · {pct(share)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full ${good ? "bg-primary" : "bg-chart-3"}`} style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />
      </div>
    </div>
  );
}

const OUTCOME_COLORS: Record<string, string> = {
  direct_success: "var(--chart-1)",
  indirect_success: "color-mix(in oklab, var(--chart-1) 45%, transparent)",
  direct_failure: "var(--chart-2)",
  indirect_failure: "color-mix(in oklab, var(--chart-2) 45%, transparent)",
  skip: "color-mix(in oklab, var(--muted-foreground) 30%, transparent)",
};

export function TreeTestResultBody({ tasks }: { tasks: TreeTaskResult[] }) {
  return (
    <div className="grid gap-4">
      {tasks.map((task, index) => (
        <div key={task.taskId} className="grid gap-4 rounded-lg border border-border bg-brand-subtle/60 p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Task {index + 1} of {tasks.length}</p>
            <p className="brand-heading mt-1 text-[1.05rem] leading-snug">{task.prompt}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Success", pct(task.successRate), true],
              ["Directness", pct(task.directness), false],
              ["Median time", seconds(task.medianMs), false],
              ["Attempts", String(task.attempts), false],
            ].map(([label, value, lead]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className={`brand-heading mt-0.5 text-2xl tabular-nums ${lead ? "text-primary" : ""}`}>{value}</div>
              </div>
            ))}
          </div>
          {task.attempts ? (
            <>
              <div>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={TREE_OUTCOMES.map((outcome) => `${TREE_OUTCOME_LABELS[outcome]} ${task.outcomes[outcome]}`).join(", ")}>
                  {TREE_OUTCOMES.map((outcome) =>
                    task.outcomes[outcome] ? (
                      <div key={outcome} style={{ width: `${(task.outcomes[outcome] / task.attempts) * 100}%`, background: OUTCOME_COLORS[outcome] }} />
                    ) : null,
                  )}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {TREE_OUTCOMES.map((outcome) => (
                    <li key={outcome} className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-full" style={{ background: OUTCOME_COLORS[outcome] }} aria-hidden="true" />
                      {TREE_OUTCOME_LABELS[outcome]} <span className="font-medium text-foreground tabular-nums">{task.outcomes[outcome]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="grid content-start gap-2.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">First click</h4>
                  {task.firstClicks.length ? (
                    task.firstClicks.map((entry) => (
                      <ShareBar key={entry.nodeId} label={entry.label} share={entry.share} count={entry.count} marker={entry.correct ? "On the right path" : undefined} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Everyone skipped without opening anything.</p>
                  )}
                </div>
                <div className="grid content-start gap-2.5">
                  <h4 className="text-xs font-semibold text-muted-foreground">Where they ended up</h4>
                  {task.destinations.length ? (
                    task.destinations.map((entry) => (
                      <ShareBar key={entry.nodeId} label={entry.label} share={entry.share} count={entry.count} marker={entry.correct ? "Correct" : undefined} good={entry.correct} />
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No destinations chosen yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No attempts yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}
