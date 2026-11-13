"use client";

import { AlertTriangle, ArrowRight, Building2, CalendarClock, ClipboardCheck, Download, FileCheck2, FileText, KeyRound, ListChecks, ShieldCheck } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTROL_STATUS_LABELS, CONTROL_STATUSES, type GapTask } from "@/lib/trust/model";
import { cn } from "@/lib/utils";

import { ActivityFeed } from "./activity";
import type { TrustSection } from "./app-shell";
import { EmailAvatar, formatDate, PageHeader, panel, PanelHeader, Pill, STATUS_BAR } from "./shared";
import type { TrustSnapshot } from "./types";

const AREA: Record<GapTask["area"], { section: TrustSection; icon: typeof ListChecks; label: string }> = {
  control: { section: "controls", icon: ListChecks, label: "Control" },
  evidence: { section: "evidence", icon: FileCheck2, label: "Evidence" },
  policy: { section: "policies", icon: FileText, label: "Policy" },
  risk: { section: "risks", icon: AlertTriangle, label: "Risk" },
  vendor: { section: "vendors", icon: Building2, label: "Vendor" },
  finding: { section: "audits", icon: ClipboardCheck, label: "Finding" },
  access: { section: "access", icon: KeyRound, label: "Access" },
};

/** Who owns the record a task points at, so every task has a face. */
function taskOwner(snapshot: TrustSnapshot, task: GapTask) {
  switch (task.area) {
    case "control": return snapshot.controls.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    case "evidence": {
      const evidence = snapshot.evidence.find((entry) => entry.id === task.targetId);
      return evidence?.createdBy ?? snapshot.controls.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    }
    case "policy": return snapshot.policies.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    case "risk": return snapshot.risks.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    case "vendor": return snapshot.vendors.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    case "finding": return snapshot.findings.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
    case "access": return snapshot.systems.find((entry) => entry.id === task.targetId)?.ownerEmail ?? "";
  }
}

