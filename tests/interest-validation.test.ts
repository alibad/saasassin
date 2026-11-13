import { describe, expect, it } from "vitest";

import { validateInterestPayload } from "../src/lib/interest-validation";

const base = {
  name: "Ana Example",
  email: "Ana@Example.com ",
  role: "Adopter",
  target: "lattice",
  consent: true,
  source: "compare-lattice",
};

describe("validateInterestPayload", () => {
  it("accepts a compare-page submission and keeps its source", () => {
    const result = validateInterestPayload(base);
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.interest.email).toBe("ana@example.com");
    expect(result.interest.source).toBe("compare-lattice");
    expect(result.interest.target).toBe("lattice");
  });

  it("accepts the reserved general target from the contact page", () => {
    const result = validateInterestPayload({ ...base, target: "general", source: "saasassin-contact" });
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.interest.source).toBe("saasassin-contact");
  });

  it("rejects targets that are neither a catalog slug nor general", () => {
    expect(validateInterestPayload({ ...base, target: "contact" }).status).toBe("invalid");
    expect(validateInterestPayload({ ...base, target: "" }).status).toBe("invalid");
  });

  it("rejects unknown roles, bad emails, short names and missing consent", () => {
    expect(validateInterestPayload({ ...base, role: "Admin" }).status).toBe("invalid");
    expect(validateInterestPayload({ ...base, email: "not-an-email" }).status).toBe("invalid");
    expect(validateInterestPayload({ ...base, name: "A" }).status).toBe("invalid");
    expect(validateInterestPayload({ ...base, consent: "true" }).status).toBe("invalid");
  });

  it("files unknown sources under the default catalog source", () => {
    const result = validateInterestPayload({ ...base, source: "compare-nobody" });
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.interest.source).toBe("saasassin-catalog");
  });

  it("still accepts the original mission roles and sources", () => {
    const result = validateInterestPayload({ ...base, role: "Builder", target: "canny", source: "canny-fider-mission" });
    expect(result.status).toBe("valid");
  });

  it("short-circuits the honeypot before validating anything else", () => {
    expect(validateInterestPayload({ website: "spam.example" }).status).toBe("honeypot");
  });

  it("trims and caps free text", () => {
    const result = validateInterestPayload({ ...base, note: `  ${"x".repeat(600)}  ` });
    expect(result.status).toBe("valid");
    if (result.status !== "valid") return;
    expect(result.interest.note).toHaveLength(500);
  });
});
