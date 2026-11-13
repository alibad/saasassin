"use client";

import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { DEAL_STAGE_LABELS, type DealStage } from "@/lib/revenue/deals";
import { cn } from "@/lib/utils";

/**
 * Revenue's workspace building blocks. Everything is drawn with the brand's shadcn tokens
 * (src/brands/revenue/theme.css), so light and dark both follow the brand.
 */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="grid min-w-0 gap-1">
        {eyebrow ? <div className="text-sm text-muted-foreground">{eyebrow}</div> : null}
        <h1 className="brand-heading text-2xl text-foreground sm:text-[1.7rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A white (or dark-card) surface with the brand radius and a hairline border. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-xs", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  actions,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="grid min-w-0 gap-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "warning";
  className?: string;
}) {
  return (
    <Panel className={cn("grid content-start gap-1 p-4", className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {Icon ? (
          <span
            className={cn(
              "grid size-7 place-items-center rounded-md",
              tone === "accent" ? "bg-brand-accent/15 text-accent-foreground" : tone === "warning" ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="brand-heading text-2xl tabular-nums text-foreground">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </Panel>
  );
}

/** An empty state that invites the next action instead of apologising for missing data. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid justify-items-center gap-2 rounded-lg border border-dashed border-border bg-card/60 px-6 py-10 text-center", className)}>
      {Icon ? (
        <span className="mb-1 grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="font-heading text-base font-semibold text-foreground">{title}</h3>
      {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-destructive" role="alert">{children}</p>;
}

export function SuccessText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm font-medium text-chart-3" role="status">{children}</p>;
}

const RISK_LABELS: Record<string, string> = {
  no_calls: "No calls yet",
  stale_conversation: "Gone quiet",
  no_next_step: "No next step",
  competitor_mentioned: "Competitor mentioned",
  close_date_passed: "Close date passed",
  single_threaded: "Single-threaded",
  stalled_in_stage: "Stalled in stage",
};

export function riskLabel(code: string) {
  return RISK_LABELS[code] ?? code.replaceAll("_", " ");
}

export function riskTone(severity: string) {
  return severity === "high"
    ? "border-destructive/25 bg-destructive/10 text-destructive"
    : severity === "medium"
      ? "border-brand-accent/40 bg-accent text-accent-foreground"
      : "border-border bg-secondary text-secondary-foreground";
}

export function RiskChip({ code, severity, className }: { code: string; severity: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[0.7rem] font-medium whitespace-nowrap", riskTone(severity), className)}>
      <span className={cn("size-1.5 rounded-full", severity === "high" ? "bg-destructive" : severity === "medium" ? "bg-brand-accent" : "bg-muted-foreground")} aria-hidden="true" />
      {riskLabel(code)}
    </span>
  );
}

const STAGE_DOT: Record<DealStage, string> = {
  prospecting: "bg-chart-4",
  discovery: "bg-chart-3",
  demo: "bg-chart-1",
  proposal: "bg-chart-5",
  negotiation: "bg-chart-2",
  closed_won: "bg-chart-3",
  closed_lost: "bg-muted-foreground",
};

export function stageDot(stage: DealStage) {
  return STAGE_DOT[stage];
}

export function StageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground whitespace-nowrap", className)}>
      <span className={cn("size-2 rounded-full", STAGE_DOT[stage])} aria-hidden="true" />
      {DEAL_STAGE_LABELS[stage]}
    </span>
  );
}

/** A thin horizontal meter, filled with a chart colour. */
export function Meter({ value, className, fill = "bg-chart-1", label }: { value: number; className?: string; fill?: string; label?: string }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <span
      className={cn("block h-1.5 overflow-hidden rounded-full bg-muted", className)}
      role={label ? "meter" : undefined}
      aria-label={label}
      aria-valuenow={label ? width : undefined}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
    >
      <span className={cn("block h-full rounded-full", fill)} style={{ width: `${width}%` }} />
    </span>
  );
}

/** Rep vs. everyone else on a call, as one stacked bar. */
export function TalkSplit({ rep, className, showLabels = true }: { rep: number | null; className?: string; showLabels?: boolean }) {
  if (rep === null) return <span className="text-xs text-muted-foreground">—</span>;
  const repPct = Math.round(rep * 100);
  return (
    <span className={cn("grid gap-1", className)} aria-label={`Rep talked ${repPct}% of the call`}>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="h-full bg-chart-1" style={{ width: `${repPct}%` }} />
        <span className="h-full bg-chart-2" style={{ width: `${100 - repPct}%` }} />
      </span>
      {showLabels ? (
        <span className="flex justify-between text-[0.7rem] tabular-nums text-muted-foreground" aria-hidden="true">
          <span>Rep {repPct}%</span>
          <span>Buyer {100 - repPct}%</span>
        </span>
      ) : null}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="rounded border border-border bg-muted px-1 font-mono text-[0.7rem] text-muted-foreground">{children}</span>;
}

/** Duration as "32m" / "1h 05m" for headlines (formatTimestamp gives clock time). */
export function minutesLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function compactMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: amount >= 1_000_000 ? 2 : 1 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}
