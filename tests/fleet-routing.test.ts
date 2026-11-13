import { describe, expect, it } from "vitest";

import { fleetApps } from "../src/lib/fleet/apps";
import { resolveFleetRequest, resolveStandaloneRequest } from "../src/lib/fleet/routing";

describe("fleet host routing", () => {
  it("rewrites every capability root to its internal app route", () => {
    expect(resolveFleetRequest("research.saasassin.net", "/")).toEqual({
      action: "rewrite",
      pathname: "/apps/research",
    });
    expect(resolveFleetRequest("performance.saasassin.net", "/")).toEqual({
      action: "rewrite",
      pathname: "/lattice",
    });
  });

  it("rewrites product subpaths and serves internal in-app links on product hosts", () => {
    expect(resolveFleetRequest("research.saasassin.net", "/sign-in")).toEqual({
      action: "rewrite",
      pathname: "/apps/research/sign-in",
    });
    expect(resolveFleetRequest("planner.saasassin.net", "/apps/planner/tasks")).toEqual({ action: "next" });
    expect(resolveFleetRequest("research.saasassin.net", "/targets/dovetail")).toEqual({ action: "next" });
    expect(resolveFleetRequest("saasassin.net", "/apps/mail/inbox", true)).toEqual({
      action: "redirect",
      url: "https://mail.saasassin.net/inbox",
    });
  });

  it("keeps the Performance sign-in URL product-native", () => {
    expect(resolveFleetRequest("performance.saasassin.net", "/sign-in")).toEqual({
      action: "rewrite",
      pathname: "/lattice/sign-in",
    });
    expect(resolveFleetRequest("performance.saasassin.net", "/lattice/sign-in")).toEqual({
      action: "redirect",
      url: "https://performance.saasassin.net/sign-in",
    });
  });

  it("canonicalizes legacy apex app routes without affecting local development", () => {
    expect(resolveFleetRequest("saasassin.net", "/apps/mail", true)).toEqual({
      action: "redirect",
      url: "https://mail.saasassin.net/",
    });
    expect(resolveFleetRequest("localhost:3000", "/apps/mail")).toEqual({ action: "next" });
  });

  it("keeps legacy routes live until DNS cutover is enabled", () => {
    expect(resolveFleetRequest("saasassin.net", "/lattice")).toEqual({ action: "next" });
    expect(resolveFleetRequest("saasassin.net", "/apps/research")).toEqual({ action: "next" });
  });

  it("does not claim unknown hosts or paths", () => {
    expect(resolveFleetRequest("preview.vercel.app", "/apps/research")).toEqual({ action: "next" });
    expect(resolveFleetRequest("saasassin.net", "/catalog")).toEqual({ action: "next" });
  });
});

describe("standalone single-product routing", () => {
  const hosts = ["localhost:3000", "research.example.com", "planner.saasassin.net", "saasassin.net", null];

  it("serves a fleet product at the root of every host", () => {
    for (const host of hosts) {
      expect(resolveFleetRequest(host, "/", true, "research")).toEqual({ action: "rewrite", pathname: "/apps/research" });
      expect(resolveFleetRequest(host, "/sign-in", true, "research")).toEqual({
        action: "rewrite",
        pathname: "/apps/research/sign-in",
      });
      expect(resolveFleetRequest(host, "/reports/t/p/r", true, "research")).toEqual({
        action: "rewrite",
        pathname: "/apps/research/reports/t/p/r",
      });
    }
  });

  it("keeps in-app /apps/{slug} links working without redirecting to saasassin.net", () => {
    expect(resolveFleetRequest("research.saasassin.net", "/apps/research", true, "research")).toEqual({ action: "next" });
    expect(resolveFleetRequest("saasassin.net", "/apps/research/sign-in", true, "research")).toEqual({ action: "next" });
    expect(resolveStandaloneRequest("feedback", "/apps/feedback/b/t/board")).toEqual({ action: "next" });
  });

  it("does not serve parent-site routes or other products", () => {
    expect(resolveStandaloneRequest("research", "/targets/dovetail")).toEqual({
      action: "rewrite",
      pathname: "/apps/research/targets/dovetail",
    });
    expect(resolveStandaloneRequest("research", "/apps/planner")).toEqual({
      action: "rewrite",
      pathname: "/apps/research/apps/planner",
    });
    expect(resolveStandaloneRequest("research", "/apps/researcher")).toEqual({
      action: "rewrite",
      pathname: "/apps/research/apps/researcher",
    });
  });

  it("serves Performance from its /lattice workspace", () => {
    for (const host of hosts) {
      expect(resolveFleetRequest(host, "/", true, "performance")).toEqual({ action: "rewrite", pathname: "/lattice" });
      expect(resolveFleetRequest(host, "/sign-in", true, "performance")).toEqual({
        action: "rewrite",
        pathname: "/lattice/sign-in",
      });
      expect(resolveFleetRequest(host, "/lattice", true, "performance")).toEqual({ action: "next" });
      expect(resolveFleetRequest(host, "/lattice/sign-in", true, "performance")).toEqual({ action: "next" });
    }
  });

  it("covers every product in the registry", () => {
    for (const app of fleetApps) {
      const root = app.slug === "performance" ? "/lattice" : `/apps/${app.slug}`;
      expect(resolveStandaloneRequest(app.slug, "/")).toEqual({ action: "rewrite", pathname: root });
      expect(resolveStandaloneRequest(app.slug, `${root}/sign-in`)).toEqual({ action: "next" });
    }
  });

  it("leaves monorepo routing unchanged when unset or unknown", () => {
    for (const standalone of [undefined, null, "", "not-a-product"]) {
      expect(resolveFleetRequest("research.saasassin.net", "/", false, standalone)).toEqual({
        action: "rewrite",
        pathname: "/apps/research",
      });
      expect(resolveFleetRequest("saasassin.net", "/apps/mail", true, standalone)).toEqual({
        action: "redirect",
        url: "https://mail.saasassin.net/",
      });
      expect(resolveFleetRequest("localhost:3000", "/", false, standalone)).toEqual({ action: "next" });
    }
    expect(resolveStandaloneRequest("not-a-product", "/")).toBeNull();
  });
});
