import {
  Building2,
  ClipboardList,
  FileCheck2,
  FileClock,
  Gauge,
  Globe,
  LayoutDashboard,
  ListChecks,
  ShieldCheck,
  UserSearch,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Sample data for the preview: a fictional company's SOC 2 program, shown inside the product UI only. */
const nav = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Controls", icon: ListChecks },
  { label: "Evidence", icon: FileClock },
  { label: "Policies", icon: FileCheck2 },
  { label: "Risks", icon: Gauge },
  { label: "Vendors", icon: Building2 },
  { label: "Audits", icon: UserSearch },
  { label: "Trust center", icon: Globe },
];

type Status = "implemented" | "needs" | "progress" | "todo";

const controls: { id: string; name: string; owner: string; status: Status; evidence: string; due?: "expired" | "soon" }[] = [
  { id: "CC1.1", name: "Commitment to integrity and ethics", owner: "MK", status: "implemented", evidence: "2027-03-02" },
  { id: "CC6.1", name: "Logical access security", owner: "JS", status: "needs", evidence: "expired 11d ago", due: "expired" },
  { id: "CC6.2", name: "User registration and removal", owner: "AL", status: "progress", evidence: "—" },
  { id: "CC7.2", name: "Security event monitoring", owner: "RT", status: "implemented", evidence: "in 11 days", due: "soon" },
  { id: "CC8.1", name: "Change management", owner: "MK", status: "implemented", evidence: "2027-01-15" },
  { id: "CC9.2", name: "Vendor and partner risk", owner: "AL", status: "todo", evidence: "—" },
];

const statusLabel: Record<Status, string> = {
  implemented: "Implemented",
  needs: "Needs evidence",
  progress: "In progress",
  todo: "Not started",
};

const statusClass: Record<Status, string> = {
  implemented: "bg-accent text-accent-foreground",
  needs: "bg-destructive/10 text-destructive",
  progress: "bg-secondary text-secondary-foreground",
  todo: "text-muted-foreground ring-1 ring-border",
};

function Metric({ label, value, detail, progress }: { label: string; value: string; detail: string; progress?: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="brand-mono text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="brand-heading mt-1 text-2xl tabular-nums">{value}</p>
      {progress !== undefined ? <Progress value={progress} className="mt-2 h-1 bg-muted [&>div]:bg-brand-accent" /> : null}
      <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

/** The readiness overview: live coverage and freshness, the controls table and the gap-task queue. */
export function TrustPreview() {
  return (
    <div className="grid bg-background text-[13px] leading-snug md:grid-cols-[176px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-sidebar p-3 text-sidebar-foreground md:block">
        <div className="flex items-center gap-2 px-1.5">
          <ShieldCheck className="size-4 text-brand-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-semibold">Halden Labs</p>
            <p className="brand-mono text-[10px] text-muted-foreground">SOC 2 · ISO 27001</p>
          </div>
        </div>
        <ul className="mt-5 grid gap-0.5">
          {nav.map(({ label, icon: Icon, active }) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5",
                active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="brand-heading text-lg">Readiness</h3>
          <div className="flex rounded-[var(--radius)] border border-border p-0.5 text-[12px]">
            <span className="rounded-[calc(var(--radius)*0.7)] bg-primary px-2.5 py-0.5 font-semibold text-primary-foreground">SOC 2</span>
            <span className="px-2.5 py-0.5 text-muted-foreground">ISO 27001</span>
          </div>
          <span className="brand-mono ml-auto hidden text-[10px] text-muted-foreground sm:inline">library 2026.10.0</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric label="Coverage" value="72%" detail="24 of 33 controls" progress={72} />
          <Metric label="Evidence" value="88%" detail="fresh · 2 expiring" progress={88} />
          <Metric label="Open risks" value="5" detail="1 high" />
          <Metric label="Policies" value="6/8" detail="approved" />
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[58px_minmax(0,1fr)_110px] items-center gap-3 border-b border-border bg-muted/60 px-3 py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid-cols-[58px_minmax(0,1fr)_40px_110px_120px]">
            <span className="brand-mono">ID</span>
            <span>Control</span>
            <span className="hidden sm:block">Owner</span>
            <span>Status</span>
            <span className="hidden sm:block">Evidence</span>
          </div>
          <ul>
            {controls.map((control) => (
              <li
                key={control.id}
                className="grid grid-cols-[58px_minmax(0,1fr)_110px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[58px_minmax(0,1fr)_40px_110px_120px]"
              >
                <span className="brand-mono text-[12px] font-medium">{control.id}</span>
                <span className="truncate">{control.name}</span>
                <span className="hidden sm:block">
                  <Avatar size="sm">
                    <AvatarFallback className="text-[9px]">{control.owner}</AvatarFallback>
                  </Avatar>
                </span>
                <span>
                  <span className={cn("inline-flex rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", statusClass[control.status])}>
                    {statusLabel[control.status]}
                  </span>
                </span>
                <span
                  className={cn(
                    "brand-mono hidden text-[11px] sm:block",
                    control.due === "expired" ? "text-destructive" : control.due === "soon" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                  )}
                >
                  {control.evidence}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            ["High", "Refresh evidence for CC6.1", "expired 2026-11-02"],
            ["High", "Treat risk R-07: shared admin account", "score 16 · untreated"],
          ].map(([priority, task, detail]) => (
            <div key={task} className="flex items-start gap-2 rounded-md border border-border bg-card p-2.5">
              <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium leading-snug">
                  <span className="brand-mono mr-1.5 rounded-[3px] bg-destructive/10 px-1 text-[9px] font-semibold text-destructive uppercase">
                    {priority}
                  </span>
                  {task}
                </p>
                <p className="brand-mono mt-1 text-[10px] text-muted-foreground">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
