import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { deleteWebhook, sendTestWebhook, setWebhookActive, SLUG } from "@/lib/studies/data";

type Context = { params: Promise<{ tenantId: string; webhookId: string }> };

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, webhookId } = await context.params;
    const { active } = patchSchema.parse(await request.json());
    return Response.json({ webhook: await setWebhookActive(user, tenantId, webhookId, active) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Sends a signed test delivery to this endpoint and returns the honest outcome. */
export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, webhookId } = await context.params;
    return Response.json({ delivery: await sendTestWebhook(user, tenantId, webhookId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, webhookId } = await context.params;
    await deleteWebhook(user, tenantId, webhookId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
