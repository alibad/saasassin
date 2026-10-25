import { z } from "zod";

import { dispatchWebhooks, setWebhookActive } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; webhookId: string }> };

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, webhookId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const { active } = patchSchema.parse(await request.json());
    await setWebhookActive(tenantId, user, webhookId, active);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Sends a signed test `post.created` event to active subscribed endpoints and returns the real outcome. */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, webhookId } = await params;
    await requireTeam(tenantId, ADMIN_ROLES);
    const results = await dispatchWebhooks(
      tenantId,
      "post.created",
      { test: true, post: { id: "test", number: 0, title: "Test delivery from SaaSassin Feedback" } },
      { onlyWebhookId: webhookId },
    );
    if (!results.length) throw new FleetError("Enable the webhook and subscribe it to post.created to send a test.", 409);
    return Response.json({ result: results[0] });
  } catch (error) {
    return fleetApiError(error);
  }
}
