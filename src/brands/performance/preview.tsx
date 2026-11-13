import { AlertTriangle, Check, ChevronRight, Eye, Undo2 } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Fictional company and people, shown inside the product UI only. */
const phases = [
  { label: "Nominate", state: "done" },
  { label: "Write", state: "current" },
  { label: "Calibrate", state: "next" },
  { label: "Release", state: "next" },
  { label: "Acknowledge", state: "next" },
] as const;

const directions = [
  { label: "Self", done: 34, total: 40 },
  { label: "Manager", done: 29, total: 40 },
  { label: "Peer", done: 71, total: 96 },
  { label: "Upward", done: 14, total: 22 },
];

const people = [
  { initials: "AL", name: "Ana López", team: "Platform", status: "On track", tone: "ok" },
  { initials: "BK", name: "Ben Kowalski", team: "Hardware", status: "Due soon", tone: "warn" },
  { initials: "CW", name: "Chen Wei", team: "Platform", status: "Submitted", tone: "done" },
  { initials: "DO", name: "Dara Osei", team: "Ops", status: "Overdue 2d", tone: "late" },
] as const;

const tone = {
  ok: "bg-secondary text-secondary-foreground",
  warn: "bg-accent text-accent-foreground",
  done: "bg-primary text-primary-foreground",
  late: "bg-destructive/10 text-destructive",
} as const;

/** The Reviews tab: a cycle in its writing phase, progress by direction, and the next-phase preview. */
export function PerformancePreview() {
  return (
    <div className="bg-background text-[13px]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Northwind Robotics · Reviews</p>
          <h3 className="brand-heading text-xl">Fall 2026 review cycle</h3>
        </div>
        <Badge variant="secondary" className="ml-auto">Writing · due Nov 28</Badge>
      </div>

      <ol className="flex items-center gap-1 overflow-hidden border-b border-border px-5 py-3">
        {phases.map((phase, index) => (
          <li key={phase.label} className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] whitespace-nowrap",
                phase.state === "done" && "text-primary",
                phase.state === "current" && "bg-primary text-primary-foreground font-semibold",
                phase.state === "next" && "text-muted-foreground",
              )}
            >
              {phase.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {phase.label}
            </span>
            {index < phases.length - 1 ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
        <div className="grid content-start gap-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[12px] font-semibold">Progress by direction</p>
            <ul className="mt-3 grid gap-3">
              {directions.map((direction) => (
                <li key={direction.label} className="grid grid-cols-[64px_minmax(0,1fr)_52px] items-center gap-3">
                  <span className="text-muted-foreground">{direction.label}</span>
                  <Progress value={(direction.done / direction.total) * 100} className="h-1.5" />
                  <span className="text-right text-[12px] tabular-nums">
                    {direction.done}/{direction.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[12px] font-semibold">Reviewers</p>
            <ul className="mt-2 divide-y divide-border">
              {people.map((person) => (
                <li key={person.name} className="flex items-center gap-3 py-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-secondary text-[10px] font-semibold text-secondary-foreground">{person.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="text-[11px] text-muted-foreground">{person.team}</p>
                  </div>
                  <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap", tone[person.tone])}>{person.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hidden rounded-xl border border-border bg-card p-4 sm:block">
          <div className="flex items-center gap-2">
            <Eye className="size-4 text-primary" aria-hidden="true" />
            <p className="text-[12px] font-semibold">Preview: move to Calibrate</p>
          </div>
          <div className="mt-3 flex gap-2.5 rounded-lg bg-accent p-3 text-accent-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="leading-snug">
              <span className="font-semibold">Blocked.</span> 33 reviews are still in draft. Drafts are never submitted for anyone.
            </p>
          </div>
          <p className="mt-4 text-[11px] font-semibold text-muted-foreground">When it can move, it will</p>
          <ul className="mt-2 grid gap-2 text-[12.5px]">
            {[
              "Close writing for 40 people",
              "Open calibration for 4 calibrators",
              "Withhold upward feedback below 3 responses",
            ].map((effect) => (
              <li key={effect} className="flex gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {effect}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center gap-2 border-t border-border pt-4 text-[12px] text-muted-foreground">
            <Undo2 className="size-3.5" aria-hidden="true" />
            Reversible: reopening keeps every submitted review.
          </div>
        </div>
      </div>
    </div>
  );
}
