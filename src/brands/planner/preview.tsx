import { ChevronLeft, ChevronRight, CircleCheck, Inbox, Lock, Plus, Repeat, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Sample week for the preview: fictional tasks and meetings, shown inside the product UI only. */
type Block = {
  start: number;
  hours: number;
  title: string;
  kind: "task" | "meeting" | "locked";
  meta?: string;
  selected?: boolean;
  repeat?: boolean;
};

const days: { label: string; date: string; blocks: Block[]; hideBelow?: "sm" | "md" }[] = [
  {
    label: "Mon",
    date: "16",
    blocks: [
      { start: 9, hours: 0.5, title: "Standup", kind: "meeting" },
      { start: 9.5, hours: 2, title: "Draft pricing page", kind: "task", meta: "Deep · 2h" },
      { start: 13, hours: 1, title: "Design review", kind: "meeting" },
      { start: 14, hours: 1, title: "Invoice batch", kind: "task", meta: "Weekly", repeat: true },
    ],
  },
  {
    label: "Tue",
    date: "17",
    blocks: [
      { start: 9, hours: 0.5, title: "Standup", kind: "meeting" },
      { start: 10, hours: 1.5, title: "Pricing page: copy", kind: "task", meta: "Deep · 1h 30m", selected: true },
      { start: 13.5, hours: 1, title: "Review Q4 roadmap", kind: "task", meta: "1h" },
      { start: 15, hours: 1.5, title: "Customer call prep", kind: "locked", meta: "Locked" },
    ],
  },
  {
    label: "Wed",
    date: "18",
    blocks: [
      { start: 9, hours: 0.5, title: "Standup", kind: "meeting" },
      { start: 9.5, hours: 1.5, title: "Hiring loop notes", kind: "task", meta: "45m + buffer" },
      { start: 11, hours: 1, title: "1:1 with Sam", kind: "meeting" },
      { start: 14, hours: 2, title: "Ship pricing page", kind: "task", meta: "Deep · due 17:00" },
    ],
  },
  {
    label: "Thu",
    date: "19",
    hideBelow: "sm",
    blocks: [
      { start: 9, hours: 0.5, title: "Standup", kind: "meeting" },
      { start: 9.5, hours: 2.5, title: "Quarterly plan", kind: "task", meta: "Deep · 2h 30m" },
      { start: 15, hours: 1, title: "All hands", kind: "meeting" },
    ],
  },
  {
    label: "Fri",
    date: "20",
    hideBelow: "md",
    blocks: [
      { start: 9, hours: 0.5, title: "Standup", kind: "meeting" },
      { start: 10, hours: 1, title: "Weekly review", kind: "task", meta: "Weekly", repeat: true },
      { start: 13, hours: 1.5, title: "Support rotation", kind: "meeting" },
    ],
  },
];

const ROW = 40;
const FIRST = 9;
const HOURS = 8;

function CalendarBlock({ block }: { block: Block }) {
  const style = { top: (block.start - FIRST) * ROW + 1, height: block.hours * ROW - 3 };
  return (
    <div
      style={style}
      className={cn(
        "absolute inset-x-1 overflow-hidden rounded-[6px] px-1.5 py-1 text-[11px] leading-tight",
        block.kind === "task" &&
          "border-l-[3px] border-[var(--chart-1)] bg-[color-mix(in_oklab,var(--chart-1)_14%,var(--card))]",
        block.kind === "meeting" && "border-l-[3px] border-foreground/30 bg-muted text-muted-foreground",
        block.kind === "locked" && "bg-foreground text-background",
        block.selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
      )}
    >
      <p className="flex items-start gap-1 font-semibold">
        {block.kind === "locked" ? <Lock className="mt-px size-3 shrink-0" aria-hidden="true" /> : null}
        {block.repeat ? <Repeat className="mt-px size-3 shrink-0 text-[var(--chart-1)]" aria-hidden="true" /> : null}
        <span className={block.hours < 1 ? "truncate" : "line-clamp-2 break-words"}>{block.title}</span>
      </p>
      {block.meta && block.hours >= 1.5 ? <p className="mt-0.5 truncate opacity-75">{block.meta}</p> : null}
    </div>
  );
}

/** The week view: inbox on the left, an explained plan on the calendar, and the "why here" card. */
export function PlannerPreview() {
  return (
    <div className="grid bg-background text-[12px] md:grid-cols-[184px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-sidebar p-3.5 md:block">
        <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
          <Inbox className="size-3.5" aria-hidden="true" />
          Inbox
          <span className="ml-auto rounded bg-muted px-1.5 text-[10px]">5</span>
        </div>
        <div className="mt-2.5 flex h-8 items-center gap-2 rounded-md border border-input bg-card px-2 text-muted-foreground">
          <Plus className="size-3.5" aria-hidden="true" />
          <span className="truncate">Add a task…</span>
        </div>
        <ul className="mt-3 grid gap-1.5">
          {[
            ["Draft pricing page", "2h · due Wed", "Deep"],
            ["Review Q4 roadmap", "1h · due Thu", ""],
            ["Invoice batch", "30m · weekly", ""],
            ["Hiring loop notes", "45m · due Fri", ""],
            ["Quarterly plan", "2h 30m · due Fri", "Deep"],
          ].map(([title, meta, kind]) => (
            <li key={title} className="rounded-md border border-border bg-card px-2 py-1.5">
              <p className="flex items-center gap-1.5 font-semibold">
                <span className="size-2.5 rounded-full border-2 border-muted-foreground/40" aria-hidden="true" />
                <span className="truncate">{title}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 pl-4 text-[11px] text-muted-foreground">
                {meta}
                {kind ? <span className="rounded bg-accent px-1 text-[10px] font-semibold text-accent-foreground">{kind}</span> : null}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
          <CircleCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          All deadlines met this week
        </div>
      </aside>

      <section className="min-w-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border">
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-md border border-border">
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </span>
          </div>
          <p className="brand-heading text-[15px]">Nov 16 – 20</p>
          <Badge variant="secondary" className="text-[10px]">Plan v7</Badge>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden h-7 items-center rounded-md border border-border px-2.5 font-semibold sm:inline-flex">What-if</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 font-semibold text-primary-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Run scheduler
            </span>
          </div>
        </div>

        <div className="relative mt-3 flex">
          <div className="w-9 shrink-0 pt-7 text-right text-[10px] text-muted-foreground tabular-nums">
            {Array.from({ length: HOURS }, (_, index) => (
              <div key={index} style={{ height: ROW }} className="-translate-y-1.5 pr-1.5">
                {FIRST + index}:00
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day.label}
              className={cn(
                "min-w-0 flex-1 border-l border-border",
                day.hideBelow === "sm" && "hidden sm:block",
                day.hideBelow === "md" && "hidden md:block",
              )}
            >
              <div className="flex h-7 items-baseline gap-1 px-1.5 text-[11px]">
                <span className="font-bold">{day.label}</span>
                <span className="text-muted-foreground">{day.date}</span>
              </div>
              <div
                className="relative border-t border-border bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[length:100%_40px]"
                style={{ height: HOURS * ROW }}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 bg-[color-mix(in_oklab,var(--chart-1)_6%,transparent)]"
                  style={{ height: 3 * ROW }}
                />
                {day.blocks.map((block) => (
                  <CalendarBlock key={`${day.label}-${block.title}`} block={block} />
                ))}
              </div>
            </div>
          ))}

          <div className="absolute top-[78px] left-[calc(36px+40%)] hidden w-[250px] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] lg:block">
            <p className="text-[10px] font-bold text-primary">Why here?</p>
            <p className="mt-0.5 font-semibold">Pricing page: copy · Tue 10:00</p>
            <ul className="mt-2 grid gap-1.5 text-[11px] text-muted-foreground">
              <li className="flex gap-1.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
                Due Wed 17:00 — finishes a day early
              </li>
              <li className="flex gap-1.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
                Deep work, inside your focus hours (9–12)
              </li>
              <li className="flex gap-1.5">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
                Waits for “Draft pricing page” on Mon
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
