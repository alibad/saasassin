"use client";

import type { ReactNode } from "react";
import { ChevronUp } from "lucide-react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STATUS_DISPLAY } from "@/lib/feedback/display";
import type { PostStatus } from "@/lib/feedback/model";
import type { PersonRef, PersonView, Tag } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new Error("You appear to be offline. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "Something went wrong. Try again.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export { STATUS_DISPLAY };

const STATUS_STYLE: Record<PostStatus, string> = {
  open: "border border-border bg-background text-muted-foreground",
  planned: "bg-secondary text-secondary-foreground",
  started: "bg-accent text-accent-foreground",
  completed: "bg-primary text-primary-foreground",
  declined: "bg-destructive/10 text-destructive",
  duplicate: "bg-muted text-muted-foreground",
};

const STATUS_DOT: Record<PostStatus, string> = {
  open: "bg-muted-foreground/60",
  planned: "bg-chart-1",
  started: "bg-brand-accent",
  completed: "bg-primary",
  declined: "bg-destructive",
  duplicate: "bg-muted-foreground/40",
};

export function StatusBadge({ status, className }: { status: PostStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold", STATUS_STYLE[status], className)}>
      {STATUS_DISPLAY[status]}
    </span>
  );
}

export function StatusDot({ status, className }: { status: PostStatus; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

export function TagChip({ tag, className }: { tag: Tag; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-background px-2 text-xs font-medium text-foreground", className)}>
      <span className="size-2 rounded-full" style={{ background: tag.color }} aria-hidden="true" />
      {tag.name}
    </span>
  );
}

/** The upvote box: a button on public boards, a read-only count in the team inbox. */
export function VoteCount({ votes, voted, className }: { votes: number; voted?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border py-1.5 font-bold tabular-nums",
        voted ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground",
        className,
      )}
    >
      <ChevronUp className="size-4" aria-hidden="true" />
      <span className="text-sm leading-none">{votes}</span>
    </span>
  );
}

/** A person's face (photo, or initials when they have none) from a stored reference plus the people map. */
export function PersonAvatar({
  person,
  people,
  size = "sm",
  className,
}: {
  person: PersonRef | { uid: string; name: string } | null | undefined;
  people?: Record<string, PersonView>;
  size?: UserAvatarSize;
  className?: string;
}) {
  const known = person?.uid ? people?.[person.uid] : undefined;
  const photoURL = known?.photoURL ?? (person && "photoURL" in person ? person.photoURL ?? null : null);
  const name = known?.name || person?.name || "Someone";
  return <UserAvatar person={{ uid: person?.uid || name, name, photoURL }} size={size} className={className} />;
}

/** Overlapping faces with the full list of names in a tooltip. */
export function AvatarStack({
  people,
  extra = 0,
  label,
  size = "xs",
}: {
  people: Array<{ uid: string; name: string; photoURL: string | null }>;
  extra?: number;
  label: string;
  size?: UserAvatarSize;
}) {
  if (!people.length) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center" tabIndex={0} aria-label={label}>
          <span className="flex -space-x-1.5">
            {people.map((person) => (
              <UserAvatar key={person.uid} person={person} size={size} className="ring-2 ring-card" />
            ))}
          </span>
          {extra > 0 ? <span className="ml-1.5 text-xs font-medium text-muted-foreground">+{extra}</span> : null}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-border bg-brand-subtle/60 px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-5">{icon}</div> : null}
      <p className="brand-heading text-base">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/** "3 days ago", "Nov 2" — compact times for lists. */
export function timeAgo(value: string | null | undefined) {
  if (!value) return "just now";
  const then = new Date(value).getTime();
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
