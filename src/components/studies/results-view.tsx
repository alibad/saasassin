"use client";

import {
  AlignLeft,
  DoorOpen,
  Download,
  LayoutGrid,
  ListChecks,
  ListTree,
  MousePointerClick,
  SlidersHorizontal,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BlockResult, StudyResults } from "@/lib/studies/analysis";
import { BLOCK_TYPE_LABELS, type BlockType, type StudyVersion } from "@/lib/studies/model";
import { cn } from "@/lib/utils";

import { TreeTestResultBody } from "./tree-test";

export const panel = "rounded-xl border border-border bg-card text-card-foreground shadow-xs";

export const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  welcome: DoorOpen,
  multiple_choice: ListChecks,
  opinion_scale: SlidersHorizontal,
  open_text: AlignLeft,
  yes_no: ThumbsUp,
  website_task: MousePointerClick,
  card_sort: LayoutGrid,
  tree_test: ListTree,
};

export function pct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

export function seconds(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`;
}

/** A block's number and type, drawn the same way in the builder and the results. */
export function BlockChip({ type, index, active = false }: { type: BlockType; index: number; active?: boolean }) {
  const Icon = BLOCK_ICONS[type];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("grid size-6 place-items-center rounded-md text-[11px] font-semibold tabular-nums", active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
        {index}
      </span>
      <Icon className="size-3.5 text-primary" aria-hidden="true" />
      <span className="font-medium">{BLOCK_TYPE_LABELS[type]}</span>
    </span>
  );
}

function Bar({ share, label, count, leading = false }: { share: number; label: string; count: number; leading?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-3 text-sm">
        <span className={cn("min-w-0 break-words", leading && "font-medium")}>{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {count} · <span className="font-medium text-foreground">{pct(share)}</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", leading ? "bg-primary" : "bg-chart-3")} style={{ width: `${Math.max(1, Math.round(share * 100))}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: "default" | "accent" }) {
  return (
    <div className={cn(panel, "p-4")}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("brand-heading mt-1 text-[1.75rem] leading-none tabular-nums", tone === "accent" && "text-primary")}>{value}</div>
      {hint ? <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function BlockBody({ result }: { result: BlockResult }) {
  switch (result.type) {
    case "welcome":
      return <p className="text-sm"><span className="font-semibold tabular-nums">{result.consented}</span> of {result.reached} participants gave consent.</p>;
    case "multiple_choice": {
      const top = Math.max(0, ...result.options.map((option) => option.share));
      return (
        <div className="grid gap-3">
          {result.options.map((option) => (
            <Bar key={option.id} label={option.label} count={option.count} share={option.share} leading={option.share === top && top > 0} />
          ))}
        </div>
      );
    }
    case "yes_no": {
      const total = result.yes + result.no;
      return (
        <div className="grid gap-3">
          <Bar label="Yes" count={result.yes} share={total ? result.yes / total : 0} leading={result.yes >= result.no} />
          <Bar label="No" count={result.no} share={total ? result.no / total : 0} leading={result.no > result.yes} />
        </div>
      );
    }
    case "opinion_scale": {
      const max = Math.max(1, ...result.distribution.map((step) => step.count));
      return (
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
          <div>
            <p className="brand-heading text-4xl tabular-nums">{result.average === null ? "—" : result.average.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">average of {result.scale} · {result.answered} ratings</p>
          </div>
          <div className="flex h-32 items-end gap-1.5" role="img" aria-label={`Distribution of ${result.answered} ratings`}>
            {result.distribution.map((step) => (
              <div key={step.value} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-muted-foreground">{step.count}</span>
                <div
                  className={cn("w-full rounded-t-md", step.count === max ? "bg-primary" : "bg-chart-3")}
                  style={{ height: `${(step.count / max) * 80 + 3}px` }}
                />
                <span className="text-xs font-medium">{step.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "open_text":
      return result.entries.length ? (
        <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1">
          {result.entries.map((entry) => (
            <li key={entry.responseId} className="rounded-lg bg-brand-subtle px-3.5 py-2.5 text-sm">
              <p className="leading-relaxed whitespace-pre-wrap break-words">“{entry.text}”</p>
              <span className="text-xs text-muted-foreground">Session {entry.responseId.slice(0, 6)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No written answers yet.</p>
      );
    case "website_task":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Success rate" value={pct(result.successRate)} tone="accent" />
          <Stat label="Average time on task" value={seconds(result.averageMs)} />
          <Stat label="Median time" value={seconds(result.medianMs)} />
        </div>
      );
    case "tree_test":
      return <TreeTestResultBody tasks={result.tasks} />;
    case "card_sort": {
      const { matrix } = result;
      return (
        <div className="grid gap-3">
          <p className="text-sm">
            {matrix.sorters} sorters · overall agreement <strong className="tabular-nums">{pct(matrix.overallAgreement)}</strong>
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  {matrix.categories.map((category) => (
                    <TableHead key={category.id}>{category.label}</TableHead>
                  ))}
                  <TableHead>Agreement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.cards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-medium">{card.label}</TableCell>
                    {matrix.categories.map((category) => {
                      const share = matrix.share[card.id]?.[category.id] ?? 0;
                      return (
                        <TableCell
                          key={category.id}
                          className="tabular-nums"
                          style={{ background: `color-mix(in oklab, var(--chart-1) ${Math.round(share * 55)}%, transparent)` }}
                        >
                          {pct(share)} <span className="text-xs text-muted-foreground">({matrix.counts[card.id]?.[category.id] ?? 0})</span>
                        </TableCell>
                      );
                    })}
                    <TableCell className="font-semibold tabular-nums">{pct(matrix.cardAgreement[card.id])}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }
  }
}

export function ResultsView({
  results,
  version,
  exportBase,
  otherVersionResponses = 0,
  includeExcluded = false,
}: {
  results: StudyResults;
  version: StudyVersion;
  exportBase?: string;
  otherVersionResponses?: number;
  includeExcluded?: boolean;
}) {
  const maxReached = Math.max(1, results.started);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Started" value={results.started} hint={results.inProgress ? `${results.inProgress} in progress` : undefined} />
        <Stat label="Completed" value={results.completed} />
        <Stat label="Completion rate" value={pct(results.completionRate)} tone="accent" />
        <Stat label="Median duration" value={seconds(results.medianDurationMs)} />
        <Stat label="Screened out" value={results.screenedOut} />
      </div>
      {otherVersionResponses > 0 ? (
        <p className="text-sm text-muted-foreground">
          Showing version {version.version}. {otherVersionResponses} responses to earlier versions stay in the export.
        </p>
      ) : null}

      <section className={cn(panel, "grid gap-4 p-5")} aria-labelledby="funnel-title">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="funnel-title" className="brand-heading text-lg">Where people dropped off</h3>
          <span className="text-xs text-muted-foreground">Average time per block on the right</span>
        </div>
        {results.started === 0 ? (
          <p className="text-sm text-muted-foreground">No one has taken this study yet. Share the participant link and results appear here as they come in.</p>
        ) : (
          <ol className="grid gap-3">
            {results.funnel.map((step, index) => (
              <li key={step.blockId} className="grid gap-1.5">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-muted-foreground tabular-nums">{index + 1}</span>{step.title}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">{step.reached}</span> reached
                    {step.dropOff ? <span className="text-accent-foreground"> · {step.dropOff} left</span> : null}
                    {step.screenedOut ? ` · ${step.screenedOut} screened out` : ""} · {seconds(results.averageBlockMs[step.blockId])}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(step.reached / maxReached) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {results.blocks.map((result, index) => (
        <section key={result.blockId} id={`result-${result.blockId}`} className={cn(panel, "grid min-w-0 scroll-mt-32 gap-4 p-5")}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <BlockChip type={result.type} index={index + 1} />
              <h3 className="brand-heading mt-2 text-lg leading-snug break-words">{result.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {result.answered} answered · {result.reached} reached
              </p>
            </div>
            {exportBase && result.answered > 0 ? (
              <Button asChild variant="ghost" size="sm">
                <a href={`${exportBase}?format=csv&blockId=${encodeURIComponent(result.blockId)}${includeExcluded ? "&all=1" : ""}`} download>
                  <Download aria-hidden="true" /> CSV
                </a>
              </Button>
            ) : null}
          </div>
          <BlockBody result={result} />
        </section>
      ))}
    </div>
  );
}
