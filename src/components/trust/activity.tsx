"use client";

import { UserAvatar } from "@/components/account/user-avatar";

import { timeAgo } from "./shared";
import type { TrustSnapshot } from "./types";

const VERBS: Record<string, string> = {
  "program.frameworks_selected": "chose the frameworks for",
  "program.library_migrated": "updated the control library of",
  "program.people_in_scope_updated": "updated who must acknowledge policies in",
  "control.updated": "updated control",
  "evidence.added": "added evidence",
  "evidence.accepted": "accepted evidence",
  "evidence.rejected": "rejected evidence",
  "evidence.removed": "removed evidence",
  "policy.created": "drafted",
  "policy.revised": "revised",
  "policy.approved": "approved",
  "policy.acknowledged": "acknowledged",
  "policy.acknowledgement_recorded": "recorded an acknowledgement of",
  "risk.created": "added risk",
  "risk.updated": "updated risk",
  "vendor.created": "added vendor",
  "vendor.updated": "updated vendor",
  "vendor.removed": "removed vendor",
  "trust_center.updated": "updated the trust center",
  "audit_period.created": "planned",
  "audit_period.updated": "updated",
  "auditor_access.granted": "gave an auditor access to",
  "auditor_access.revoked": "ended an auditor's access to",
  "finding.created": "logged finding",
  "finding.updated": "updated finding",
  "system.created": "listed system",
  "system.updated": "updated users of",
  "access_review.signed_off": "signed off the access review for",
  "tenant.created": "created the workspace",
  "invitation.created": "invited someone to the workspace",
  "invitation.resent": "sent a new invitation link",
  "invitation.revoked": "revoked an invitation",
  "invitation.accepted": "joined the workspace",
  "membership.granted": "added someone to the workspace",
  "membership.role_changed": "changed someone's role",
  "membership.removed": "removed someone from the workspace",
  "membership.left": "left the workspace",
  "ownership.transferred": "transferred ownership",
};

/** The record an activity entry is about, in words. */
function subject(snapshot: TrustSnapshot, target: { type: string; id: string } | undefined) {
  if (!target) return "";
  switch (target.type) {
    case "control": {
      const control = snapshot.controls.find((entry) => entry.id === target.id);
      return control ? `${control.requirementRefs.join(", ")} ${control.title}` : target.id;
    }
    case "evidence": return snapshot.evidence.find((entry) => entry.id === target.id)?.title ?? "";
    case "policy": return snapshot.policies.find((entry) => entry.id === target.id)?.title ?? "";
    case "risk": return snapshot.risks.find((entry) => entry.id === target.id)?.title ?? "";
    case "vendor": return snapshot.vendors.find((entry) => entry.id === target.id)?.name ?? "";
    case "audit_period": return snapshot.auditPeriods.find((entry) => entry.id === target.id)?.name ?? "an audit period";
    case "finding": return snapshot.findings.find((entry) => entry.id === target.id)?.title ?? "";
    case "system": return snapshot.systems.find((entry) => entry.id === target.id)?.name ?? "";
    case "program":
    case "settings": return "the program";
    default: return "";
  }
}

export function describeActivity(snapshot: TrustSnapshot, event: TrustSnapshot["audit"][number]) {
  const verb = VERBS[event.action] ?? event.action.replace(/[._]/g, " ");
  return { verb, subject: subject(snapshot, event.target) };
}

/** Who did what, newest first, with each person's face. */
export function ActivityFeed({ snapshot, limit, dense = false }: { snapshot: TrustSnapshot; limit?: number; dense?: boolean }) {
  const events = limit ? snapshot.audit.slice(0, limit) : snapshot.audit;
  if (events.length === 0) return <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">Changes to controls, evidence and policies appear here as your team works.</p>;
  return (
    <ol className="divide-y divide-border">
      {events.map((event) => {
        const uid = event.actor?.uid ?? "";
        const person = snapshot.directory[uid];
        const name = person?.name || event.actor?.email || "Someone";
        const { verb, subject: what } = describeActivity(snapshot, event);
        return (
          <li key={event.id} className={dense ? "flex items-start gap-3 px-4 py-2.5 sm:px-5" : "flex items-start gap-3 px-4 py-3 sm:px-5"}>
            <UserAvatar person={{ uid, name, email: event.actor?.email, photoURL: person?.photoURL ?? null }} size={dense ? "sm" : "md"} />
            <p className="min-w-0 flex-1 text-sm leading-6">
              <span className="font-medium">{name}</span> <span className="text-muted-foreground">{verb}</span>{what ? <> <span className="font-medium">{what}</span></> : null}
            </p>
            <time className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground" dateTime={event.occurredAt ?? undefined}>{timeAgo(event.occurredAt)}</time>
          </li>
        );
      })}
    </ol>
  );
}
