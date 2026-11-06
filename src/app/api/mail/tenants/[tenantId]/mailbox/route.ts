import { fleetApiError } from "@/lib/fleet/platform/http";
import { loadMailbox } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return Response.json(await loadMailbox(await mailContext(params)));
  } catch (error) {
    return fleetApiError(error);
  }
}
