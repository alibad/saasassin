import type { LucideIcon } from "lucide-react";

/** The ten products. Each slug is also the product's subdomain and repository suffix. */
export type BrandSlug =
  | "performance"
  | "research"
  | "planner"
  | "creator"
  | "feedback"
  | "studies"
  | "revenue"
  | "community"
  | "mail"
  | "trust";

export type BrandMode = "light" | "dark";

/** What the visitor picked in the theme menu. "system" follows the operating system. */
export type BrandModePreference = BrandMode | "system";

/**
 * A product's identity as plain data. The CSS tokens live in `src/brands/<slug>/theme.css`; this
 * object carries what code needs outside CSS: names for titles, hex colours for icons and Open
 * Graph images (which cannot read CSS variables), and the default mode.
 */
export type Brand = {
  slug: BrandSlug;
  /** The product name as it appears in the wordmark and titles. */
  name: string;
  /** What it does, used after the name in the page title: "Research — <descriptor>". */
  descriptor: string;
  /** One-sentence meta description. Only claims that ship today. */
  description: string;
  /** The closed tool it replaces; used only in factual switching or import copy. */
  competitor: string;
  defaultMode: BrandMode;
  /** Hex colours for places CSS variables cannot reach (icons, OG images, theme-color). */
  colors: {
    primary: string;
    primaryForeground: string;
    accent: string;
    /** Page canvas in light mode. */
    canvas: string;
    /** Page canvas in dark mode. */
    canvasDark: string;
    /** Body text on the light canvas. */
    ink: string;
    /** Mark colours, in the order the mark uses them. */
    mark: [string, string, string];
    /** The same mark colours for the dark canvas. */
    markDark: [string, string, string];
  };
  /** Display names of the typefaces, for documentation and OG image font loading. */
  fonts: { heading: string; body: string; mono?: string; headingWeight: number };
  keywords: string[];
};

export type NavLink = { label: string; href: string };

export type SiteFeature = {
  icon: LucideIcon;
  title: string;
  body: string;
  points?: string[];
};

export type SiteStep = { title: string; body: string };

export type SiteFaq = { q: string; a: string };

/** Homepage and sign-in copy for one product. Every claim must ship today. */
export type ProductSite = {
  nav: NavLink[];
  hero: {
    kicker: string;
    title: string;
    /** A phrase inside `title` the brand may emphasise (highlight stroke, colour, italic). */
    emphasis?: string;
    lede: string;
    primaryCta: string;
    secondaryCta?: NavLink;
    note?: string;
  };
  features: { kicker: string; title: string; lede?: string; items: SiteFeature[] };
  steps: { kicker: string; title: string; lede?: string; items: SiteStep[] };
  /** Only for products with an importer that exists today. */
  importer?: {
    kicker: string;
    title: string;
    body: string;
    formats: string[];
    points: string[];
  };
  ownership: { kicker: string; title: string; body: string; points: SiteFeature[] };
  faq: { kicker: string; title: string; items: SiteFaq[] };
  cta: { title: string; body: string; label: string };
  signIn: { title: string; body: string; points: string[] };
  footer: { tagline: string };
};

/**
 * Props every brand mark accepts. Without `colors` a mark paints with the brand's --mark-1..3
 * tokens, so it follows light and dark mode; Open Graph images and icons pass hex values.
 */
export type MarkProps = {
  size?: number;
  className?: string;
  /** Accessible name. Omit when the mark sits next to the product name. */
  title?: string;
  colors?: readonly [string, string, string];
};

export const MARK_TOKENS = ["var(--mark-1)", "var(--mark-2)", "var(--mark-3)"] as const;
