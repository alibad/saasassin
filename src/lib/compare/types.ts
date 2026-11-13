/**
 * Shape of one public comparison page (/compare/<slug>).
 *
 * Adding a competitor means adding one data file under `src/data/comparisons/` that
 * exports a `Comparison`, and listing it in `src/data/comparisons/index.ts`.
 * Every statement about the competitor must carry at least one dated source.
 */

/** A public page that backs a statement about the competitor. */
export type ComparisonSource = {
  /** Short id matching the research doc, e.g. "L1" or "H25". */
  id: string;
  /** What the page is, e.g. "Lattice pricing page". */
  label: string;
  url: string;
  /** ISO date (YYYY-MM-DD) the page was read. */
  accessed: string;
};

/** Who is ahead on a row. Rows where the competitor is ahead are kept on purpose. */
export type ComparisonEdge = "saasassin" | "competitor" | "even" | "different";

export type ComparisonRow = {
  capability: string;
  competitor: string;
  saasassin: string;
  note?: string;
  edge: ComparisonEdge;
  /** Required whenever `competitor` states a fact about the competitor. */
  sources: ComparisonSource[];
};

export type PricedModule = {
  id: string;
  name: string;
  /** List price per seat per month, in `currency`. */
  pricePerSeatMonth: number;
  kind: "base" | "add-on";
  /** Always counted; the user cannot untick it. */
  required?: boolean;
  /** Ticked when the calculator first renders. */
  defaultSelected?: boolean;
  /** One line on what the module covers. */
  covers: string;
};

export type ComparisonPricing = {
  currency: "USD";
  /** ISO date the list prices were read. */
  asOf: string;
  sourceUrl: string;
  /** How the source is shown on the page, e.g. "lattice.com/pricing". */
  sourceLabel: string;
  billing: string;
  /** Minimum annual contract value; 0 when there is none. */
  annualMinimum: number;
  /** Modules SaaSassin has a comparable workflow for; the calculator offers these. */
  modules: PricedModule[];
  /** Modules left out of the calculator, and why. */
  excludedModules: Array<{ name: string; price: string; reason: string }>;
  seats: { min: number; max: number; default: number; step: number };
};

export type ComparisonLink = { label: string; href: string };

export type ComparisonFaq = { question: string; answer: string };

export type Comparison = {
  /** URL segment: /compare/<slug>. Matches the catalog target slug when one exists. */
  slug: string;
  competitorName: string;
  /** Our product, e.g. "SaaSassin Performance". */
  productName: string;
  productUrl: string;
  /** Public source repository for the product (see `sourceRepositories` in app-config). */
  repository: string;
  /** ISO date every competitor fact on the page was last checked. */
  lastVerified: string;
  /** One sentence for the /compare index card. */
  summary: string;
  seo: {
    /** Page title; the site template appends " | SaaSassin". Keep the full title ≤ 60 characters. */
    title: string;
    /** ≤ 155 characters. */
    description: string;
    keywords: string[];
    /** Short app description for SoftwareApplication JSON-LD. */
    applicationDescription: string;
    applicationCategory: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    proof: string[];
  };
  ctas: {
    primary: ComparisonLink;
    source: ComparisonLink;
    talk: ComparisonLink;
  };
  builtFor: { title: string; body: string; notFor: string };
  /** Each one is tied to a feature that exists today; `proof` points at it. */
  differentiators: Array<{ title: string; body: string; proof: { label: string; href?: string } }>;
  /** The first four rows also appear in the hero's "At a glance" card. */
  rows: ComparisonRow[];
  betterChoice: { title: string; intro: string; items: string[] };
  migration: { title: string; body: string; items: Array<{ label: string; status: string; body: string }> };
  pricing: ComparisonPricing;
  faq: ComparisonFaq[];
  /** Where "Talk to us" submissions are filed. `target` must be a catalog target slug. */
  interest: { target: string; source: string };
  /** Repo-relative path of the parity matrix read at build time; omit to hide the section. */
  parityFile?: string;
  /** Internal pages worth linking from the bottom of the page (research, target brief). */
  related: ComparisonLink[];
  trademark: string;
};
