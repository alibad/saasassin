import {
  ChartNoAxesColumn,
  CircleCheck,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  ShieldCheck,
  SquareKanban,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Sample data for the preview: a fictional deal and call, shown inside the product UI only. */
const nav = [
  { icon: SquareKanban, label: "Deals" },
  { icon: MessageSquareText, label: "Calls", active: true },
  { icon: TrendingUp, label: "Forecast" },
  { icon: GraduationCap, label: "Coaching" },
  { icon: ChartNoAxesColumn, label: "Dashboard" },
  { icon: ListChecks, label: "Trackers" },
];

type Part = { t: string; tracker?: string; nextStep?: boolean };

const transcript: { time: string; speaker: string; rep?: boolean; parts: Part[] }[] = [
  { time: "12:31", speaker: "Priya Nair", rep: true, parts: [{ t: "What would have to be true for this to go live before the end of the quarter?" }] },
  {
    time: "12:41",
    speaker: "Maya Chen",
    parts: [
      { t: "Honestly, " },
      { t: "Copperline", tracker: "Competitor" },
      { t: " came in lower on " },
      { t: "price", tracker: "Pricing" },
      { t: ", but our security team hasn't seen either of you yet." },
    ],
  },
  {
    time: "18:05",
    speaker: "Priya Nair",
    rep: true,
    parts: [{ t: "Then " }, { t: "I'll send the security questionnaire by Friday", nextStep: true }, { t: " and we can book the review." }],
  },
];

/** A call page: navy sidebar, talk ratio and stats, transcript with tracker hits, and deal risks. */
export function RevenuePreview() {
  return (
    <div className="grid bg-background text-[13px] leading-relaxed md:grid-cols-[184px_minmax(0,1fr)] lg:grid-cols-[184px_minmax(0,1fr)_252px]">
      <aside className="hidden flex-col bg-sidebar p-3 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">L</span>
          <span className="font-semibold text-white">Lumen Sales</span>
        </div>
        <ul className="mt-4 grid gap-0.5">
          {nav.map(({ icon: Icon, label, active }) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/75",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-auto rounded-md border border-sidebar-border p-2.5 text-[11px] text-sidebar-foreground/75">
          <p className="font-semibold text-sidebar-foreground">Retention</p>
          <p>Calls kept 12 months · 2 due</p>
        </div>
      </aside>

      <section className="min-w-0 p-5 sm:p-6">
        <p className="text-[11px] text-muted-foreground">Fieldstone Logistics · Platform rollout</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="brand-heading text-[19px]">Discovery call</h3>
          <Badge variant="secondary" className="text-[10px]">Evaluation</Badge>
          <Badge variant="outline" className="text-[10px] tabular-nums">$48,000</Badge>
          <Badge variant="outline" className="text-[10px]">
            <ShieldCheck aria-hidden="true" />
            All-party consent · written
          </Badge>
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Talk ratio · Priya (rep) 42%</span>
            <span>Fieldstone 58%</span>
          </div>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full">
            <span className="bg-primary dark:bg-chart-2" style={{ width: "42%" }} />
            <span className="bg-brand-accent" style={{ width: "58%" }} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["Longest monologue", "1m 48s"],
            ["Questions", "14"],
            ["Interactivity", "6.2 / 10"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-card p-2.5">
              <p className="text-[10.5px] text-muted-foreground">{label}</p>
              <p className="brand-heading mt-0.5 text-[17px] tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <ol className="mt-5 grid gap-3.5">
          {transcript.map((line) => (
            <li key={line.time} className="grid grid-cols-[42px_minmax(0,1fr)] gap-3">
              <span className="pt-0.5 text-[11px] font-medium text-primary tabular-nums underline decoration-primary/30 underline-offset-2">
                {line.time}
              </span>
              <div>
                <p className={cn("text-[11px] font-semibold", line.rep ? "text-muted-foreground" : "text-foreground")}>{line.speaker}</p>
                <p className="mt-0.5 text-[13.5px]">
                  {line.parts.map((part, index) =>
                    part.tracker ? (
                      <mark key={index} className="rounded-[3px] bg-brand-accent/25 px-0.5 text-foreground ring-1 ring-brand-accent/60">
                        {part.t}
                        <span className="ml-1 text-[9px] font-semibold text-accent-foreground uppercase">{part.tracker}</span>
                      </mark>
                    ) : part.nextStep ? (
                      <span key={index} className="rounded-[3px] bg-primary/10 px-0.5 font-medium text-primary">
                        {part.t}
                      </span>
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
        <p className="text-[11px] font-semibold text-muted-foreground">Deal risks</p>
        <ul className="mt-2 grid gap-2">
          {[
            { label: "Competitor mentioned", detail: "Copperline · latest call, 12:41", warn: true },
            { label: "Single-threaded", detail: "Only Maya Chen heard on calls", warn: true },
            { label: "Next step found", detail: "Security questionnaire · 18:05", warn: false },
          ].map((risk) => (
            <li key={risk.label} className="flex gap-2 rounded-md border border-border bg-background p-2.5">
              {risk.warn ? (
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-chart-5" aria-hidden="true" />
              ) : (
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span>
                <span className="block font-semibold">{risk.label}</span>
                <span className="block text-[11px] text-muted-foreground">{risk.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[11px] font-semibold text-muted-foreground">Speakers</p>
        <ul className="mt-2 grid gap-2.5">
          {[
            ["MC", "Maya Chen", "Champion · 58%"],
            ["PN", "Priya Nair", "Rep · 42%"],
          ].map(([initials, name, role]) => (
            <li key={name} className="flex items-center gap-2.5">
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <span>
                <span className="block font-medium">{name}</span>
                <span className="block text-[11px] text-muted-foreground">{role}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
