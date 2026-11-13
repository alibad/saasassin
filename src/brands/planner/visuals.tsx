import type { ReactNode } from "react";
import { ArrowRight, Check, Lock, Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/** Small product fragments that illustrate each feature row on the Planner homepage (sample data). */

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      inert
      className={cn(
        "rounded-[calc(var(--radius)*1.4)] border border-border bg-card p-5 text-[13px] shadow-[0_24px_48px_-28px_rgb(0_0_0/0.35)] sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

const taskTint = "border-l-[3px] border-[var(--chart-1)] bg-[color-mix(in_oklab,var(--chart-1)_14%,var(--card))]";

export function WhyHereVisual() {
  return (
    <Panel>
      <div className={cn("rounded-md px-3 py-2.5", taskTint)}>
        <p className="font-semibold">Pricing page: copy</p>
        <p className="text-[12px] text-muted-foreground">Tue 10:00 – 11:30 · Deep work</p>
      </div>
      <p className="mt-5 text-[11px] font-bold text-primary">Why this block is here</p>
      <ul className="mt-2 grid gap-2.5">
        {[
          ["Deadline", "Due Wed 17:00 — this placement finishes more than a day early"],
          ["Dependency", "Starts after “Draft pricing page” (Mon 09:30 – 11:30)"],
          ["Focus hours", "Deep work, so it prefers your 9–12 window"],
          ["Conflicts", "None — Standup at 09:00 and your locked call prep are untouched"],
        ].map(([label, text]) => (
          <li key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-border pt-2.5">
            <span className="font-semibold">{label}</span>
            <span className="text-muted-foreground">{text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MiniDay({ label, blocks }: { label: string; blocks: { top: number; height: number; title: string; locked?: boolean }[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-[11px] font-bold text-muted-foreground">{label}</p>
      <div className="relative h-[220px] rounded-md border border-border bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:100%_36px]">
        {blocks.map((block) => (
          <div
            key={block.title}
            style={{ top: block.top, height: block.height }}
            className={cn(
              "absolute inset-x-1.5 flex items-start gap-1 overflow-hidden rounded-[5px] px-2 py-1 text-[11px] font-semibold",
              block.locked ? "bg-foreground text-background" : taskTint,
            )}
          >
            {block.locked ? <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> : null}
            <span className="truncate">{block.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LockVisual() {
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <MiniDay
          label="Plan v6"
          blocks={[
            { top: 6, height: 62, title: "Quarterly plan" },
            { top: 76, height: 70, title: "Customer call prep", locked: true },
            { top: 154, height: 34, title: "Review roadmap" },
          ]}
        />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <MiniDay
          label="Plan v7 — after a new meeting"
          blocks={[
            { top: 6, height: 34, title: "Escalation" },
            { top: 76, height: 70, title: "Customer call prep", locked: true },
            { top: 154, height: 58, title: "Quarterly plan" },
          ]}
        />
      </div>
      <p className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        The locked block kept its exact time; everything else re-planned around it.
      </p>
    </Panel>
  );
}

export function WhatIfVisual() {
  const rows: { icon: typeof Plus; tone: string; label: string; detail: string }[] = [
    { icon: Plus, tone: "text-[var(--chart-1)]", label: "Added", detail: "Customer escalation · Tue 13:30 – 14:30" },
    { icon: ArrowRight, tone: "text-muted-foreground", label: "Moved", detail: "Review Q4 roadmap · Tue 13:30 → Wed 09:30" },
    { icon: ArrowRight, tone: "text-muted-foreground", label: "Moved", detail: "Hiring loop notes · Wed 09:30 → Wed 12:00" },
    { icon: Minus, tone: "text-muted-foreground", label: "Unchanged", detail: "14 blocks, including 1 locked" },
  ];
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <p className="brand-heading text-[15px]">What-if: add “Customer escalation”</p>
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Preview · not saved</span>
      </div>
      <ul className="mt-4 grid gap-2">
        {rows.map(({ icon: Icon, tone, label, detail }) => (
          <li key={detail} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
            <Icon className={cn("size-3.5 shrink-0", tone)} aria-hidden="true" />
            <span className="w-[4.5rem] shrink-0 font-semibold">{label}</span>
            <span className="min-w-0 flex-1 text-muted-foreground">{detail}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-accent-foreground">
        <Check className="size-3.5" aria-hidden="true" />
        Every deadline still met — apply as v8, or discard
      </p>
    </Panel>
  );
}

export function FocusVisual() {
  const hours = ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18"];
  return (
    <Panel>
      <p className="brand-heading text-[15px]">Thursday</p>
      <div className="relative mx-2 mt-4 h-24">
        <div className="absolute inset-y-0 left-[10%] w-[30%] rounded-md border border-dashed border-[color-mix(in_oklab,var(--chart-1)_45%,transparent)] bg-[color-mix(in_oklab,var(--chart-1)_8%,transparent)]" />
        <span className="absolute -top-0.5 left-[10%] ml-2 text-[10px] font-bold text-primary">Focus hours</span>
        <div className={cn("absolute top-6 left-[10%] h-12 w-[25%] rounded-md px-2 py-1.5 text-[11px] font-semibold", taskTint)}>
          Quarterly plan · Deep
        </div>
        <div className="absolute top-6 left-[40%] h-12 w-[10%] rounded-md border-l-[3px] border-foreground/30 bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
          Lunch
        </div>
        <div className="absolute top-6 left-[60%] h-12 w-[15%] rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
          Email · Shallow
        </div>
        <div className="absolute top-6 left-[80%] h-12 w-[10%] rounded-md border-l-[3px] border-foreground/30 bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
          All hands
        </div>
      </div>
      <div className="relative mx-2 mt-2 h-3 text-[10px] text-muted-foreground tabular-nums">
        {hours.map((hour, index) => (
          <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${index * 10}%` }}>
            {hour}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-muted-foreground">
        Deep work lands inside your focus hours. If that would make it late, Planner places it earlier and tells you why.
      </p>
    </Panel>
  );
}
