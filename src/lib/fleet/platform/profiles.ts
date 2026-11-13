import "server-only";

import { FieldValue, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";

import { getAdminAuth } from "@/lib/firebase/admin";
import { checkAvatarBytes, normalizeEmail } from "@/lib/fleet/account/identity";
import type { AccountProfile, PhotoSource } from "@/lib/fleet/account/types";

import { FleetError, type FleetUser } from "./session";
import { db } from "./tenants";

/**
 * Per-product profiles and profile photos.
 *
 *   products/{product}/users/{uid}                  profile: name, title, photo, providerPhotoURL
 *   products/{product}/users/{uid}/private/avatar   uploaded photo bytes (Firestore Bytes, <= 256 KB)
 *   products/{product}/users/{uid}/accountEvents    append-only account activity
 *
 * Each product is its own company, so a profile (and photo) set in one product does not
 * appear in another. Everything is server-only; clients never read these documents directly.
 */

export function profileRef(product: string, uid: string) {
  return db().collection("products").doc(product).collection("users").doc(uid);
}

function avatarRef(product: string, uid: string) {
  return profileRef(product, uid).collection("private").doc("avatar");
}

type StoredPhoto = { source: PhotoSource; version: number; chosen: boolean };

function storedPhoto(data: DocumentData | undefined): StoredPhoto {
  const photo = (data?.photo ?? {}) as Partial<StoredPhoto>;
  const source = photo.source === "upload" || photo.source === "provider" ? photo.source : "none";
  return { source, version: Number(photo.version ?? 0) || 0, chosen: photo.chosen === true };
}

export function avatarPath(product: string, uid: string, version: number) {
  return `/api/fleet/${encodeURIComponent(product)}/avatars/${encodeURIComponent(uid)}?v=${version}`;
}

/** What to show for a profile: the uploaded photo, the provider's photo, or null (initials). */
export function photoURLFor(product: string, uid: string, data: DocumentData | undefined) {
  const photo = storedPhoto(data);
  if (photo.source === "upload") return avatarPath(product, uid, photo.version);
  const provider = typeof data?.providerPhotoURL === "string" ? data.providerPhotoURL : null;
  if (photo.source === "provider" && provider) return provider;
  return null;
}

function profileView(product: string, user: FleetUser, data: DocumentData | undefined): AccountProfile {
  return {
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified === true,
    name: String(data?.name ?? "") || user.name || "",
    title: String(data?.title ?? ""),
    photoURL: photoURLFor(product, user.uid, data),
    photoSource: storedPhoto(data).source,
    providerPhotoURL: typeof data?.providerPhotoURL === "string" ? data.providerPhotoURL : null,
  };
}

/**
 * Creates the profile on first sign-in and keeps the provider photo URL, email and (unset)
 * name current on later ones. A provider photo becomes the shown photo unless the person
 * has explicitly chosen one (upload, provider or none) themselves.
 */
export async function syncProfileFromSession(product: string, user: FleetUser) {
  const ref = profileRef(product, user.uid);
  return db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const picture = user.picture ?? null;
    const now = FieldValue.serverTimestamp();
    if (!snapshot.exists) {
      const data = {
        uid: user.uid,
        email: normalizeEmail(user.email),
        name: user.name || "",
        title: "",
        photo: { source: picture ? "provider" : "none", version: 1, chosen: false, updatedAt: now },
        providerPhotoURL: picture,
        createdAt: now,
        updatedAt: now,
      };
      transaction.set(ref, data);
      return data as DocumentData;
    }
    const data = snapshot.data() ?? {};
    const updates: Record<string, unknown> = {};
    if ((data.providerPhotoURL ?? null) !== picture) updates.providerPhotoURL = picture;
    if (user.email && data.email !== normalizeEmail(user.email)) updates.email = normalizeEmail(user.email);
    if (!data.name && user.name) updates.name = user.name;
    const photo = storedPhoto(data);
    if (!photo.chosen && picture && photo.source === "none") {
      updates.photo = { source: "provider", version: photo.version + 1, chosen: false, updatedAt: now };
    }
    if (Object.keys(updates).length) {
      transaction.set(ref, { ...updates, updatedAt: now }, { merge: true });
      return { ...data, ...updates } as DocumentData;
    }
    return data;
  });
}

