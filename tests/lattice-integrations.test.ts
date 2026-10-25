import { describe, expect, it } from "vitest";

import {
  generateApiKey,
  hashesMatch,
  hashSecret,
  parseApiKey,
  signWebhookPayload,
  validateWebhookUrl,
  verifyWebhookSignature,
} from "../src/lib/lattice/integrations";

describe("API keys", () => {
  it("issues a key that parses back to its workspace and stores only a hash", () => {
    const key = generateApiKey("org123", "key456");
    expect(key.plaintext.startsWith("sk_perf.org123.key456.")).toBe(true);
    expect(key.hash).toBe(hashSecret(key.plaintext));
    expect(key.hash).not.toContain(key.plaintext.split(".")[3]);
    expect(key.preview).not.toContain(key.plaintext.split(".")[3]);
    expect(parseApiKey(`Bearer ${key.plaintext}`)).toEqual({ token: key.plaintext, organizationId: "org123", keyId: "key456" });
    expect(generateApiKey("org123", "key456").plaintext).not.toBe(key.plaintext);
  });

  it("rejects malformed authorization headers", () => {
    expect(parseApiKey(null)).toBeNull();
    expect(parseApiKey("Basic abc")).toBeNull();
    expect(parseApiKey("Bearer sk_live.org.key.secret")).toBeNull();
    expect(parseApiKey("Bearer sk_perf.org.key")).toBeNull();
    expect(parseApiKey("Bearer sk_perf.org.key.secret.extra")).toBeNull();
  });

  it("compares hashes in constant time and fails closed on bad input", () => {
    const hash = hashSecret("a");
    expect(hashesMatch(hash, hashSecret("a"))).toBe(true);
    expect(hashesMatch(hash, hashSecret("b"))).toBe(false);
    expect(hashesMatch(hash, "")).toBe(false);
  });
});

describe("webhooks", () => {
  it("signs and verifies payloads with a timestamp tolerance", () => {
    const body = JSON.stringify({ event: "webhook.test" });
    const header = signWebhookPayload("whsec_test", body, 1_800_000_000);
    expect(header).toMatch(/^t=1800000000,v1=[a-f0-9]{64}$/);
    expect(verifyWebhookSignature({ secret: "whsec_test", body, header, now: 1_800_000_100 })).toBe(true);
    expect(verifyWebhookSignature({ secret: "whsec_other", body, header, now: 1_800_000_100 })).toBe(false);
    expect(verifyWebhookSignature({ secret: "whsec_test", body: `${body} `, header, now: 1_800_000_100 })).toBe(false);
    expect(verifyWebhookSignature({ secret: "whsec_test", body, header, now: 1_800_000_000 + 301 })).toBe(false);
  });

  it("only allows public HTTPS endpoints", () => {
    expect(validateWebhookUrl("https://hooks.example.com/performance")).toBeNull();
    expect(validateWebhookUrl("http://hooks.example.com")).toMatch(/HTTPS/);
    for (const blocked of ["https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://172.20.0.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://db.internal/x"]) {
      expect(validateWebhookUrl(blocked)).toMatch(/public host/);
    }
    expect(validateWebhookUrl("not a url")).toMatch(/valid URL/);
  });
});
