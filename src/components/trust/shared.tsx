"use client";

import { useMemo, useState, type ReactNode } from "react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTROL_STATUS_LABELS, type ControlStatus, type EvidenceFreshness, type RiskLevel } from "@/lib/trust/model";
import { cn } from "@/lib/utils";

import type { TrustSnapshot } from "./types";

/** A surface: hairline border, the brand's 6px radius, barely-there shadow. */
export const panel = "min-w-0 rounded-lg border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

type Tone = "positive" | "progress" | "warning" | "critical" | "neutral" | "muted";

const TONES: Record<Tone, string> = {
  positive: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  progress: "bg-sky-50 text-sky-800 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
  critical: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25",
  neutral: "bg-muted text-foreground/80 ring-border",
  muted: "bg-transparent text-muted-foreground ring-border",
};

const DOTS: Record<Tone, string> = {
  positive: "bg-emerald-500",
  progress: "bg-sky-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  neutral: "bg-muted-foreground/60",
  muted: "bg-muted-foreground/40",
};

/** A small status pill with a dot: precise, quiet, readable in both modes. */
export function Pill({ tone, children, className, dot = true }: { tone: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {dot ? <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<ControlStatus, Tone> = {
  implemented: "positive",
  in_progress: "progress",
  needs_evidence: "warning",
  not_started: "neutral",
  not_applicable: "muted",
};

export const STATUS_BAR: Record<ControlStatus, string> = {
  implemented: "bg-emerald-500",
  in_progress: "bg-sky-500",
  needs_evidence: "bg-amber-500",
  not_started: "bg-muted-foreground/25",
  not_applicable: "bg-muted-foreground/10",
};

export function StatusBadge({ status }: { status: ControlStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{CONTROL_STATUS_LABELS[status]}</Pill>;
}

const FRESHNESS: Record<EvidenceFreshness, [string, Tone]> = {
  fresh: ["Current", "positive"],
  no_expiry: ["No expiry", "neutral"],
  expiring_soon: ["Expiring soon", "warning"],
  expired: ["Expired", "critical"],
};

export function FreshnessBadge({ freshness }: { freshness: EvidenceFreshness }) {
  const [label, tone] = FRESHNESS[freshness];
  return <Pill tone={tone}>{label}</Pill>;
}

const LEVEL: Record<RiskLevel, Tone> = { low: "neutral", medium: "warning", high: "critical", critical: "critical" };

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <Pill tone={LEVEL[level]} className={cn("capitalize", level === "critical" && "bg-red-600 text-white ring-red-600 dark:bg-red-500 dark:text-white")}>
      {level} <span className="font-mono tabular-nums opacity-80">{score}</span>
    </Pill>
  );
}

export function TierBadge({ tier }: { tier: "low" | "medium" | "high" | "critical" }) {
  return <Pill tone={LEVEL[tier]} className={cn("capitalize", tier === "critical" && "bg-red-600 text-white ring-red-600 dark:bg-red-500 dark:text-white")}>{tier}</Pill>;
}

const REVIEW: Record<string, [string, Tone]> = {
  pending: ["Awaiting review", "neutral"],
  accepted: ["Accepted", "positive"],
  rejected: ["Rejected", "critical"],
};

export function ReviewBadge({ status }: { status: string }) {
  const [label, tone] = REVIEW[status] ?? REVIEW.pending;
  return <Pill tone={tone}>{label}</Pill>;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------ people */

type Directory = { members: TrustSnapshot["members"] };

/** A member's display data by email; null for people without workspace access. */
export function memberByEmail(snapshot: Directory, email: string | null | undefined) {
  if (!email) return null;
  const needle = email.toLowerCase();
  return snapshot.members.find((member) => member.email.toLowerCase() === needle) ?? null;
}

export function displayName(snapshot: Directory, email: string | null | undefined) {
  const member = memberByEmail(snapshot, email);
  return member?.name || email || "Unassigned";
}

/** Someone's face from their email: their photo when they are a member, else initials. */
export function EmailAvatar({ snapshot, email, size = "sm", className }: { snapshot: Directory; email: string; size?: UserAvatarSize; className?: string }) {
  const member = memberByEmail(snapshot, email);
  return (
    <UserAvatar
      person={{ uid: member?.uid ?? email, name: member?.name || null, email, photoURL: member?.photoURL ?? null }}
      size={size}
      className={className}
    />
  );
}

/** Avatar and name for an owner or actor email, with an honest empty state. */
export function PersonCell({ snapshot, email, detail, size = "sm", emptyLabel = "Unassigned" }: {
  snapshot: Directory;
  email: string | null | undefined;
  detail?: ReactNode;
  size?: UserAvatarSize;
  emptyLabel?: string;
}) {
  if (!email) return <span className="inline-flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"><span className="size-6 rounded-full border border-dashed border-current" aria-hidden="true" />{emptyLabel}</span>;
  const member = memberByEmail(snapshot, email);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <EmailAvatar snapshot={snapshot} email={email} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{member?.name || email}</span>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
  );
}

const NONE = "__none";

export function MemberSelect({
  id,
  members,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  members: TrustSnapshot["members"];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const options = [...members];
  if (value && !members.some((member) => member.email.toLowerCase() === value.toLowerCase())) {
    options.push({ uid: value, email: value, name: "", role: "", title: "", photoURL: null });
  }
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {options.map((member) => (
          <SelectItem key={member.email} value={member.email}>
            <UserAvatar person={{ uid: member.uid, name: member.name || null, email: member.email, photoURL: member.photoURL }} size="xs" />
            {member.name || member.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SimpleSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  disabled,
  className,
  ariaLabel,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ControlPicker({
  controls,
  selected,
  onChange,
}: {
  controls: TrustSnapshot["controls"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return controls.filter((control) =>
      !needle || `${control.requirementRefs.join(" ")} ${control.title} ${control.category}`.toLowerCase().includes(needle),
    );
  }, [controls, query]);
  return (
    <div className="grid gap-2">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter controls, e.g. CC6 or access" aria-label="Filter controls" />
      <ScrollArea className="h-44 rounded-md border border-border bg-background">
        <div className="grid gap-0.5 p-1.5">
          {filtered.map((control) => {
            const checked = selected.includes(control.id);
            return (
              <label key={control.id} className="flex cursor-pointer items-start gap-2 rounded-[4px] px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    onChange(value ? [...selected, control.id] : selected.filter((entry) => entry !== control.id))
                  }
                />
                <span><span className="font-mono text-xs font-semibold">{control.requirementRefs.join(", ")}</span> {control.title}</span>
              </label>
            );
          })}
          {filtered.length === 0 ? <p className="p-2 text-sm text-muted-foreground">No controls match.</p> : null}
        </div>
      </ScrollArea>
      <p className="text-xs text-muted-foreground">{selected.length} selected</p>
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-brand-subtle px-6 py-10 text-center">
      {icon ? <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">{icon}</div> : null}
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Page title row: what this page is, and its primary actions. */
export function PageHeader({ title, description, action, meta }: { title: string; description?: ReactNode; action?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {meta ? <div className="mb-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        <h1 className="brand-heading text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Card header used inside panels. */
export function PanelHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: value.length === 10 ? "UTC" : undefined }).format(date);
}

export function timeAgo(value: string | null | undefined) {
  if (!value) return "just now";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}
