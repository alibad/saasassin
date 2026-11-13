import { avatarResponse } from "@/lib/feedback/avatar-response";
import { readPublicAvatar } from "@/lib/feedback/data";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string; key: string }> };

/**
 * The uploaded photo of whoever wrote a public post, comment, team response or changelog
 * entry, addressed by that item (never by account id). Hidden, internal or private items 404.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, key } = await params;
    return avatarResponse(await readPublicAvatar(tenantId, key), "public");
  } catch (error) {
    return fleetApiError(error);
  }
}
