import { describe, expect, it } from "vitest";

import { resolveFleetRequest } from "../src/lib/fleet/routing";

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
