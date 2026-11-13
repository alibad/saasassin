"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/types/lattice";

/*
 * Building blocks shared by every Performance screen: who people are (name, title, photo),
 * page headers, empty states, stat tiles and progress bars. Styled only with the brand's
 * tokens (src/brands/performance/theme.css), so light and dark both follow the brand.
 */

export type Person = {
  id: string;
  uid: string | null;
  name: string;
  email: string;
  title: string;
  teamName: string | null;
  managerId: string | null;
  photoURL: string | null;
  status: WorkspaceMember["status"];
};

type People = {
  byId: Map<string, Person>;
  byUid: Map<string, Person>;
  meId: string | null;
};

const PeopleContext = createContext<People>({ byId: new Map(), byUid: new Map(), meId: null });

export function PeopleProvider({
  members,
  photos,
  meId,
  children,
}: {
  members: WorkspaceMember[];
  photos: Record<string, string>;
  meId: string | null;
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const byId = new Map<string, Person>();
    const byUid = new Map<string, Person>();
    for (const member of members) {
      const person: Person = {
        id: member.id,
        uid: member.authUid,
        name: member.name,
        email: member.email,
        title: member.title,
        teamName: member.teamName,
        managerId: member.managerId,
        photoURL: photos[member.id] ?? null,
        status: member.status,
      };
      byId.set(member.id, person);
      if (member.authUid) byUid.set(member.authUid, person);
    }
    return { byId, byUid, meId };
  }, [members, photos, meId]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePeople() {
  return useContext(PeopleContext);
}

/**
 * A person's face: their photo when they have one, else initials. Pass the directory member id,
 * or the account uid (audit events record the account, not the directory record).
 */
export function PersonAvatar({
  memberId,
  uid,
  name,
  size = "md",
  className,
}: {
  memberId?: string | null;
  uid?: string | null;
  name: string;
  size?: UserAvatarSize;
  className?: string;
}) {
  const { byId, byUid } = usePeople();
  const person = (memberId ? byId.get(memberId) : undefined) ?? (uid ? byUid.get(uid) : undefined);
  return (
    <UserAvatar
      size={size}
      className={className}
      person={{ uid: person?.id ?? memberId ?? uid ?? name, name: person?.name ?? name, photoURL: person?.photoURL ?? null }}
    />
  );
}

/** Avatar beside a name and an optional second line. */
export function PersonLine({
  memberId,
  uid,
  name,
  detail,
  size = "md",
  className,
  you = false,
}: {
  memberId?: string | null;
  uid?: string | null;
  name: string;
  detail?: ReactNode;
  size?: UserAvatarSize;
  className?: string;
  you?: boolean;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <PersonAvatar memberId={memberId} uid={uid} name={name} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">
          {name}
          {you ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
        </span>
        {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
  );
}

/** Overlapping faces, e.g. the peers reviewing someone. */
export function AvatarStack({ memberIds, max = 4, size = "sm" }: { memberIds: string[]; max?: number; size?: UserAvatarSize }) {
  const { byId } = usePeople();
  const shown = memberIds.slice(0, max);
  const rest = memberIds.length - shown.length;
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((id) => (
        <PersonAvatar key={id} memberId={id} name={byId.get(id)?.name ?? "Colleague"} size={size} className="ring-2 ring-card" />
      ))}
      {rest > 0 ? (
        <span className="relative inline-flex size-6 items-center justify-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground ring-2 ring-card">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="brand-heading text-[1.75rem] leading-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[0.95rem] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  actions,
  count,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
          {title}
          {count !== undefined ? <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground tabular-nums">{count}</span> : null}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-12 text-center", className)}>
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="grid gap-1">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <Card className="gap-2 px-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {label}
        {Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
      </div>
      <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export function Meter({
  value,
  label,
  tone = "primary",
  className,
}: {
  value: number;
  label: string;
  tone?: "primary" | "accent" | "warning" | "danger";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          tone === "primary" && "bg-primary",
          tone === "accent" && "bg-brand-accent",
          tone === "warning" && "bg-chart-4",
          tone === "danger" && "bg-destructive",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** A small coloured status pill with a dot. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: "positive" | "neutral" | "attention" | "negative" | "info";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tone === "positive" && "bg-secondary text-secondary-foreground",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "attention" && "bg-accent text-accent-foreground",
        tone === "negative" && "bg-destructive/10 text-destructive",
        tone === "info" && "bg-primary/10 text-primary",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "positive" && "bg-primary",
          tone === "neutral" && "bg-muted-foreground/60",
          tone === "attention" && "bg-brand-accent",
          tone === "negative" && "bg-destructive",
          tone === "info" && "bg-primary",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

export function formatDate(value: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", options).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

/** "3 days ago", "in 2 weeks", relative to `now` (the server's clock, so it renders the same twice). */
export function formatRelative(value: string | null | undefined, now: string) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  const diff = date.getTime() - new Date(now).getTime();
  if (Number.isNaN(diff)) return "";
  const minutes = Math.round(diff / 60000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 14) return format.format(days, "day");
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 9) return format.format(weeks, "week");
  return formatDate(value);
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}
