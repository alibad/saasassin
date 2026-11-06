import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES, splitSchema } from "@/lib/mail/schema";
import { createSplit } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json({ split: await createSplit(context, splitSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
