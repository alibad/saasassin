import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { resolveFleetRequest } from "@/lib/fleet/routing";

export function proxy(request: NextRequest) {
  const decision = resolveFleetRequest(
    request.headers.get("host") ?? request.nextUrl.host,
    request.nextUrl.pathname,
    process.env.FLEET_SUBDOMAINS_ENABLED === "true",
  );

  if (decision.action === "redirect") {
    return NextResponse.redirect(decision.url, 308);
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
  ],
};
