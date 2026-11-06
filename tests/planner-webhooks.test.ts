import { describe, expect, it } from "vitest";

import { classifyDelivery, isPrivateAddress, signatureHeader, validateWebhookUrl, verifySignature } from "../src/lib/planner/webhooks";

describe("planner webhooks", () => {
  it("signs and verifies HMAC-SHA256 with replay tolerance", () => {
    const body = JSON.stringify({ type: "plan.applied" });
    const header = signatureHeader("whsec_test", 1_800_000_000, body);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", header, body, 1_800_000_100)).toBe(true);
    expect(verifySignature("whsec_other", header, body, 1_800_000_100)).toBe(false);
    expect(verifySignature("whsec_test", header, `${body} `, 1_800_000_100)).toBe(false);
    expect(verifySignature("whsec_test", header, body, 1_800_001_000)).toBe(false);
    expect(verifySignature("whsec_test", "garbage", body, 1_800_000_000)).toBe(false);
  });

  it("accepts only public HTTPS endpoints", () => {
    expect(validateWebhookUrl("https://hooks.example.com/planner")).toEqual({ ok: true, url: "https://hooks.example.com/planner" });
    for (const bad of [
      "http://hooks.example.com", "https://localhost/x", "https://api.localhost", "https://10.0.0.1/", "https://192.168.1.4",
      "https://172.20.0.1", "https://169.254.169.254/latest", "https://[::1]/", "https://user:pw@example.com", "https://example.com:8443/",
      "https://metadata.google.internal/", "not a url",
    ]) {
      expect(validateWebhookUrl(bad).ok, bad).toBe(false);
    }
  });

  it("recognises private addresses after DNS resolution", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "172.32.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("classifies deliveries honestly", () => {
    expect(classifyDelivery({ httpStatus: 204 })).toEqual({ status: "delivered", httpStatus: 204 });
    expect(classifyDelivery({ httpStatus: 302 })).toMatchObject({ status: "failed", httpStatus: 302 });
    expect(classifyDelivery({ httpStatus: 500 })).toEqual({ status: "failed", httpStatus: 500, error: "Endpoint responded 500." });
    expect(classifyDelivery({ error: "timeout" })).toEqual({ status: "failed", httpStatus: null, error: "timeout" });
  });
});
