import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import type { SessionUser } from "@/lib/lattice/auth";
import { auditRecord, emailInviteKey, requireDb } from "@/lib/lattice/data";

/**
 * Links imported directory records to the signed-in Firebase user.
 *
 * Imported employees keep their directory member id (reviews, goals and packets
 * already reference it). On a sign-in whose email is verified, every pending
 * invite for that email is claimed: the member gets `authUid`, becomes active
 * (unless deactivated), and `memberLinks/{uid}` maps the uid back to the member
 * id for server authorization and Firestore rules. Idempotent and safe to call
 * on every page load.
 */
export async function linkInvitedMemberships(actor: SessionUser) {
  if (!actor.emailVerified || !actor.email) return { linked: 0 };
  const db = requireDb();
  const email = actor.email.trim().toLowerCase();
  const invites = await db.collection(`latticeInvites/${emailInviteKey(email)}/organizations`).get();
  let linked = 0;
  for (const invite of invites.docs) {
    const organizationId = invite.id;
    const memberId = String(invite.data().memberId ?? "");
    if (!memberId || invite.data().claimedBy) continue;
    const base = db.collection("organizations").doc(organizationId);
    const memberRef = base.collection("members").doc(memberId);
    const linkRef = base.collection("memberLinks").doc(actor.uid);
    const didLink = await db.runTransaction(async (transaction) => {
      const [organization, member, existingLink] = await Promise.all([
        transaction.get(base),
        transaction.get(memberRef),
        transaction.get(linkRef),
      ]);
      const data = member.data();
      if (!organization.exists || !data) return false;
      if (String(data.email ?? "").toLowerCase() !== email) return false;
      if (data.authUid && data.authUid !== actor.uid) return false;
      if (existingLink.exists && existingLink.data()?.memberId !== memberId) return false;
      transaction.set(memberRef, {
        authUid: actor.uid,
        status: data.status === "inactive" ? "inactive" : "active",
        linkedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (memberId !== actor.uid) {
        transaction.set(linkRef, { memberId, linkedAt: FieldValue.serverTimestamp() });
      }
      transaction.set(db.doc(`users/${actor.uid}/memberships/${organizationId}`), {
        organizationId,
        organizationName: String(organization.data()?.name ?? "Workspace"),
        roleId: String(data.roleId ?? "employee"),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(invite.ref, { claimedBy: actor.uid, claimedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(base.collection("auditEvents").doc(), auditRecord({
        actor,
        eventType: "member.linked",
        entityType: "member",
        entityId: memberId,
        summary: `${String(data.name ?? "An employee")} signed in and claimed their directory record.`,
        metadata: { memberId },
      }));
      return true;
    });
    if (didLink) linked += 1;
  }
  return { linked };
}
