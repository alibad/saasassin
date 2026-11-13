import { deletePhoto, fleetAccountContext, putPhoto } from "@/lib/fleet/platform/account-routes";
import { assertSameOrigin, fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ product: string }> };

/** Uploads a cropped, resized profile photo as the raw request body (PNG, JPEG or WebP, <= 256 KB). */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    return await putPhoto(await fleetAccountContext(product), request);
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Removes the photo; initials are shown instead. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    return await deletePhoto(await fleetAccountContext(product));
  } catch (error) {
    return fleetApiError(error);
  }
}
