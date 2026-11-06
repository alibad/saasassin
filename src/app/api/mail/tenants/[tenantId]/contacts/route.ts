import { fleetApiError } from "@/lib/fleet/platform/http";
import { listContacts } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

/** The address book derived from imported mail, plus frequent correspondents. */
export async function GET(_request: Request, { params }: Context) {
  try {
    return Response.json(await listContacts(await mailContext(params)));
  } catch (error) {
    return fleetApiError(error);
  }
}
