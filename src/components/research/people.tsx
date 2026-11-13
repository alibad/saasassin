"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { cn } from "@/lib/utils";

/** A workspace member as the research workspace API returns them (name, photo, role). */
export type ResearchPerson = {
  uid: string;
  email: string;
  name: string;
  title: string;
  photoURL: string | null;
  role: string;
  roleLabel: string;
};

type Directory = { byUid: Map<string, ResearchPerson>; byEmail: Map<string, ResearchPerson>; viewerUid: string | null };

const PeopleContext = createContext<Directory>({ byUid: new Map(), byEmail: new Map(), viewerUid: null });

export function PeopleProvider({ people, viewerUid = null, children }: { people: ResearchPerson[]; viewerUid?: string | null; children: ReactNode }) {
  const value = useMemo<Directory>(() => ({
    byUid: new Map(people.map((person) => [person.uid, person])),
    byEmail: new Map(people.filter((person) => person.email).map((person) => [person.email.toLowerCase(), person])),
    viewerUid,
  }), [people, viewerUid]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

/** Looks a person up by uid, then by email. People who have left resolve to their email only. */
export function usePerson(ref: { uid?: string | null; email?: string | null }) {
  const directory = useContext(PeopleContext);
  const found = (ref.uid ? directory.byUid.get(ref.uid) : undefined) ?? (ref.email ? directory.byEmail.get(ref.email.toLowerCase()) : undefined);
  const uid = found?.uid ?? ref.uid ?? ref.email ?? "";
  const email = found?.email ?? ref.email ?? "";
  const name = found?.name || (email ? email.split("@")[0] : "") || "Former member";
  return {
    uid,
    email,
    name,
    photoURL: found?.photoURL ?? null,
    roleLabel: found?.roleLabel ?? "",
    title: found?.title ?? "",
    isMember: Boolean(found),
    isYou: Boolean(found && found.uid === directory.viewerUid),
  };
}

export function PersonAvatar({ uid, email, size = "sm", className }: { uid?: string | null; email?: string | null; size?: UserAvatarSize; className?: string }) {
  const person = usePerson({ uid, email });
  return <UserAvatar person={{ uid: person.uid, name: person.name, email: person.email, photoURL: person.photoURL }} size={size} className={className} />;
}

export function PersonName({ uid, email, you = true, lower = false }: { uid?: string | null; email?: string | null; you?: boolean; lower?: boolean }) {
  const person = usePerson({ uid, email });
  return <>{you && person.isYou ? (lower ? "you" : "You") : person.name}</>;
}

/** "(avatar) Amara Osei · 3 days ago" — who did something and when. */
export function Byline({ uid, email, at, prefix, size = "xs", className }: { uid?: string | null; email?: string | null; at?: string | null; prefix?: string; size?: UserAvatarSize; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <PersonAvatar uid={uid} email={email} size={size} />
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        <span className="font-medium text-foreground/80"><PersonName uid={uid} email={email} lower={Boolean(prefix)} /></span>
        {at ? <> · <time dateTime={at}>{relativeTime(at)}</time></> : null}
      </span>
    </span>
  );
}

/** Overlapping avatars for the people behind a piece of work. */
export function AvatarStack({ uids, max = 4, size = "sm", className }: { uids: string[]; max?: number; size?: UserAvatarSize; className?: string }) {
  const shown = uids.slice(0, max);
  const extra = uids.length - shown.length;
  return (
    <span className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((uid) => <PersonAvatar key={uid} uid={uid} size={size} className="ring-2 ring-card" />)}
      {extra > 0 ? (
        <span className="grid size-6 place-items-center rounded-full bg-muted text-[0.65rem] font-medium text-muted-foreground ring-2 ring-card">+{extra}</span>
      ) : null}
    </span>
  );
}

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 days ago", "just now"; falls back to the raw value when it is not a date. */
export function relativeTime(value: string | null | undefined, now = Date.now()) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return value;
  const diff = time - now;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit);
  }
  return "just now";
}
