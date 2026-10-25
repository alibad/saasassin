import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAllMessages, mailContext } from "@/lib/mail/store";
import { searchMessages } from "@/lib/mail/workflow";

type Context = { params: Promise<{ tenantId: string }> };

/** In-memory full-text search over the tenant's imported mailbox. */
export async function GET(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 300);
    const messages = await listAllMessages(context.tenantId);
    return Response.json({ query, hits: searchMessages(messages, query), searched: messages.length });
  } catch (error) {
    return fleetApiError(error);
  }
}
