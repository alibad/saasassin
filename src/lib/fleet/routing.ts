import { getFleetAppBySubdomain, getFleetAppUrl, getFleetApp } from "./apps";

export type FleetRoutingDecision =
  | { action: "next" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; url: string };

const canonicalHosts = new Set(["saasassin.net", "www.saasassin.net"]);

/** Parent-site routes that stay reachable from every product host (research briefs, catalog). */
const sharedSiteRoutes = new Set(["apps", "catalog", "missions", "ops", "roadmap", "targets"]);

export function normalizeHostname(host: string | null) {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

export function resolveFleetRequest(
  host: string | null,
  pathname: string,
  redirectLegacyRoutes = false,
): FleetRoutingDecision {
  const hostname = normalizeHostname(host);
  const subdomain = hostname.endsWith(".saasassin.net")
    ? hostname.slice(0, -".saasassin.net".length)
    : "";
  const app = getFleetAppBySubdomain(subdomain);

  if (app?.slug === "performance") {
    if (pathname === "/") return { action: "rewrite", pathname: "/lattice" };
    if (pathname === "/sign-in") return { action: "rewrite", pathname: "/lattice/sign-in" };
    if (pathname === "/lattice") return { action: "redirect", url: `${getFleetAppUrl(app)}/` };
    if (pathname === "/lattice/sign-in") return { action: "redirect", url: `${getFleetAppUrl(app)}/sign-in` };
    return { action: "next" };
  }

  if (app) {
    const appRoot = `/apps/${app.slug}`;
    if (pathname === "/") return { action: "rewrite", pathname: appRoot };
    if (pathname === appRoot) return { action: "redirect", url: `${getFleetAppUrl(app)}/` };
    // In-app links use the internal /apps/{slug}/... form so they work on every host.
    if (pathname.startsWith(`${appRoot}/`)) return { action: "next" };
    if (sharedSiteRoutes.has(pathname.split("/")[1] ?? "")) return { action: "next" };
    return { action: "rewrite", pathname: `${appRoot}${pathname}` };
  }

  if (!redirectLegacyRoutes || !canonicalHosts.has(hostname)) return { action: "next" };

  if (pathname === "/lattice") {
    const performance = getFleetApp("performance");
    return performance ? { action: "redirect", url: `${getFleetAppUrl(performance)}/` } : { action: "next" };
  }

  if (pathname === "/lattice/sign-in") {
    const performance = getFleetApp("performance");
    return performance ? { action: "redirect", url: `${getFleetAppUrl(performance)}/sign-in` } : { action: "next" };
  }

  const appRoute = pathname.match(/^\/apps\/([^/]+)(\/.*)?$/);
  const routedApp = appRoute ? getFleetApp(appRoute[1]) : null;
  return routedApp
    ? { action: "redirect", url: `${getFleetAppUrl(routedApp)}${appRoute?.[2] ?? "/"}` }
    : { action: "next" };
}
