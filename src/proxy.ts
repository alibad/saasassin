import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveFleetRequest } from "@/lib/fleet/routing";

export function proxy(request: NextRequest) {
  const decision = resolveFleetRequest(
    request.headers.get("host") ?? request.nextUrl.host,
    request.nextUrl.pathname,
    process.env.FLEET_SUBDOMAINS_ENABLED === "true",
    // Set in generated single-product repositories: every host serves only that product.
    process.env.STANDALONE_PRODUCT,
  );

  if (decision.action === "redirect") {
    // Keep the query string (e.g. /lattice?view=people → /?view=people on the product host).
    const target = new URL(decision.url);
    if (!target.search && request.nextUrl.search) target.search = request.nextUrl.search;
    return NextResponse.redirect(target, 308);
  }

  if (decision.action === "rewrite") {
    const destination = request.nextUrl.clone();
    destination.pathname = decision.pathname;
    return NextResponse.rewrite(destination);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|opengraph-image.png|robots.txt|sitemap.xml|manifest.webmanifest|brand/|.*\\..*).*)",
    // Invitation links ("/invite/<id>.<secret>") contain a dot, which the pattern above skips
    // as a static file, so match them explicitly to rewrite them on product hosts.
    "/invite/:token",
  ],
};
