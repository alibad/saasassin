import { describe, expect, it } from "vitest";

import { classifyDelivery, secretHint, signatureHeader, signPayload, validateWebhookUrl, verifySignature } from "../src/lib/studies/webhooks";

describe("studies webhook signatures", () => {
  const body = JSON.stringify({ id: "evt_1", type: "response.completed", data: { responseId: "r1" } });

  it("signs t.body with HMAC-SHA256 and verifies within the tolerance window", () => {
    const header = signatureHeader("whsec_test", 1_700_000_000, body);
    expect(header).toBe(`t=1700000000,v1=${signPayload("whsec_test", 1_700_000_000, body)}`);
    expect(verifySignature("whsec_test", header, body, 1_700_000_100)).toBe(true);
    expect(verifySignature("whsec_test", header, body, 1_700_000_400)).toBe(false);
    expect(verifySignature("whsec_other", header, body, 1_700_000_100)).toBe(false);
    expect(verifySignature("whsec_test", header, `${body} `, 1_700_000_100)).toBe(false);
    expect(verifySignature("whsec_test", "t=abc,v1=zz", body, 1_700_000_000)).toBe(false);
  });

  it("only accepts public HTTPS endpoints", () => {
    expect(validateWebhookUrl("https://hooks.example.com/studies")).toEqual({ ok: true, url: "https://hooks.example.com/studies" });
    for (const url of [
      "http://hooks.example.com",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.1.2.3/x",
      "https://192.168.0.10/x",
      "https://172.20.0.1/x",
      "https://169.254.169.254/latest",
      "https://100.64.0.1/x",
      "https://[::1]/x",
      "https://2130706433/x",
      "https://metadata.google.internal/x",
      "https://printer.local/x",
      "https://intranet/x",
      "https://user:pass@hooks.example.com",
      "https://hooks.example.com:8443/x",
      "not a url",
    ]) {
      expect(validateWebhookUrl(url).ok, url).toBe(false);
    }
  });

  it("classifies deliveries honestly and hints secrets", () => {
    expect(classifyDelivery({ httpStatus: 204 })).toEqual({ status: "delivered", httpStatus: 204, error: null });
    expect(classifyDelivery({ httpStatus: 302 })).toMatchObject({ status: "failed", error: expect.stringMatching(/Redirects/) });
    expect(classifyDelivery({ httpStatus: 500 })).toMatchObject({ status: "failed", httpStatus: 500 });
    expect(classifyDelivery({ error: "Timed out after 5s." })).toEqual({ status: "failed", httpStatus: null, error: "Timed out after 5s." });
    expect(secretHint("whsec_abcdef1234")).toBe("whsec_…1234");
  });
});
