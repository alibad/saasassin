import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseParityMarkdown, type ParitySummary } from "./parity";

const PARITY_PATH = /^docs\/competitors\/([a-z0-9-]+)\/([a-z0-9-]+\.md)$/;

/**
 * Reads a parity matrix from the repository at build time (the compare pages are
 * statically generated). Any problem — no path, a missing file, a renamed table — returns
 * null so the page hides the parity section instead of failing the build.
 */
export function loadParitySummary(repoRelativePath: string | undefined): ParitySummary | null {
  const match = repoRelativePath?.match(PARITY_PATH);
  if (!match) return null;

  try {
    // Statically scoped to docs/competitors so file tracing stays narrow.
    const markdown = readFileSync(join(process.cwd(), "docs", "competitors", match[1], match[2]), "utf8");
    return parseParityMarkdown(markdown);
  } catch {
    return null;
  }
}
