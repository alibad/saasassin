import { describe, expect, it, vi } from "vitest";

import { parseParityMarkdown, percentOf, splitMarkdownRow, stripInlineMarkdown } from "../src/lib/compare/parity";

vi.mock("server-only", () => ({}));

const fixture = `# Example parity matrix

| | |
|---|---|
| Verified against | Code on \`abc123\` (2026-11-13) |

## ORG — Directory and organization graph

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| EX-ORG-01 | Employee directory | Directory [H25] | **have**: People tab | — | H | — | — | no |
| EX-ORG-02 | **Edit an employee** in the UI | A reviewer wants it [T1] | **missing**: re-import only | Edit dialog | H | S | 5 | no |
| EX-ORG-03 | Org chart view | Org chart [H25] | missing | Read-only tree | M | S | 32 | yes |

## ACC — Access and permissions

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| EX-ACC-01 | Built-in roles | Admins [H13] | **have**: \`DEFAULT_ROLES\` | — | h | — | — | no |
| EX-ACC-02 | Run cycles \\| without results | A permission [H13] | **partial**: separate atoms | Rules test | H | S | 16 | yes |
| EX-ACC-03 | **Assign a role to a person** | Admins assign roles [H13] | **missing**: nothing sets \`roleId\` | Dialog | H | S | 1 | yes |
| EX-ACC-04 | Something undecided | ? | **unknown**: not triaged | — | H | — | — | no |
| EX-ACC-05 | SSO | SAML [H27] | *partial*: Google sign-in | SAML | M | M | 71 | no |

---

## Summary by module

| Module | have | partial | missing |
|---|---|---|---|
| ORG | 1 | 0 | 2 |

## Deliberate non-goals

| Lattice capability | Why Performance won't build it |
|---|---|
| Payroll | Regulated. |
`;

describe("splitMarkdownRow", () => {
  it("splits cells, trims them and keeps escaped pipes inside a cell", () => {
    expect(splitMarkdownRow("| a | b \\| c |  d  |")).toEqual(["a", "b | c", "d"]);
  });

  it("returns null for lines that are not table rows", () => {
    expect(splitMarkdownRow("Just a sentence")).toBeNull();
    expect(splitMarkdownRow("")).toBeNull();
  });

  it("keeps a final cell when the row has no closing pipe", () => {
    expect(splitMarkdownRow("| a | b")).toEqual(["a", "b"]);
  });
});

describe("stripInlineMarkdown", () => {
  it("removes bold, code and links but keeps their text", () => {
    expect(stripInlineMarkdown("**Assign** a `role` to [a person](https://example.com)")).toBe(
      "Assign a role to a person",
    );
  });
});

describe("parseParityMarkdown", () => {
  const summary = parseParityMarkdown(fixture);

  it("counts have, partial and missing across every module table", () => {
    expect(summary).not.toBeNull();
    expect(summary?.total).toBe(7);
    expect(summary?.have).toBe(2);
    expect(summary?.partial).toBe(2);
    expect(summary?.missing).toBe(3);
  });

  it("ignores rows whose status it does not recognise and tables without a status column", () => {
    expect(summary?.rows.map((row) => row.id)).not.toContain("EX-ACC-04");
    expect(summary?.rows.some((row) => row.capability === "Payroll")).toBe(false);
    expect(summary?.rows.some((row) => row.capability === "ORG")).toBe(false);
  });

  it("reads bold, italic and plain statuses, normalises value case and strips markdown", () => {
    const byId = new Map(summary?.rows.map((row) => [row.id, row]));
    expect(byId.get("EX-ORG-03")?.status).toBe("missing");
    expect(byId.get("EX-ACC-05")?.status).toBe("partial");
    expect(byId.get("EX-ACC-01")?.value).toBe("H");
    expect(byId.get("EX-ORG-02")?.capability).toBe("Edit an employee in the UI");
    expect(byId.get("EX-ACC-02")?.capability).toBe("Run cycles | without results");
    expect(byId.get("EX-ORG-01")?.rank).toBeNull();
    expect(byId.get("EX-ORG-03")?.rank).toBe(32);
  });

  it("labels rows with the module code from the nearest heading", () => {
    expect(summary?.modules).toEqual([
      { module: "ORG", have: 1, partial: 0, missing: 2 },
      { module: "ACC", have: 1, partial: 2, missing: 1 },
    ]);
  });

  it("lists high-value missing rows in build order (lowest rank first)", () => {
    expect(summary?.highValueMissing.map((row) => [row.id, row.rank])).toEqual([
      ["EX-ACC-03", 1],
      ["EX-ORG-02", 5],
    ]);
  });

  it("returns null when there is nothing to show, so the page hides the section", () => {
    expect(parseParityMarkdown("")).toBeNull();
    expect(parseParityMarkdown("# Notes\n\nNo tables here.")).toBeNull();
    // A renamed status column means the format changed: hide rather than guess.
    expect(
      parseParityMarkdown(
        "| id | capability | state | value |\n|---|---|---|---|\n| X-1 | Thing | **have** | H |",
      ),
    ).toBeNull();
    expect(parseParityMarkdown(undefined as unknown as string)).toBeNull();
  });

  it("parses the real Lattice matrix into a consistent summary", async () => {
    const { loadParitySummary } = await import("../src/lib/compare/parity-file");
    const real = loadParitySummary("docs/competitors/lattice/parity.md");

    expect(real).not.toBeNull();
    if (!real) return;
    expect(real.total).toBeGreaterThan(50);
    expect(real.have + real.partial + real.missing).toBe(real.total);
    expect(real.modules.reduce((sum, module) => sum + module.have + module.partial + module.missing, 0)).toBe(
      real.total,
    );
    expect(real.highValueMissing.every((row) => row.status === "missing" && row.value === "H")).toBe(true);
    const ranks = real.highValueMissing.map((row) => row.rank ?? Number.POSITIVE_INFINITY);
    expect([...ranks].sort((left, right) => left - right)).toEqual(ranks);
  });
});

describe("loadParitySummary", () => {
  it("returns null for a missing file or a path outside docs/competitors", async () => {
    const { loadParitySummary } = await import("../src/lib/compare/parity-file");
    expect(loadParitySummary("docs/competitors/nobody/parity.md")).toBeNull();
    expect(loadParitySummary("../../etc/passwd")).toBeNull();
    expect(loadParitySummary("docs/competitors/../../package.json")).toBeNull();
    expect(loadParitySummary(undefined)).toBeNull();
  });
});

describe("percentOf", () => {
  it("rounds to a whole percent and is safe for an empty matrix", () => {
    expect(percentOf(30, 119)).toBe(25);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(5, Number.NaN)).toBe(0);
  });
});
