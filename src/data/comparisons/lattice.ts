import { sourceFileUrl, sourceRepositories } from "../../lib/app-config";
import type { Comparison, ComparisonSource } from "../../lib/compare/types";

/**
 * SaaSassin Performance vs Lattice — the data behind /compare/lattice.
 *
 * Facts and wording come from docs/competitors/lattice/{research,story,parity}.md.
 * Before changing a Lattice cell: re-read the cited page, update `accessed`, and bump
 * `lastVerified`. Before adding a SaaSassin claim: check story.md §4 ("Claims we must
 * NOT make yet"). Self-hosting, AI, SSO, email reminders and "import from Lattice" are
 * not claimable today.
 */

const ACCESSED = "2026-11-13";
const repo = sourceRepositories.performance;

const source = (id: string, label: string, url: string): ComparisonSource => ({
  id,
  label,
  url,
  accessed: ACCESSED,
});

/** Lattice pages cited on the compare page; ids match research.md §9. */
const L1 = source("L1", "Lattice pricing page", "https://lattice.com/pricing");
const L3 = source("L3", "Lattice performance reviews page", "https://lattice.com/platform/performance/reviews");
const L10 = source("L10", "Lattice product updates", "https://lattice.com/product-updates");
const L11 = source(
  "L11",
  "Lattice Spring/Summer 2026 release",
  "https://lattice.com/blog/lattice-spring-summer-2026-product-release",
);
const L13 = source("L13", "Lattice July 2026 product updates", "https://lattice.com/blog/july-2026-product-updates");
const L14 = source(
  "L14",
  "Introducing the Lattice AI Agent in 1:1s",
  "https://lattice.com/blog/introducing-the-lattice-ai-agent-in-1-1s",
);
const L15 = source("L15", "Introducing Lattice MCP", "https://lattice.com/blog/introducing-lattice-mcp");
const H2 = source(
  "H2",
  "Lattice help center: End Peer Selection",
  "https://help.lattice.com/hc/en-us/articles/10765260630679-End-Peer-Selection",
);
const H3 = source(
  "H3",
  "Lattice help center: End a Reviewee's Review Cycle Early",
  "https://help.lattice.com/hc/en-us/articles/1500002051882-End-a-Reviewee-s-Review-Cycle-Early",
);
const H7 = source(
  "H7",
  "Lattice help center: Navigate Reviews as a Manager",
  "https://help.lattice.com/hc/en-us/articles/1500002045142",
);
const H9 = source(
  "H9",
  "Lattice help center: Review Cycle Exports",
  "https://help.lattice.com/hc/en-us/articles/360060448714-Review-Cycle-Exports",
);
const H14 = source(
  "H14",
  "Lattice help center: calibration groups",
  "https://help.lattice.com/hc/en-us/articles/360062289253",
);
const H20 = source(
  "H20",
  "Lattice help center: Create a 1:1 as a Manager",
  "https://help.lattice.com/hc/en-us/articles/360061711493",
);
const H21 = source(
  "H21",
  "Lattice help center: 1:1 agenda templates",
  "https://help.lattice.com/hc/en-us/articles/360061800073",
);
const H22 = source(
  "H22",
  "Lattice help center: cascading goals",
  "https://help.lattice.com/hc/en-us/articles/360063909333",
);
const H25 = source(
  "H25",
  "Lattice help center: Data Exports and Data Retention Period",
  "https://help.lattice.com/hc/en-us/articles/1500001262262",
);
const H26 = source(
  "H26",
  "Lattice help center: Lattice's Public API",
  "https://help.lattice.com/hc/en-us/articles/360059449534-Lattice-s-Public-API",
);
const H27 = source("H27", "Lattice help center: The SCIM API", "https://help.lattice.com/hc/en-us/articles/4404294040983");

