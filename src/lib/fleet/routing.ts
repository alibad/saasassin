import { getFleetAppBySubdomain, getFleetAppUrl, getFleetApp, getFleetFallbackPath } from "./apps";

export type FleetRoutingDecision =
  | { action: "next" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; url: string };

const canonicalHosts = new Set(["saasassin.net", "www.saasassin.net"]);

/** Parent-site routes that stay reachable from every product host (research briefs, catalog). */
const sharedSiteRoutes = new Set(["apps", "catalog", "compare", "contact", "missions", "ops", "roadmap", "targets"]);

export function normalizeHostname(host: string | null) {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * Standalone mode (`STANDALONE_PRODUCT=<slug>`): a generated single-product repository serves only
 * that product, at the root of every host. `/` and every other path rewrite into the product's
 * in-app root (`/apps/{slug}`, or `/lattice` for Performance); in-app links keep working as-is.
 * Returns null when the slug is not a fleet product, so the caller falls back to host routing.
 */
export function resolveStandaloneRequest(product: string, pathname: string): FleetRoutingDecision | null {
  const app = getFleetApp(product);
  if (!app) return null;

  const appRoot = getFleetFallbackPath(app);
  if (pathname === appRoot || pathname.startsWith(`${appRoot}/`)) return { action: "next" };
  if (pathname === "/") return { action: "rewrite", pathname: appRoot };
  return { action: "rewrite", pathname: `${appRoot}${pathname}` };
}

/**
 * The public path of an in-app page for links people copy (invitation links). On the product's
 * own host, or in a standalone product repository, it is the short form ("/invite/x"); anywhere
 * else (localhost, previews, saasassin.net) it is the internal "/apps/{slug}/invite/x" form,
 * which every host serves.
 */
export function productPublicPath(
  host: string | null,
  slug: string,
  path: string,
  standaloneProduct?: string | null,
) {
  const app = getFleetApp(slug);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (!app) return suffix;
  if (standaloneProduct === app.slug) return suffix;
  const hostname = normalizeHostname(host);
  if (hostname === `${app.subdomain}.saasassin.net`) return suffix;
  return `${getFleetFallbackPath(app)}${suffix}`;
}

export function resolveFleetRequest(
  host: string | null,
  pathname: string,
  redirectLegacyRoutes = false,
  standaloneProduct?: string | null,
): FleetRoutingDecision {
  if (standaloneProduct) {
    const standalone = resolveStandaloneRequest(standaloneProduct, pathname);
    if (standalone) return standalone;
  }

  const hostname = normalizeHostname(host);
  const subdomain = hostname.endsWith(".saasassin.net")
    ? hostname.slice(0, -".saasassin.net".length)
    : "";
  const app = getFleetAppBySubdomain(subdomain);

  if (app?.slug === "performance") {
    if (pathname === "/") return { action: "rewrite", pathname: "/lattice" };
    if (pathname === "/sign-in") return { action: "rewrite", pathname: "/lattice/sign-in" };
    if (pathname === "/account") return { action: "rewrite", pathname: "/lattice/account" };
    if (pathname === "/lattice") return { action: "redirect", url: `${getFleetAppUrl(app)}/` };
    if (pathname === "/lattice/sign-in") return { action: "redirect", url: `${getFleetAppUrl(app)}/sign-in` };
    if (pathname === "/lattice/account") return { action: "redirect", url: `${getFleetAppUrl(app)}/account` };
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
