import { fleetApiError } from "@/lib/fleet/platform/http";
import { importSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { importRawMessages, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export const maxDuration = 60;

/** Imports a batch of raw RFC 822 messages (from .eml files or a split .mbox). */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const input = importSchema.parse(await request.json());
    return Response.json({ run: await importRawMessages(context, input.fileName, input.messages) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
