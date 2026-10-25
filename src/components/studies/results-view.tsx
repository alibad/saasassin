"use client";

import { Download, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BlockResult, StudyResults } from "@/lib/studies/analysis";
import { BLOCK_TYPE_LABELS, type StudyVersion } from "@/lib/studies/model";

export const panel = "border-2 border-[#111] bg-[#fffdf7] shadow-[4px_4px_0_#111]";
const ACCENT = "#ffbd2e";

export function pct(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

export function seconds(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—";
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`;
}

function Bar({ share, label, count }: { share: number; label: string; count: number }) {
  return (
    <div className="grid gap-1">
      <div className="flex justify-between gap-3 text-sm">
        <span className="min-w-0 break-words">{label}</span>
        <span className="shrink-0 tabular-nums text-[#555]">
          {count} · {pct(share)}
        </span>
      </div>
      <div className="h-3 border border-[#111] bg-white" aria-hidden="true">
        <div className="h-full" style={{ width: `${Math.round(share * 100)}%`, background: ACCENT }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={`${panel} p-3`}>
      <div className="text-xs uppercase tracking-wide text-[#555]">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BlockBody({ result }: { result: BlockResult }) {
  switch (result.type) {
    case "welcome":
      return <p className="text-sm">{result.consented} of {result.reached} participants gave consent.</p>;
    case "multiple_choice":
      return (
        <div className="grid gap-3">
          {result.options.map((option) => (
            <Bar key={option.id} label={option.label} count={option.count} share={option.share} />
          ))}
        </div>
      );
    case "yes_no": {
      const total = result.yes + result.no;
      return (
        <div className="grid gap-3">
          <Bar label="Yes" count={result.yes} share={total ? result.yes / total : 0} />
          <Bar label="No" count={result.no} share={total ? result.no / total : 0} />
        </div>
      );
    }
    case "opinion_scale": {
      const max = Math.max(1, ...result.distribution.map((step) => step.count));
      return (
        <div className="grid gap-3">
          <p className="text-sm">
            Average <strong className="tabular-nums">{result.average === null ? "—" : result.average.toFixed(2)}</strong> of {result.scale}
          </p>
          <div className="flex h-28 items-end gap-1" role="img" aria-label={`Distribution of ${result.answered} ratings`}>
            {result.distribution.map((step) => (
              <div key={step.value} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums">{step.count}</span>
                <div className="w-full border border-[#111]" style={{ height: `${(step.count / max) * 72 + 2}px`, background: ACCENT }} />
                <span className="text-xs">{step.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "open_text":
      return result.entries.length ? (
        <ul className="grid max-h-72 gap-2 overflow-y-auto">
          {result.entries.map((entry) => (
            <li key={entry.responseId} className="border border-[#111] bg-white p-2 text-sm">
              <p className="whitespace-pre-wrap break-words">{entry.text}</p>
              <span className="text-xs text-[#666]">Response {entry.responseId.slice(0, 6)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#555]">No written answers yet.</p>
      );
    case "website_task":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Success rate" value={pct(result.successRate)} />
          <Stat label="Avg time on task" value={seconds(result.averageMs)} />
          <Stat label="Median time" value={seconds(result.medianMs)} />
        </div>
      );
    case "card_sort": {
      const { matrix } = result;
      return (
        <div className="grid gap-2">
          <p className="text-sm">
            {matrix.sorters} sorters · overall agreement <strong>{pct(matrix.overallAgreement)}</strong>
          </p>
          <div className="overflow-x-auto">
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
                          style={{ background: `rgba(255, 189, 46, ${share * 0.85})` }}
                        >
                          {pct(share)} <span className="text-xs text-[#555]">({matrix.counts[card.id]?.[category.id] ?? 0})</span>
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
}: {
  results: StudyResults;
  version: StudyVersion;
  exportBase?: string;
  otherVersionResponses?: number;
}) {
  const maxReached = Math.max(1, results.started);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Started" value={results.started} />
        <Stat label="Completed" value={results.completed} />
        <Stat label="Screened out" value={results.screenedOut} />
        <Stat label="Completion" value={pct(results.completionRate)} />
        <Stat label="Median duration" value={seconds(results.medianDurationMs)} />
      </div>
      {otherVersionResponses > 0 ? (
        <p className="text-sm text-[#555]">
          Showing version {version.version}. {otherVersionResponses} responses to earlier versions are kept in the export.
        </p>
      ) : null}

      <section className={`${panel} grid gap-3 p-4`} aria-labelledby="funnel-title">
        <h3 id="funnel-title" className="flex items-center gap-2 font-semibold">
          <Users className="size-4" aria-hidden="true" /> Completion funnel
        </h3>
        {results.started === 0 ? (
          <p className="text-sm text-[#555]">No participants yet. Share the participant link to start collecting responses.</p>
        ) : (
          results.funnel.map((step, index) => (
            <div key={step.blockId} className="grid gap-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {index + 1}. {step.title}
                </span>
                <span className="shrink-0 tabular-nums">
                  {step.reached} reached
                  {step.dropOff ? ` · ${step.dropOff} left here` : ""}
                  {step.screenedOut ? ` · ${step.screenedOut} screened out` : ""} · {seconds(results.averageBlockMs[step.blockId])}
                </span>
              </div>
              <div className="h-2 border border-[#111] bg-white" aria-hidden="true">
                <div className="h-full bg-[#111]" style={{ width: `${(step.reached / maxReached) * 100}%` }} />
              </div>
            </div>
          ))
        )}
      </section>

      {results.blocks.map((result, index) => (
        <section key={result.blockId} className={`${panel} grid gap-3 p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Badge variant="outline" className="mb-1">
                {index + 1} · {BLOCK_TYPE_LABELS[result.type]}
              </Badge>
              <h3 className="break-words font-semibold">{result.title}</h3>
              <p className="text-xs text-[#555]">
                {result.answered} answered of {result.reached} reached
              </p>
            </div>
            {exportBase && result.answered > 0 ? (
              <Button asChild variant="outline" size="sm">
                <a href={`${exportBase}?format=csv&blockId=${encodeURIComponent(result.blockId)}`} download>
                  <Download className="size-4" aria-hidden="true" /> CSV
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
