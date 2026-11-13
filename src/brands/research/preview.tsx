import { FileText, Folder, Lock, Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Sample data for the preview: a fictional study, shown inside the product UI only. */
const segments = [
  { time: "03:58", speaker: "Interviewer", text: [{ t: "What happened the last time you booked bikes for your team?" }] },
  {
    time: "04:06",
    speaker: "Dana (P07)",
    text: [
      { t: "I got all the way to payment and " },
      { t: "only then saw a deposit on every bike", tag: "pricing" },
      { t: ". I closed the tab." },
    ],
  },
  { time: "04:21", speaker: "Interviewer", text: [{ t: "Did you come back to it?" }] },
  {
    time: "04:24",
    speaker: "Dana (P07)",
    text: [
      { t: "Two days later. " },
      { t: "I just wanted the total before I typed my card", tag: "trust" },
      { t: " — that's all it would have taken." },
    ],
  },
];

function Highlight({ children, tag }: { children: string; tag: string }) {
  return (
    <mark className="rounded-[3px] bg-brand-accent/70 px-0.5 text-foreground ring-1 ring-brand-accent dark:bg-brand-accent/25 dark:ring-brand-accent/50">
      {children}
      <sup className="ml-1 rounded-sm bg-primary px-1 py-px align-[0.35em] text-[9px] font-semibold text-primary-foreground">
        #{tag}
      </sup>
    </mark>
  );
}

/** The project view: sources, a transcript with tagged highlights, and the insight they support. */
export function ResearchPreview() {
  return (
    <div className="grid bg-background text-[13px] leading-relaxed md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_270px]">
      <aside className="hidden border-r border-border bg-brand-subtle p-4 md:block">
        <p className="text-[11px] font-semibold text-muted-foreground">Projects</p>
        <ul className="mt-2 grid gap-0.5">
          {[
            ["Checkout friction", true],
            ["Onboarding study", false],
            ["Churn calls", false],
          ].map(([name, active]) => (
            <li
              key={String(name)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                active ? "bg-background font-semibold shadow-xs ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              <Folder className="size-3.5" aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[11px] font-semibold text-muted-foreground">Sources</p>
        <ul className="mt-2 grid gap-1.5">
          {[
            ["Interview — Dana (P07)", "12 hl", true],
            ["Interview — Ravi (P04)", "9 hl", false],
            ["Interview — Mo (P02)", "7 hl", false],
          ].map(([name, count, active]) => (
            <li key={String(name)} className={cn("flex items-center gap-2 px-2", active ? "text-foreground" : "text-muted-foreground")}>
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{name}</span>
              <span className="ml-auto shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">{count}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 px-2 text-muted-foreground">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Enterprise (restricted)</span>
            <span className="ml-auto text-[10px]">4</span>
          </li>
        </ul>
      </aside>

      <section className="min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground">
            <Search className="size-3.5" aria-hidden="true" />
            <span className="truncate">Search this project…</span>
          </div>
          <div className="flex gap-1 rounded-md bg-muted p-0.5 text-[12px]">
            {["Transcript", "Highlights", "Insights"].map((tab, index) => (
              <span key={tab} className={cn("rounded px-2.5 py-1", index === 0 ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}>
                {tab}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="brand-heading text-xl">Interview — Dana (P07)</h3>
          <Badge variant="secondary" className="text-[10px]">Consent recorded</Badge>
          <Badge variant="outline" className="text-[10px]">Retain 12 months</Badge>
        </div>
        <ol className="mt-5 grid gap-4">
          {segments.map((segment) => (
            <li key={segment.time} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3">
              <span className="pt-0.5 text-[11px] text-muted-foreground tabular-nums">{segment.time}</span>
              <div>
                <p className={cn("text-[11px] font-semibold", segment.speaker === "Interviewer" ? "text-muted-foreground" : "text-primary")}>
                  {segment.speaker}
                </p>
                <p className="mt-0.5 text-[14px] leading-relaxed">
                  {segment.text.map((part, index) =>
                    "tag" in part && part.tag ? (
                      <Highlight key={index} tag={part.tag}>
                        {part.t}
                      </Highlight>
                    ) : (
                      <span key={index}>{part.t}</span>
                    ),
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <aside className="hidden border-l border-border bg-card p-5 lg:block">
        <p className="text-[11px] font-semibold text-muted-foreground">Insight · v2</p>
        <h4 className="brand-heading mt-2 text-[17px] leading-snug">People abandon checkout when the deposit appears late</h4>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge className="text-[10px]">Price transparency</Badge>
        </div>
        <p className="mt-4 text-[11px] font-semibold text-muted-foreground">Evidence · 4 quotes from 3 interviews</p>
        <ul className="mt-2 grid gap-2">
          {[
            ["P07", "Dana · 04:06", "only then saw a deposit on every bike"],
            ["P04", "Ravi · 11:32", "the number jumped on the last step"],
            ["P02", "Mo · 07:15", "I didn't know there was a hold"],
          ].map(([who, time, quote]) => (
            <li key={who} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center gap-2">
                <Avatar className="size-5">
                  <AvatarFallback className="text-[9px]">{who}</AvatarFallback>
                </Avatar>
                <span className="text-[11px] text-muted-foreground">{time}</span>
              </div>
              <p className="mt-1.5 font-heading text-[13px] italic leading-snug">“{quote}”</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
