import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BRAND_CONTRAST_PAIRS, contrastRatio, readTokens } from "../src/lib/brand/contrast";
import { brands, brandSlugs } from "../src/lib/brand/registry";
import { fleetApps } from "../src/lib/fleet/apps";

const root = path.resolve(__dirname, "..");

/** Every token a component may rely on, in light and dark. */
const REQUIRED_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "ui-muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground", "sidebar-accent",
  "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
  "brand-accent", "brand-accent-foreground", "brand-subtle", "brand-ink", "brand-ink-foreground",
  "mark-1", "mark-2", "mark-3",
];

function themeBlocks(slug: string) {
  const css = fs.readFileSync(path.join(root, "src/brands", slug, "theme.css"), "utf8");
  const light = css.match(new RegExp(`\\[data-brand="${slug}"\\] \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  const dark = css.match(new RegExp(`\\[data-brand="${slug}"\\]\\[data-mode="dark"\\],\\s*\\[data-brand="${slug}"\\] \\.dark \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
  return { css, light: readTokens(light), dark: readTokens(dark) };
}

function routeDir(slug: string) {
  return path.join(root, slug === "performance" ? "src/app/lattice" : `src/app/apps/${slug}`);
}

describe("product brands", () => {
  it("covers every fleet product exactly once", () => {
    expect([...brandSlugs].sort()).toEqual(fleetApps.map((app) => app.slug).sort());
    for (const slug of brandSlugs) expect(brands[slug].slug).toBe(slug);
  });

  for (const slug of brandSlugs) {
    describe(slug, () => {
      const { css, light, dark } = themeBlocks(slug);

      it("defines the full token set for light and dark", () => {
        for (const token of REQUIRED_TOKENS) {
          expect(light[token], `light --${token}`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(dark[token], `dark --${token}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(css).toMatch(/--radius: [\d.]+rem;/);
      });

      for (const mode of ["light", "dark"] as const) {
        it(`meets WCAG AA contrast in ${mode} mode`, () => {
          const tokens = mode === "light" ? light : dark;
          for (const pair of BRAND_CONTRAST_PAIRS) {
            const ratio = contrastRatio(tokens[pair.foreground], tokens[pair.background]);
            expect(ratio, `${pair.foreground} on ${pair.background} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(pair.min);
          }
        });
      }

      it("keeps brand.ts in step with theme.css", () => {
        const brand = brands[slug];
        expect(brand.colors.primary.toLowerCase()).toBe(light.primary.toLowerCase());
        expect(brand.colors.canvas.toLowerCase()).toBe(light.background.toLowerCase());
        expect(brand.colors.canvasDark.toLowerCase()).toBe(dark.background.toLowerCase());
        expect(brand.colors.mark.map((c) => c.toLowerCase())).toEqual([light["mark-1"], light["mark-2"], light["mark-3"]].map((c) => c.toLowerCase()));
        expect(brand.colors.markDark.map((c) => c.toLowerCase())).toEqual([dark["mark-1"], dark["mark-2"], dark["mark-3"]].map((c) => c.toLowerCase()));
      });

      it("ships its own icon, apple icon and social card, and no SaaSassin title", () => {
        const dir = routeDir(slug);
        for (const file of ["icon.svg", "apple-icon.png", "opengraph-image.png", "opengraph-image.alt.txt", "layout.tsx"]) {
          expect(fs.existsSync(path.join(dir, file)), file).toBe(true);
        }
        const layout = fs.readFileSync(path.join(dir, "layout.tsx"), "utf8");
        expect(layout).toContain(`@/brands/${slug}/theme.css`);
        expect(layout).toContain(`@/brands/${slug}/fonts`);
        const page = fs.readFileSync(path.join(dir, "page.tsx"), "utf8");
        expect(page).not.toMatch(/SaaSassin \$\{|title: `SaaSassin/);
        expect(page).not.toContain("FleetAppShell");
      });
    });
  }
});