export const latticeComparison: Comparison = {
  slug: "lattice",
  competitorName: "Lattice",
  productName: "SaaSassin Performance",
  productUrl: "https://performance.saasassin.net",
  repository: repo,
  lastVerified: ACCESSED,
  summary:
    "Performance reviews you can preview, undo and export, compared row by row with Lattice's public pages.",
  seo: {
    title: "Open-Source Lattice Alternative for Reviews",
    description:
      "Self, manager, peer and upward reviews with no seat price or minimum. Preview and undo every phase, export to one file. A dated, sourced comparison.",
    keywords: [
      "lattice alternative",
      "lattice alternatives",
      "open source lattice alternative",
      "lattice competitors",
      "open source performance review software",
      "free performance review software",
    ],
    applicationDescription:
      "Open-source performance reviews: self, manager, peer and upward reviews with previewed, reversible phases, inspectable permissions, an append-only audit trail and a versioned export.",
    applicationCategory: "BusinessApplication",
  },
  hero: {
    eyebrow: "SaaSassin Performance vs Lattice",
    title: "The open-source alternative to Lattice for performance reviews.",
    lede: "Run self, manager, peer and upward reviews with phases you can preview and undo, and export your reviews, goals, feedback and 1:1s in one versioned file. No per-seat price. No minimum.",
    proof: ["Reversible cycles", "Permission simulator", "Checksummed export", "Append-only audit"],
  },
  ctas: {
    primary: { label: "Try SaaSassin Performance free", href: "https://performance.saasassin.net/sign-in" },
    source: { label: "Read the source", href: repo },
    talk: { label: "Talk to us", href: "#talk-to-us" },
  },
  builtFor: {
    title: "Built for people teams at companies with 25–250 employees.",
    body: "For teams running review cycles, goals, feedback and 1:1s who want rules they can inspect and records they can take with them.",
    notFor: "It is not an HRIS, a payroll system or an engagement-survey tool.",
  },
  differentiators: [
    {
      title: "No seat price, no minimum",
      body: "The hosted workspace has no per-seat price and no minimum contract. Sign up and run a full cycle without a sales call.",
      proof: { label: "performance.saasassin.net", href: "https://performance.saasassin.net/sign-in" },
    },
    {
      title: "Source you can read",
      body: "The code that runs your cycle — permissions, phase rules, packets, export — is public under AGPL-3.0.",
      proof: { label: "LICENSE", href: sourceFileUrl(repo, "LICENSE") },
    },
    {
      title: "Phases you can preview and undo",
      body: "Every phase change shows its effects, blockers and warnings first, moves one step at a time, and can be reversed without losing submitted work.",
      proof: { label: "state-machine.ts", href: sourceFileUrl(repo, "src/lib/lattice/state-machine.ts") },
    },
    {
      title: "Permissions you can inspect",
      body: "Roles are built from 16 named permissions. Run a role through the simulator, or view the workspace as that role.",
      proof: { label: "permissions.ts", href: sourceFileUrl(repo, "src/lib/lattice/permissions.ts") },
    },
    {
      title: "Your records, in one file",
      body: "One versioned export covers reviews, goals, feedback, 1:1s and audit events, with a sha256 checksum on every part. A read API and signed webhooks cover the rest.",
      proof: { label: "export.ts", href: sourceFileUrl(repo, "src/lib/lattice/export.ts") },
    },
    {
      title: "Built to protect people",
      body: "Below a minimum number of responses (default 3), peer and upward feedback is withheld rather than averaged. Review answers, feedback text and ratings never enter the audit log.",
      proof: { label: "program.ts", href: sourceFileUrl(repo, "src/lib/lattice/program.ts") },
    },
  ],
  rows: [
    {
      capability: "Price",
      competitor: "Performance $10 per seat per month. Goals & OKRs $8. Grow add-on +$4.",
      saasassin: "No per-seat price.",
      note: "Lattice list prices, billed annually in USD.",
      edge: "saasassin",
      sources: [L1],
    },
    {
      capability: "Minimum contract",
      competitor: "$4,000 a year, billed annually.",
      saasassin: "No minimum contract.",
      edge: "saasassin",
      sources: [L1],
    },
    {
      capability: "Getting started",
      competitor: "A demo, a sales call or a self-guided tour. The pricing page lists no free trial.",
      saasassin: "Sign up and create an organization in the browser.",
      edge: "saasassin",
      sources: [L1],
    },
    {
      capability: "Source code",
      competitor: "Proprietary subscription service.",
      saasassin: "AGPL-3.0, public on GitHub.",
      edge: "saasassin",
      sources: [L1],
    },
    {
      capability: "Where it runs",
      competitor: "Hosted by Lattice. Its help center says data is deleted automatically 180 days after the contract ends.",
      saasassin: "Hosted by SaaSassin, with the database in Firestore's EU multi-region (eur3).",
      note: "Self-hosting isn't supported yet. A self-host guide is coming once it has been proven on a fresh Firebase project.",
      edge: "different",
      sources: [H25],
    },
    {
      capability: "Review directions",
      competitor: "Self, manager, peer and upward.",
      saasassin: "Self, manager, peer and upward.",
      edge: "even",
      sources: [L3],
    },
    {
      capability: "Ending a phase",
      competitor:
        "Its help center says ending peer selection approves pending nominations and launches writing, and ending a reviewee's cycle early submits their drafts.",
      saasassin:
        "Every phase change is previewed first, moves one phase at a time, is blocked while reviews are incomplete, and can be reversed without losing submitted work.",
      edge: "saasassin",
      sources: [H2, H3],
    },
    {
      capability: "Peer anonymity",
      competitor: "What a reviewee sees of reviewers' responses depends on admin visibility settings.",
      saasassin: "Peer and upward feedback is withheld, not averaged, below a minimum number of responses (default 3).",
      edge: "different",
      sources: [H7],
    },
    {
      capability: "Calibration",
      competitor: "Calibration groups with facilitators, past ratings in the table, and calibration analytics.",
      saasassin: "A calibrated rating and a private note per employee, plus the rating distribution.",
      edge: "competitor",
      sources: [H14, L10],
    },
    {
      capability: "Export",
      competitor: "Mostly CSV files per module; review analytics export as PNG images.",
      saasassin:
        "One versioned file covering reviews, goals, feedback, 1:1s and audit events, with a sha256 checksum on every part.",
      note: "Saved report views and API or webhook settings aren't in our export yet.",
      edge: "saasassin",
      sources: [H9, H25],
    },
    {
      capability: "API and webhooks",
      competitor: "A read API where goals are the only writable resource. The API article doesn't mention webhooks.",
      saasassin: "A read-only API with scoped keys, and HMAC-signed webhooks with a delivery log.",
      edge: "different",
      sources: [H26],
    },
    {
      capability: "Goals and OKRs",
      competitor: "Cascading goals and OKRs with roll-up, plus Jira and Salesforce integrations.",
      saasassin: "Goals with check-ins. Key results are planned.",
      edge: "competitor",
      sources: [H22, L1],
    },
    {
      capability: "1:1s",
      competitor: "Recurring 1:1s with agenda templates, calendar sync and an AI agent that joins the call.",
      saasassin: "A shared agenda and notes for an employee and their manager. Private notes and action items are planned.",
      edge: "competitor",
      sources: [H20, H21, L14],
    },
    {
      capability: "AI",
      competitor: "Evidence-based review drafts, an AI agent in 1:1s, and an MCP connector.",
      saasassin: "None yet. When it ships it will be opt-in, and every generated sentence will cite its source.",
      edge: "competitor",
      sources: [L13, L14, L15],
    },
    {
      capability: "Engagement and compensation",
      competitor: "Engagement surveys ($4 per seat per month) and a compensation add-on (+$6).",
      saasassin: "Not offered, by design.",
      edge: "different",
      sources: [L1],
    },
    {
      capability: "SSO, SCIM and HRIS",
      competitor: "SAML single sign-on, SCIM provisioning and HRIS integrations.",
      saasassin: "Google or email sign-in, and directory import from CSV.",
      edge: "competitor",
      sources: [H27, L11],
    },
    {
      capability: "Support",
      competitor: "Customer success support included with the contract.",
      saasassin: "Public GitHub issues and the contact form on this page.",
      edge: "competitor",
      sources: [L1],
    },
  ],
  betterChoice: {
    title: "When Lattice is the better choice",
    intro: "We would rather you pick the right tool. Today Lattice is likely the better fit if you need:",
    items: [
      "Engagement surveys or compensation cycles in the same product",
      "SAML single sign-on or SCIM provisioning right now",
      "Deep two-way sync with your HRIS",
      "A native mobile app",
      "AI-drafted reviews or an AI notetaker in 1:1s",
      "Cascading OKRs with roll-up",
    ],
  },
  migration: {
    title: "Moving from Lattice",
    body: "Start with your org chart. Your review history stays where it is until a history importer exists.",
    items: [
      {
        label: "Org chart",
        status: "Available",
        body: "Import employees, teams and managers from a CSV of up to 250 rows. You see every row, error and warning before anything is written, and nobody gets admin rights from a spreadsheet. It hasn't been tested on a real Lattice export yet, so you may need to rename a column or two.",
      },
      {
        label: "Review history",
        status: "Not built yet",
        body: "Importing past Lattice review responses as a closed, read-only cycle is on the roadmap. Tell us if you need it.",
      },
      {
        label: "Goals, feedback and 1:1s",
        status: "Start fresh",
        body: "There is no importer for these yet. New goals, feedback and 1:1s start in SaaSassin Performance.",
      },
    ],
  },
  pricing: {
    currency: "USD",
    asOf: ACCESSED,
    sourceUrl: L1.url,
    sourceLabel: "lattice.com/pricing",
    billing: "Billed annually in USD; no monthly option.",
    annualMinimum: 4000,
    modules: [
      {
        id: "performance",
        name: "Performance",
        pricePerSeatMonth: 10,
        kind: "base",
        required: true,
        defaultSelected: true,
        covers: "Reviews and calibration",
      },
      {
        id: "goals",
        name: "Goals & OKRs",
        pricePerSeatMonth: 8,
        kind: "base",
        defaultSelected: true,
        covers: "Goals with check-ins",
      },
    ],
    excludedModules: [
      { name: "Engagement", price: "$4 per seat per month", reason: "SaaSassin Performance doesn't offer surveys." },
      { name: "Compensation", price: "+$6 per seat per month", reason: "SaaSassin Performance doesn't offer compensation cycles." },
      { name: "Grow", price: "+$4 per seat per month", reason: "SaaSassin Performance has no career-growth module yet." },
    ],
    seats: { min: 10, max: 500, default: 50, step: 1 },
  },
  faq: [
    {
      question: "What does SaaSassin Performance cost?",
      answer:
        "The hosted workspace at performance.saasassin.net has no per-seat price and no minimum contract. You can sign up and run a full review cycle without talking to anyone.",
    },
    {
      question: "Is SaaSassin affiliated with Lattice?",
      answer:
        "No. Lattice is a trademark of its owner, and SaaSassin is not affiliated with or endorsed by Lattice. We compare against Lattice's public pages and date every fact.",
    },
    {
      question: "How do you keep this comparison accurate?",
      answer:
        "Every Lattice fact on this page links to the public page it came from, with the date we read it. We re-check them before each update. If you spot something out of date, tell us through the form on this page.",
    },
    {
      question: "Can I self-host it?",
      answer:
        "Not with a supported guide yet. The code is public under AGPL-3.0, but we haven't proven a setup on a fresh Firebase project, so we don't recommend self-hosting real reviews today. A self-host guide is coming. Once it ships, self-hosting costs only your own Firebase and Vercel usage.",
    },
    {
      question: "What is in the export?",
      answer:
        "One JSON file with a versioned manifest and 14 product files: organization, members, teams, roles, review templates, review cycles, reviews, peer nominations, calibrations, packets, goals, feedback, one-to-ones and audit events. Each file carries its own schema id, version, record count and sha256 checksum. Not included yet: saved report views, API key metadata and webhook settings.",
    },
    {
      question: "What does AGPL-3.0 mean for my company?",
      answer:
        "You can use, study and change the code. If you run a modified version, the license asks you to offer the source of your changes to everyone who uses it over a network. Running it unmodified carries no such obligation. This is a summary, not legal advice; the LICENSE file is the authority.",
    },
    {
      question: "Does it use AI?",
      answer:
        "Not yet. When AI arrives it will be off by default, and every generated sentence will link to the review, goal, feedback or note it came from.",
    },
    {
      question: "Is it secure?",
      answer:
        "Every read and write is scoped to your organization and re-checked on the server. Firestore security rules are covered by automated tests, including cross-tenant access. Privileged actions are recorded in an append-only audit log, and review answers, feedback text and ratings never enter it. We have not completed an external security audit or a certification such as SOC 2.",
    },
    {
      question: "Can I import my data from Lattice?",
      answer:
        "Your org chart, yes: export your directory as a CSV and import it with a preview of every row. The importer hasn't been tested on a real Lattice export yet, so column names may need adjusting. Importing review history isn't available yet.",
    },
    {
      question: "Do employees need their own accounts?",
      answer:
        "Yes, to write reviews and read their own packets. Imported employees claim their record the first time they sign in with their verified work email, so their reviews, goals and packets are already there.",
    },
  ],
  interest: { target: "lattice", source: "compare-lattice" },
  parityFile: "docs/competitors/lattice/parity.md",
  related: [
    { label: "Our Lattice research and decision record", href: "/targets/lattice/research" },
    { label: "The Lattice target brief", href: "/targets/lattice" },
    { label: "The SaaSassin product fleet", href: "/apps" },
  ],
  trademark: "Lattice is a trademark of its owner. SaaSassin is not affiliated with or endorsed by Lattice.",
};
