"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";

import type { MailPerson } from "./mail-api";

/**
 * Teammates in this mailbox, by email. A sender or recipient who is a teammate shows their
 * profile photo; everyone else (external senders without an account here) shows initials.
 * Remote images from mail are never fetched.
 */
type PeopleIndex = { byEmail: Map<string, MailPerson>; byUid: Map<string, MailPerson> };

const PeopleContext = createContext<PeopleIndex>({ byEmail: new Map(), byUid: new Map() });

export function MailPeopleProvider({ people, children }: { people: MailPerson[]; children: ReactNode }) {
  const value = useMemo<PeopleIndex>(() => ({
    byEmail: new Map(people.filter((person) => person.email).map((person) => [person.email!.toLowerCase(), person])),
    byUid: new Map(people.map((person) => [person.uid, person])),
  }), [people]);
  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export function usePeople() {
  return useContext(PeopleContext);
}

export function displayName(address: { name?: string | null; email?: string | null } | null | undefined, teammate?: MailPerson | null) {
  if (teammate?.name) return teammate.name;
  if (address?.name) return address.name;
  return address?.email?.split("@")[0] ?? "Unknown sender";
}

/** Avatar for an email address: the teammate's photo when the address belongs to one, else initials. */
export function AddressAvatar({ address, size = "md", className }: { address: { name?: string | null; email?: string | null } | null | undefined; size?: UserAvatarSize; className?: string }) {
  const { byEmail } = usePeople();
  const email = address?.email?.toLowerCase() ?? "";
  const teammate = email ? byEmail.get(email) ?? null : null;
  if (teammate) return <UserAvatar person={teammate} size={size} className={className} />;
  return <UserAvatar person={{ uid: email || address?.name || "unknown", name: address?.name ?? null, email: email || null, photoURL: null }} size={size} className={className} />;
}

/** Avatar for an audit actor (uid + email). */
export function ActorAvatar({ actor, size = "sm", className }: { actor: { uid?: string; email?: string }; size?: UserAvatarSize; className?: string }) {
  const { byUid, byEmail } = usePeople();
  const person = (actor.uid && byUid.get(actor.uid)) || (actor.email && byEmail.get(actor.email.toLowerCase())) || null;
  if (person) return <UserAvatar person={person} size={size} className={className} />;
  return <UserAvatar person={{ uid: actor.uid || actor.email || "former", email: actor.email ?? null, photoURL: null }} size={size} className={className} />;
}

export function actorName(actor: { uid?: string; email?: string }, people: PeopleIndex) {
  const person = (actor.uid && people.byUid.get(actor.uid)) || (actor.email && people.byEmail.get(actor.email.toLowerCase())) || null;
  return person?.name ?? actor.email?.split("@")[0] ?? "Former member";
}
