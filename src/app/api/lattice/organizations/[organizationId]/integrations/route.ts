import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";
import { API_SCOPES, WEBHOOK_EVENTS } from "@/lib/lattice/integrations";
import {
  createApiKey,
  createWebhook,
  revokeApiKey,
  setWebhookActive,
  testWebhook,
} from "@/lib/lattice/integrations-data";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_api_key"),
    name: z.string().trim().min(2, "Name the key.").max(80),
    scopes: z.array(z.enum(API_SCOPES)).min(1, "Choose at least one scope."),
  }),
  z.object({ action: z.literal("revoke_api_key"), keyId: z.string().min(1) }),
  z.object({
    action: z.literal("create_webhook"),
    url: z.string().trim().url("Enter a valid URL.").max(500),
    events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event."),
  }),
  z.object({ action: z.literal("set_webhook_active"), webhookId: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("test_webhook"), webhookId: z.string().min(1) }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = actionSchema.parse(await request.json());
    const scope = { actor, organizationId };
    switch (input.action) {
      case "create_api_key":
        return Response.json(await createApiKey({ ...scope, name: input.name, scopes: input.scopes }), { status: 201, headers: { "Cache-Control": "no-store" } });
      case "revoke_api_key":
        await revokeApiKey({ ...scope, keyId: input.keyId });
        return Response.json({ ok: true });
      case "create_webhook":
        return Response.json(await createWebhook({ ...scope, url: input.url, events: input.events }), { status: 201, headers: { "Cache-Control": "no-store" } });
      case "set_webhook_active":
        await setWebhookActive({ ...scope, webhookId: input.webhookId, active: input.active });
        return Response.json({ ok: true });
      case "test_webhook":
        return Response.json(await testWebhook({ ...scope, webhookId: input.webhookId }));
    }
  } catch (error) {
    return latticeApiError(error);
  }
}
