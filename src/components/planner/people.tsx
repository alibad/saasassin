"use client";

import { UserAvatar, type UserAvatarSize } from "@/components/account/user-avatar";
import type { PlannerMember, PlannerSnapshot } from "@/lib/planner/model";
import { cn } from "@/lib/utils";

/** Looks a workspace member up by uid; null for someone who has left (or an unknown id). */
export function memberById(snapshot: Pick<PlannerSnapshot, "members">, uid: string | null | undefined): PlannerMember | null {
  if (!uid) return null;
  return snapshot.members.find((member) => member.uid === uid) ?? null;
}

/** The person behind an audit or plan record: the member if they are still here, else just the email. */
export function personFor(snapshot: Pick<PlannerSnapshot, "members">, actor: { uid?: string | null; email?: string | null }) {
  const member = memberById(snapshot, actor.uid) ?? snapshot.members.find((entry) => entry.email && entry.email === actor.email) ?? null;
  if (member) return { uid: member.uid, name: member.name, email: member.email, photoURL: member.photoURL };
  return { uid: actor.uid || actor.email || "former", name: actor.email ? actor.email.split("@")[0] : "Former member", email: actor.email ?? null, photoURL: null };
}

export function firstName(name: string) {
  return name.split(/\s+/)[0] || name;
}

export function MemberAvatar({ member, size = "sm", className }: { member: PlannerMember | null; size?: UserAvatarSize; className?: string }) {
  if (!member) return null;
  return <UserAvatar person={member} size={size} className={className} />;
}

/** Overlapping faces for a group of people, with "+n" when there are more than `max`. */
export function AvatarStack({ people, max = 4, size = "sm", className }: { people: PlannerMember[]; max?: number; size?: UserAvatarSize; className?: string }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className={cn("flex items-center -space-x-1.5", className)}>
      {shown.map((person) => (
        <UserAvatar key={person.uid} person={person} size={size} className="ring-2 ring-card" />
      ))}
      {rest > 0 ? (
        <span className="z-10 grid size-6 place-items-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground ring-2 ring-card">+{rest}</span>
      ) : null}
    </span>
  );
}

/** A stable colour per project, from a hue list that reads in light and dark mode. */
const PROJECT_HUES = [38, 250, 300, 160, 85, 350, 200, 120];

export function projectHue(projects: { id: string }[], projectId: string | null | undefined) {
  if (!projectId) return null;
  const index = projects.findIndex((project) => project.id === projectId);
  return index < 0 ? null : PROJECT_HUES[index % PROJECT_HUES.length];
}

/** CSS colour for a project hue, or the neutral ink for work without a project. */
export function projectColor(hue: number | null) {
  return hue === null ? "var(--muted-foreground)" : `oklch(0.66 0.16 ${hue})`;
}

export function ProjectDot({ hue, className }: { hue: number | null; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: projectColor(hue) }} />;
}
