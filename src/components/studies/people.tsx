"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { cn } from "@/lib/utils";

/** A workspace member with their name and photo, as the Studies members API returns them. */
export type StudiesPerson = { uid: string; email: string; name: string; photoURL: string | null; role: string; roleLabel: string };

type Directory = { byUid: Map<string, StudiesPerson>; byEmail: Map<string, StudiesPerson>; viewerUid: string | null };

const PeopleContext = createContext<Directory>({ byUid: new Map(), byEmail: new Map(), viewerUid: null });

export function PeopleProvider({ people, viewerUid = null, children }: { people: StudiesPerson[]; viewerUid?: string | null; children: ReactNode }) {
  const value = useMemo<Directory>(() => ({
    byUid: new Map(people.map((person) => [person.uid, person])),
    byEmail: new Map(people.filter((person) => person.email).map((person) => [person.email.toLowerCase(), person])),
    viewerUid,
  }), [people, viewerUid]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePerson(ref: { uid?: string | null; email?: string | null }) {
  const directory = useContext(PeopleContext);
  const found = (ref.uid ? directory.byUid.get(ref.uid) : undefined) ?? (ref.email ? directory.byEmail.get(ref.email.toLowerCase()) : undefined);
  const email = found?.email ?? ref.email ?? "";
  return {
    uid: found?.uid ?? ref.uid ?? email,
    email,
    name: found?.name || (email ? email.split("@")[0] : "") || "Former member",
    photoURL: found?.photoURL ?? null,
    isYou: Boolean(found && found.uid === directory.viewerUid),
  };
}

export function PersonAvatar({ uid, email, size = "sm", className }: { uid?: string | null; email?: string | null; size?: UserAvatarSize; className?: string }) {
  const person = usePerson({ uid, email });
  return <UserAvatar person={person} size={size} className={className} />;
}

export function PersonName({ uid, email }: { uid?: string | null; email?: string | null }) {
  const person = usePerson({ uid, email });
  return <>{person.isYou ? "You" : person.name}</>;
}

export function Byline({ uid, email, at, prefix, size = "xs", className }: { uid?: string | null; email?: string | null; at?: string | null; prefix?: string; size?: UserAvatarSize; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <PersonAvatar uid={uid} email={email} size={size} />
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        <span className="font-medium text-foreground/80"><PersonName uid={uid} email={email} /></span>
        {at ? <> · <time dateTime={at}>{relativeTime(at)}</time></> : null}
      </span>
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