export async function getAccountProfile(product: string, user: FleetUser): Promise<AccountProfile> {
  const data = await syncProfileFromSession(product, user);
  return profileView(product, user, data);
}

/** Display data for several people at once (team lists, invitations). */
export async function loadProfiles(product: string, uids: string[]) {
  const unique = [...new Set(uids.filter(Boolean))];
  const profiles = new Map<string, { name: string; title: string; photoURL: string | null }>();
  if (!unique.length) return profiles;
  const snapshots = await db().getAll(...unique.map((uid) => profileRef(product, uid)));
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    const data = snapshot.data();
    profiles.set(snapshot.id, {
      name: String(data?.name ?? ""),
      title: String(data?.title ?? ""),
      photoURL: photoURLFor(product, snapshot.id, data),
    });
  }
  return profiles;
}

export async function appendAccountEvent(
  product: string,
  user: FleetUser,
  action: string,
  details: Record<string, unknown> = {},
) {
  await profileRef(product, user.uid).collection("accountEvents").add({
    action,
    actor: { uid: user.uid, email: user.email },
    details,
    occurredAt: FieldValue.serverTimestamp(),
  });
}

export type ProfileUpdate = { name?: string; title?: string; photoSource?: "provider" | "none" };

export async function updateAccountProfile(product: string, user: FleetUser, input: ProfileUpdate) {
  await syncProfileFromSession(product, user);
  const ref = profileRef(product, user.uid);
  const changed: string[] = [];
  const result = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    const photo = storedPhoto(data);
    const now = FieldValue.serverTimestamp();
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined && input.name !== data.name) {
      updates.name = input.name;
      changed.push("name");
    }
    if (input.title !== undefined && input.title !== data.title) {
      updates.title = input.title;
      changed.push("title");
    }
    if (input.photoSource !== undefined) {
      if (input.photoSource === "provider" && !data.providerPhotoURL) {
        throw new FleetError("Your sign-in provider has no photo to use. Upload one instead.", 400);
      }
      if (input.photoSource !== photo.source || !photo.chosen) {
        updates.photo = { source: input.photoSource, version: photo.version + 1, chosen: true, updatedAt: now };
        changed.push("photo");
        if (photo.source === "upload") transaction.delete(avatarRef(product, user.uid));
      }
    }
    if (Object.keys(updates).length) transaction.set(ref, { ...updates, updatedAt: now }, { merge: true });
    return { ...data, ...updates };
  });

  if (changed.includes("name")) await syncMembershipNames(product, user.uid, String(result.name ?? ""));
  if (changed.length) await appendAccountEvent(product, user, "profile.updated", { fields: changed });
  return profileView(product, user, result);
}

/** Keeps the name stored on each membership (read by older product screens) in step with the profile. */
async function syncMembershipNames(product: string, uid: string, name: string) {
  const index = await profileRef(product, uid).collection("tenants").get();
  if (index.empty) return;
  const batch = db().batch();
  for (const tenant of index.docs) {
    const membership = db().collection("products").doc(product).collection("tenants").doc(tenant.id).collection("memberships").doc(uid);
    batch.set(membership, { name }, { merge: true });
  }
  await batch.commit().catch((error) => console.error("Membership name sync failed", error));
}

