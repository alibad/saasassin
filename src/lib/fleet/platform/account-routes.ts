import "server-only";

import { NextResponse } from "next/server";

import { MAX_AVATAR_BYTES } from "@/lib/fleet/account/identity";
import { profileUpdateSchema } from "@/lib/fleet/account/schemas";

import { loadAccount } from "./account";
import { readJson } from "./http";
import {
  readAvatar,
  removeAccountPhoto,
  revokeAllSessions,
  setUploadedPhoto,
  sharesActiveTenant,
  updateAccountProfile,
  type AvatarVisibility,
} from "./profiles";
import {
  assertFleetProduct,
  fleetSessionCookie,
  FleetError,
  requireFleetUser,
  sessionCookieOptions,
  type FleetUser,
} from "./session";

/**
 * Shared handlers behind /api/fleet/{product}/me, /me/photo, /me/sessions and /avatars/{uid}.
 * The fleet products and Performance differ only in how the signed-in person is resolved,
 * which cookie holds the session, and who may see whose photo; that is the AccountContext.
 */
export type AccountContext = {
  product: string;
  user: FleetUser;
  /** Whether this product uses the shared fleet workspaces (Performance has its own). */
  workspaces: boolean;
  canViewAvatar: AvatarVisibility;
  sessionCookie: string;
};

export async function fleetAccountContext(product: string): Promise<AccountContext> {
  assertFleetProduct(product);
  const user = await requireFleetUser(product);
  return {
    product,
    user,
    workspaces: true,
    canViewAvatar: (viewerUid, subjectUid) => sharesActiveTenant(product, viewerUid, subjectUid),
    sessionCookie: fleetSessionCookie(product),
  };
}

export async function getMe(context: AccountContext) {
  return Response.json(await loadAccount(context.product, context.user, { workspaces: context.workspaces }));
}

export async function patchMe(context: AccountContext, request: Request) {
  const input = profileUpdateSchema.parse(await readJson(request));
  return Response.json({ profile: await updateAccountProfile(context.product, context.user, input) });
}

/** Reads at most `limit` bytes; anything longer is refused without buffering the rest. */
async function readLimitedBody(request: Request, limit: number) {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    throw new FleetError("That image is too large. Photos must be 256 KB or smaller.", 413);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new FleetError("That image is too large. Photos must be 256 KB or smaller.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function putPhoto(context: AccountContext, request: Request) {
  const bytes = await readLimitedBody(request, MAX_AVATAR_BYTES);
  return Response.json({ profile: await setUploadedPhoto(context.product, context.user, bytes) });
}

export async function deletePhoto(context: AccountContext) {
  return Response.json({ profile: await removeAccountPhoto(context.product, context.user) });
}

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });

/** Uploaded photo bytes for the subject or someone they share a workspace with; 404 for everyone else. */
export async function getAvatar(context: AccountContext, subjectUid: string) {
  if (!subjectUid || subjectUid.length > 128) return notFound();
  const avatar = await readAvatar(context.product, context.user, subjectUid, context.canViewAvatar);
  if (!avatar) return notFound();
  return new Response(Buffer.from(avatar.bytes), {
    status: 200,
    headers: {
      "Content-Type": avatar.contentType,
      "Content-Length": String(avatar.bytes.byteLength),
      // The URL carries ?v=<version>, so a changed photo always gets a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}

/** Revokes every session for this person (all products, all devices) and clears this cookie. */
export async function signOutEverywhere(context: AccountContext) {
  await revokeAllSessions(context.product, context.user);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(context.sessionCookie, "", sessionCookieOptions(0));
  return response;
}
