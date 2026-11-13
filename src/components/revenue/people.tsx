"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import { cn } from "@/lib/utils";

import type { Workspace } from "./client";

/**
 * Teammates (with their profile photos) and buyer contacts (initials), looked up by the emails
 * and ids the Revenue records carry. Someone who has left the workspace keeps their name from
 * their email, without a photo.
 */

export type Teammate = { uid: string; email: string; name: string; title: string; photoURL: string | null; role: string | null; current: boolean };

type Directory = {
  byEmail: Map<string, Teammate>;
  contacts: Map<string, { id: string; name: string; title: string; accountId: string }>;
};

const PeopleContext = createContext<Directory | null>(null);

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || email;
}

export function PeopleProvider({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  const value = useMemo<Directory>(() => {
    const byEmail = new Map<string, Teammate>();
    for (const member of workspace.members) {
      byEmail.set(member.email.toLowerCase(), {
        uid: member.uid,
        email: member.email,
        name: member.name || nameFromEmail(member.email),
        title: member.title ?? "",
        photoURL: member.photoURL ?? null,
        role: member.role,
        current: true,
      });
    }
    const contacts = new Map(workspace.contacts.map((contact) => [contact.id, { id: contact.id, name: contact.name, title: contact.title, accountId: contact.accountId }]));
    return { byEmail, contacts };
  }, [workspace.members, workspace.contacts]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePeople() {
  const directory = useContext(PeopleContext);
  return useMemo(() => {
    const byEmail = directory?.byEmail ?? new Map<string, Teammate>();
    const contacts = directory?.contacts ?? new Map();
    function teammate(email: string | null | undefined): Teammate {
      const key = (email ?? "").toLowerCase();
      return byEmail.get(key) ?? { uid: `former:${key}`, email: email ?? "", name: email ? nameFromEmail(email) : "Unassigned", title: "", photoURL: null, role: null, current: false };
    }
    return {
      teammate,
      name: (email: string | null | undefined) => teammate(email).name,
      firstName: (email: string | null | undefined) => teammate(email).name.split(" ")[0],
      contact: (id: string) => contacts.get(id) ?? null,
      members: [...byEmail.values()],
    };
  }, [directory]);
}

/** A teammate's photo (or initials) by email. */
export function PersonAvatar({ email, size = "sm", className }: { email: string | null | undefined; size?: UserAvatarSize; className?: string }) {
  const { teammate } = usePeople();
  const person = teammate(email);
  return <UserAvatar person={{ uid: person.uid, name: person.name, email: person.email, photoURL: person.photoURL }} size={size} className={className} />;
}

/** Avatar + name (and optional second line) for a teammate. */
export function PersonChip({
  email,
  size = "sm",
  detail,
  className,
  nameClassName,
}: {
  email: string | null | undefined;
  size?: UserAvatarSize;
  detail?: ReactNode;
  className?: string;
  nameClassName?: string;
}) {
  const { teammate } = usePeople();
  const person = teammate(email);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <UserAvatar person={{ uid: person.uid, name: person.name, email: person.email, photoURL: person.photoURL }} size={size} />
      <span className="grid min-w-0 leading-tight">
        <span className={cn("truncate text-sm font-medium text-foreground", nameClassName)}>{person.name}</span>
        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
  );
}

/** A buyer contact: initials on a soft square, so customers read differently from your team. */
export function ContactAvatar({ id, name, size = "sm", className }: { id: string; name: string; size?: UserAvatarSize; className?: string }) {
  return (
    <UserAvatar
      person={{ uid: `contact:${id}`, name }}
      size={size}
      className={cn("rounded-md after:rounded-md [&_[data-slot=avatar-fallback]]:rounded-md", className)}
    />
  );
}

/** Overlapping avatars for a few teammates. */
export function AvatarStack({ emails, max = 4, size = "sm" }: { emails: string[]; max?: number; size?: UserAvatarSize }) {
  const unique = [...new Set(emails.map((email) => email.toLowerCase()))];
  return (
    <span className="flex items-center -space-x-1.5">
      {unique.slice(0, max).map((email) => (
        <PersonAvatar key={email} email={email} size={size} className="ring-2 ring-card" />
      ))}
      {unique.length > max ? <span className="pl-2.5 text-xs text-muted-foreground">+{unique.length - max}</span> : null}
    </span>
  );
}