function Ring({ value, size = 88 }: { value: number; size?: number }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}%`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - value / 100)}
        className="stroke-emerald-600 dark:stroke-emerald-400"
      />
    </svg>
  );
}

function Metric({ label, value, detail, tone, onClick }: { label: string; value: string; detail: string; tone?: "warning" | "critical"; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(panel, "group flex flex-col p-4 text-left transition-colors hover:border-foreground/25")}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("mt-1.5 font-mono text-2xl font-semibold tabular-nums", tone === "critical" && "text-red-700 dark:text-red-300", tone === "warning" && "text-amber-700 dark:text-amber-300")}>{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

/** The readiness dashboard: where each framework stands, what needs doing next, and who is doing it. */
export function OverviewSection({ snapshot, onNavigate }: { snapshot: TrustSnapshot; onNavigate: (section: TrustSection) => void }) {
  const { readiness, tasks } = snapshot;
  const frameworks = snapshot.frameworks.filter((framework) => snapshot.settings.frameworkIds.includes(framework.id));
  const today = new Date().toISOString().slice(0, 10);
  const audit = [...snapshot.auditPeriods].filter((period) => period.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const exportBase = `/api/trust/tenants/${snapshot.tenant.id}/export`;
  const highTasks = tasks.filter((task) => task.priority === "high").length;

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Readiness"
        meta={<>
          {frameworks.map((framework) => <Pill key={framework.id} tone="neutral" dot={false}>{framework.id === "soc2" ? "SOC 2" : "ISO 27001"}</Pill>)}
          <span className="font-mono text-xs text-muted-foreground">Library {snapshot.libraryVersion}</span>
        </>}
        description="Computed live from your controls, evidence and policies. Readiness tracking, not a certification or an audit opinion."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline"><Download /> Export</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">For your auditor</DropdownMenuLabel>
              {frameworks.map((framework) => (
                <DropdownMenuItem key={framework.id} asChild>
                  <a href={`${exportBase}?package=${framework.id}`} download>{framework.id === "soc2" ? "SOC 2" : "ISO 27001"} evidence package</a>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><a href={exportBase} download>Full workspace (JSON)</a></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Frameworks">
        {frameworks.map((framework) => {
          const controls = snapshot.controls.filter((control) => control.frameworkId === framework.id);
          const applicable = controls.filter((control) => control.status !== "not_applicable");
          const implemented = controls.filter((control) => control.status === "implemented").length;
          const value = applicable.length ? Math.round((implemented / applicable.length) * 100) : 0;
          const byStatus = CONTROL_STATUSES.map((status) => [status, controls.filter((control) => control.status === status).length] as const);
          return (
            <article key={framework.id} className={cn(panel, "flex flex-col gap-5 p-5")}>
              <div className="flex items-center gap-5">
                <div className="relative">
                  <Ring value={value} />
                  <span className="absolute inset-0 flex items-center justify-center font-mono text-lg font-semibold tabular-nums">{value}%</span>
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold">{framework.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-mono text-foreground">{implemented}</span> of <span className="font-mono text-foreground">{applicable.length}</span> applicable controls implemented with current evidence
                  </p>
                </div>
              </div>
              <div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${framework.name} controls by status`}>
                  {byStatus.map(([status, count]) => count ? <span key={status} className={STATUS_BAR[status]} style={{ width: `${(count / controls.length) * 100}%` }} /> : null)}
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {byStatus.map(([status, count]) => (
                    <li key={status} className="inline-flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", STATUS_BAR[status])} aria-hidden="true" />
                      {CONTROL_STATUS_LABELS[status]} <span className="font-mono text-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Program health">
        <Metric
          label="Evidence freshness"
          value={`${readiness.evidence.freshnessPercent}%`}
          detail={`${readiness.evidence.expiringSoon} expiring within 14 days · ${readiness.evidence.expired} expired`}
          tone={readiness.evidence.expired ? "warning" : undefined}
          onClick={() => onNavigate("evidence")}
        />
        <Metric
          label="Open risks"
          value={String(readiness.risks.open)}
          detail={`${readiness.risks.highOrCritical} high or critical · ${readiness.risks.unowned} without an owner`}
          tone={readiness.risks.highOrCritical ? "critical" : undefined}
          onClick={() => onNavigate("risks")}
        />
        <Metric
          label="Policies approved"
          value={`${readiness.policies.approved}/${readiness.policies.total}`}
          detail={`${readiness.policies.acknowledgementPercent}% of acknowledgements collected`}
          onClick={() => onNavigate("policies")}
        />
        <Metric
          label="Vendor reviews"
          value={`${readiness.vendors.total - readiness.vendors.overdue}/${readiness.vendors.total}`}
          detail={readiness.vendors.overdue ? `${readiness.vendors.overdue} overdue` : "All on schedule"}
          tone={readiness.vendors.overdue ? "warning" : undefined}
          onClick={() => onNavigate("vendors")}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className={panel} aria-label="Needs attention">
          <PanelHeader
            title="Needs attention"
            description="Generated from real gaps: missing owners, missing or expiring evidence, unapproved policies, untreated risks and overdue reviews."
            action={<Pill tone={highTasks ? "warning" : "positive"}>{tasks.length ? `${tasks.length} open · ${highTasks} high` : "All clear"}</Pill>}
          />
          {tasks.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground"><ShieldCheck className="size-5 text-emerald-600" /> No gaps right now. Evidence will start to expire on its schedule, and new tasks appear here when it does.</div>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.slice(0, 9).map((task) => {
                const area = AREA[task.area];
                const Icon = area.icon;
                const owner = taskOwner(snapshot, task);
                return (
                  <li key={task.id}>
                    <button type="button" onClick={() => onNavigate(area.section)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 sm:px-5">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", task.priority === "high" ? "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{area.label} · {task.detail}</span>
                      </span>
                      {owner ? <EmailAvatar snapshot={snapshot} email={owner} size="sm" /> : <span className="hidden text-xs text-amber-700 sm:inline dark:text-amber-300">No owner</span>}
                      <Pill tone={task.priority === "high" ? "warning" : "neutral"} className="hidden capitalize sm:inline-flex">{task.priority}</Pill>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {tasks.length > 9 ? <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">Showing the 9 most urgent of {tasks.length}.</p> : null}
        </section>

        <div className="grid min-w-0 content-start gap-6">
          <section className={panel} aria-label="Next audit">
            <PanelHeader title="Next audit" action={<Button size="sm" variant="ghost" onClick={() => onNavigate("audits")}>Audits <ArrowRight /></Button>} />
            {audit ? (
              <div className="grid grid-cols-1 gap-4 p-4 sm:p-5">
                <div>
                  <p className="font-medium">{audit.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{formatDate(audit.startDate)} → {formatDate(audit.endDate)}{audit.auditorFirm ? ` · ${audit.auditorFirm}` : ""}</p>
                </div>
                {audit.auditors.length ? (
                  <ul className="grid grid-cols-1 gap-2.5">
                    {audit.auditors.map((grant) => {
                      const active = grant.expiresAt >= today;
                      return (
                        <li key={grant.email} className="flex items-center gap-2.5">
                          <EmailAvatar snapshot={snapshot} email={grant.email} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm">{snapshot.members.find((member) => member.email.toLowerCase() === grant.email.toLowerCase())?.name || grant.email}</span>
                          <Pill tone={active ? "positive" : "muted"}><CalendarClock className="size-3" /> {active ? `until ${formatDate(grant.expiresAt)}` : "ended"}</Pill>
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="text-sm text-muted-foreground">No auditor has access yet. Grant read-only access that ends on a date you choose.</p>}
              </div>
            ) : (
              <p className="p-5 text-sm text-muted-foreground">Plan an audit window when your auditor engagement is booked; their read-only access ends when it does.</p>
            )}
          </section>

          <section className={panel} aria-label="Recent activity">
            <PanelHeader title="Recent activity" action={<Button size="sm" variant="ghost" onClick={() => onNavigate("activity")}>All <ArrowRight /></Button>} />
            <ActivityFeed snapshot={snapshot} limit={6} dense />
          </section>

          <section className={cn(panel, "p-4 sm:p-5")} aria-label="Owners">
            <h2 className="text-sm font-semibold">Control owners</h2>
            <ul className="mt-3 grid gap-2.5">
              {snapshot.members
                .map((member) => ({ member, owned: snapshot.controls.filter((control) => control.ownerEmail.toLowerCase() === member.email.toLowerCase()) }))
                .filter((entry) => entry.owned.length)
                .sort((a, b) => b.owned.length - a.owned.length)
                .slice(0, 5)
                .map(({ member, owned }) => {
                  const done = owned.filter((control) => control.status === "implemented").length;
                  return (
                    <li key={member.uid} className="flex items-center gap-2.5">
                      <UserAvatar person={member} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{member.name || member.email}</span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((done / owned.length) * 100)}%` }} /></span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">{done}/{owned.length}</span>
                    </li>
                  );
                })}
            </ul>
            {snapshot.controls.every((control) => !control.ownerEmail) ? <p className="mt-2 text-sm text-muted-foreground">Give each control an owner so nothing falls between chairs.</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
