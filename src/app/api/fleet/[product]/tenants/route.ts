import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { createTenant, listTenantsForUser } from "@/lib/fleet/platform/tenants";

const createSchema = z.object({
  name: z.string().trim().min(2, "Name the workspace.").max(80),
});

type RouteContext = { params: Promise<{ product: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { product } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    return Response.json({ tenants: await listTenantsForUser(product, user) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { product } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    const { name } = createSchema.parse(await request.json());
    return Response.json({ tenant: await createTenant(product, user, name) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
