/** WCAG 2.x contrast helpers for brand tokens (hex colours only). */

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? [...value].map((char) => char + char).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as [number, number, number];
}

export function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Token pairs that carry text or meaningful UI, with the minimum ratio each needs: 4.5 for body
 * text (WCAG AA), 3 for focus rings and large display text.
 */
export const BRAND_CONTRAST_PAIRS: { foreground: string; background: string; min: number }[] = [
  { foreground: "foreground", background: "background", min: 4.5 },
  { foreground: "card-foreground", background: "card", min: 4.5 },
  { foreground: "popover-foreground", background: "popover", min: 4.5 },
  { foreground: "primary-foreground", background: "primary", min: 4.5 },
  { foreground: "primary", background: "background", min: 4.5 },
  { foreground: "primary", background: "card", min: 4.5 },
  { foreground: "secondary-foreground", background: "secondary", min: 4.5 },
  { foreground: "muted-foreground", background: "background", min: 4.5 },
  { foreground: "muted-foreground", background: "card", min: 4.5 },
  { foreground: "muted-foreground", background: "ui-muted", min: 4.5 },
  { foreground: "accent-foreground", background: "accent", min: 4.5 },
  { foreground: "destructive", background: "background", min: 4.5 },
  { foreground: "ring", background: "background", min: 3 },
  { foreground: "sidebar-foreground", background: "sidebar", min: 4.5 },
  { foreground: "sidebar-primary-foreground", background: "sidebar-primary", min: 4.5 },
  { foreground: "sidebar-accent-foreground", background: "sidebar-accent", min: 4.5 },
  { foreground: "brand-accent-foreground", background: "brand-accent", min: 4.5 },
  { foreground: "brand-ink-foreground", background: "brand-ink", min: 4.5 },
  { foreground: "foreground", background: "brand-subtle", min: 4.5 },
];

/** Reads `--name: #hex;` declarations from one CSS block body. */
export function readTokens(block: string) {
  const tokens: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) tokens[match[1]] = match[2];
  return tokens;
}
