"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Revenue's in-app navigation lives in the query string (`?view=deals`, `?deal=…`,
 * `?call=…&at=…`), so every screen has a link you can share and the back button works. It uses
 * the native History API, which Next.js syncs with useSearchParams without a server round trip
 * (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md).
 */

export const VIEWS = ["home", "deals", "calls", "accounts", "forecast", "coaching", "insights", "log", "team", "settings"] as const;
export type View = (typeof VIEWS)[number];

export type Route =
  | { view: Exclude<View, "settings" | "log" | "calls">; deal?: undefined; call?: undefined }
  | { view: "calls"; q?: string }
  | { view: "settings"; tab?: string }
  | { view: "log"; deal?: string }
  | { view: "deal"; deal: string }
  | { view: "call"; call: string; at?: number | null };

export function parseRoute(params: URLSearchParams): Route {
  const call = params.get("call");
  if (call) {
    const at = params.get("at");
    return { view: "call", call, at: at !== null && at !== "" && Number.isFinite(Number(at)) ? Number(at) : null };
  }
  const view = params.get("view") as View | null;
  if (view === "log") return { view: "log", deal: params.get("deal") ?? undefined };
  const deal = params.get("deal");
  if (deal) return { view: "deal", deal };
  if (view === "settings") return { view: "settings", tab: params.get("tab") ?? undefined };
  if (view === "calls") return { view: "calls", q: params.get("q") ?? undefined };
  if (view && (VIEWS as readonly string[]).includes(view)) return { view } as Route;
  return { view: "home" };
}

export function routeQuery(route: Route) {
  const params = new URLSearchParams();
  switch (route.view) {
    case "home":
      break;
    case "deal":
      params.set("deal", route.deal);
      break;
    case "call":
      params.set("call", route.call);
      if (route.at !== null && route.at !== undefined) params.set("at", String(Math.round(route.at * 10) / 10));
      break;
    case "settings":
      params.set("view", "settings");
      if (route.tab) params.set("tab", route.tab);
      break;
    case "log":
      params.set("view", "log");
      if (route.deal) params.set("deal", route.deal);
      break;
    case "calls":
      params.set("view", "calls");
      if (route.q) params.set("q", route.q);
      break;
    default:
      params.set("view", route.view);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The section of the sidebar a route belongs to. */
export function navSection(route: Route): View {
  if (route.view === "deal") return "deals";
  if (route.view === "call") return "calls";
  return route.view;
}

export function useRevenueRoute() {
  const params = useSearchParams();
  const route = useMemo(() => parseRoute(new URLSearchParams(params.toString())), [params]);
  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const url = `${window.location.pathname}${routeQuery(next)}`;
    if (options.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    if (next.view !== "call") window.scrollTo({ top: 0 });
  }, []);
  return { route, navigate, params };
}

export type Navigate = ReturnType<typeof useRevenueRoute>["navigate"];