/** Stores an already cropped and resized photo. The bytes are checked again here: never trust the client. */
export async function setUploadedPhoto(product: string, user: FleetUser, bytes: Uint8Array) {
  const check = checkAvatarBytes(bytes);
  if (!check.ok) throw new FleetError(check.message, check.message.includes("too large") ? 413 : 415);
  await syncProfileFromSession(product, user);
  const ref = profileRef(product, user.uid);
  const result = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() ?? {};
    const version = storedPhoto(data).version + 1;
    const now = FieldValue.serverTimestamp();
    transaction.set(avatarRef(product, user.uid), {
      bytes: Buffer.from(bytes),
      contentType: check.contentType,
      size: bytes.length,
      version,
      updatedAt: now,
    });
    const photo = { source: "upload", version, chosen: true, updatedAt: now };
    transaction.set(ref, { photo, updatedAt: now }, { merge: true });
    return { ...data, photo };
  });
  await appendAccountEvent(product, user, "profile.photo_uploaded", { contentType: check.contentType, size: bytes.length });
  return profileView(product, user, result);
}

export async function removeAccountPhoto(product: string, user: FleetUser) {
  const profile = await updateAccountProfile(product, user, { photoSource: "none" });
  return profile;
}

export type AvatarVisibility = (viewerUid: string, subjectUid: string) => Promise<boolean>;

/**
 * Uploaded photo bytes for `subjectUid`, but only for the subject or someone `canView` allows.
 * Everyone else gets null, which routes turn into a 404 so a stranger learns nothing.
 */
export async function readAvatar(product: string, viewer: FleetUser, subjectUid: string, canView: AvatarVisibility) {
  if (viewer.uid !== subjectUid && !(await canView(viewer.uid, subjectUid))) return null;
  // Awaited on purpose: Turbopack mis-infers a returned async call as always truthy.
  const avatar = await readAvatarBytes(product, subjectUid);
  return avatar;
}

async function readAvatarBytes(product: string, uid: string) {
  const [profile, avatar] = await Promise.all([profileRef(product, uid).get(), avatarRef(product, uid).get()]);
  if (storedPhoto(profile.data()).source !== "upload" || !avatar.exists) return null;
  return avatarFromSnapshot(avatar);
}

function avatarFromSnapshot(avatar: DocumentSnapshot) {
  const raw = avatar.get("bytes") as Buffer | Uint8Array | undefined;
  if (!raw) return null;
  const bytes = new Uint8Array(raw);
  // Re-check on the way out, so a bad write can never be served as something else.
  const check = checkAvatarBytes(bytes);
  if (!check.ok) return null;
  return { bytes, contentType: check.contentType, version: Number(avatar.get("version") ?? 0) };
}

/** An inline copy of someone's uploaded photo, for pages shown before the viewer is a member (invites). */
export async function avatarDataUrl(product: string, uid: string) {
  const avatar = await readAvatarBytes(product, uid);
  if (!avatar) return null;
  return `data:${avatar.contentType};base64,${Buffer.from(avatar.bytes).toString("base64")}`;
}

/** Whether two people are both active members of at least one workspace in this product. */
export async function sharesActiveTenant(product: string, viewerUid: string, subjectUid: string) {
  const index = await profileRef(product, viewerUid).collection("tenants").get();
  if (index.empty) return false;
  const tenants = db().collection("products").doc(product).collection("tenants");
  const refs = index.docs.flatMap((tenant) => [
    tenants.doc(tenant.id).collection("memberships").doc(viewerUid),
    tenants.doc(tenant.id).collection("memberships").doc(subjectUid),
  ]);
  const snapshots = await db().getAll(...refs);
  for (let position = 0; position < snapshots.length; position += 2) {
    const viewer = snapshots[position];
    const subject = snapshots[position + 1];
    if (viewer.exists && subject.exists && viewer.get("status") === "active" && subject.get("status") === "active") return true;
  }
  return false;
}

/**
 * "Sign out everywhere": revokes every refresh token, so every session cookie for this person,
 * in every product, fails its revocation check from now on.
 */
export async function revokeAllSessions(product: string, user: FleetUser) {
  const auth = getAdminAuth();
  if (!auth) throw new FleetError("Authentication is not configured.", 503);
  await auth.revokeRefreshTokens(user.uid);
  await appendAccountEvent(product, user, "sessions.revoked").catch((error) => console.error("Account event failed", error));
}
