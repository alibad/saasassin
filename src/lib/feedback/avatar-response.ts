import "server-only";

/** Serves photo bytes already checked by the profile layer (magic bytes, size). */
export function avatarResponse(avatar: { bytes: Uint8Array; contentType: string } | null, visibility: "private" | "public") {
  if (!avatar) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(Buffer.from(avatar.bytes), {
    status: 200,
    headers: {
      "Content-Type": avatar.contentType,
      "Content-Length": String(avatar.bytes.byteLength),
      // The URL carries ?v=<version>, so a changed photo always gets a new URL.
      "Cache-Control": `${visibility}, max-age=31536000, immutable`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
