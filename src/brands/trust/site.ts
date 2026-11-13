import {
  Download,
  FileCheck2,
  FileClock,
  FileCode2,
  Gauge,
  Globe,
  KeyRound,
  ListChecks,
  ListTodo,
  ScrollText,
  UserSearch,
  UsersRound,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Trust homepage copy. Claims trace to docs/fleet/status/trust.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "What it isn't", href: "#not" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "SOC 2 · ISO 27001 readiness",
    title: "Audit readiness, with the evidence to back it.",
    emphasis: "evidence",
    lede:
      "Track controls, evidence that expires, policies, risks and vendors in one workspace, with readiness computed live from your own records. Trust doesn't certify anyone — it keeps the work organised and exportable for your auditor.",
    primaryCta: "Start your program",
    secondaryCta: { label: "What Trust isn't", href: "#not" },
    note: "Free and open source (AGPL-3.0).",
  },
  features: {
    kicker: "controls / evidence / policies",
    title: "The whole readiness program in one workspace",
    lede: "Every figure on the dashboard is computed from your records, with its definition on screen.",
    items: [
      {
        icon: ListChecks,
        title: "A versioned control library",
        body: "SOC 2 common criteria (CC1–CC9, 33 controls) and an ISO 27001:2022 Annex A subset (15 controls), paraphrased and mapped. Not applicable needs a written reason.",
      },
      {
        icon: FileClock,
        title: "Evidence that expires",
        body: "Attach a link or pasted text with a collection date, review cadence or expiry. When it lapses, its controls show “needs evidence” on their own.",
      },
      {
        icon: FileCheck2,
        title: "Policies with versions",
        body: "Start from eight templates. Edits create versions, approved text is never rewritten, and acknowledgement coverage is measured.",
      },
      {
        icon: Gauge,
        title: "Risks and vendors",
        body: "Score risks on a 5×5 heat map; accepting one needs a rationale. Keep a tiered vendor inventory with overdue reviews flagged.",
      },
      {
        icon: UserSearch,
        title: "Audit periods and findings",
        body: "Give an auditor read-only access until a date — after it, the server refuses. Track findings through remediation.",
      },
      {
        icon: KeyRound,
        title: "Quarterly access reviews",
        body: "List critical systems and their users, sign off each quarter, and record who was kept and who was removed.",
      },
      {
        icon: Globe,
        title: "A trust center you control",
        body: "Off by default. Publish only what you choose: frameworks, readiness, per-category counts and approved policy names.",
      },
      {
        icon: ListTodo,
        title: "Gap tasks from real gaps",
        body: "Missing owners, expiring evidence, unapproved policies, untreated high risks and overdue vendors, in priority order.",
      },
    ],
  },
  steps: {
    kicker: "how it works",
    title: "From framework to evidence package",
    lede: "One action endpoint per workspace: every change passes the same role check and lands in the audit log.",
    items: [
      {
        title: "Pick your frameworks",
        body: "Choose SOC 2, ISO 27001 or both from the built-in library, pinned to a version. Library updates arrive as an explicit, audited diff.",
      },
      {
        title: "Assign controls, attach evidence",
        body: "Give every control an owner and attach evidence with its collection date and review cadence. Owners and admins accept or reject it.",
      },
      {
        title: "Close the gaps",
        body: "Work the generated task list: approve policies, refresh expiring evidence, treat high risks, review vendors and access.",
      },
      {
        title: "Hand over to your auditor",
        body: "Open an audit period with read-only access and export an evidence package per framework: requirement → controls → evidence.",
      },
    ],
  },
  ownership: {
    kicker: "open source",
    title: "Your evidence graph stays yours",
    body: "Trust is free and open source under the AGPL-3.0. Your whole program exports as versioned JSON whenever you want — no support ticket required.",
    points: [
      {
        icon: Download,
        title: "Full export and evidence package",
        body: "The workspace as versioned JSON, plus an audit-ready package per framework with dates and freshness.",
      },
      {
        icon: ScrollText,
        title: "Append-only activity",
        body: "Every change goes to the audit log, visible to your team under Team & activity.",
      },
      {
        icon: UsersRound,
        title: "Least-privilege roles",
        body: "Owners, admins, members and read-only viewers — suited to auditors — checked on the server for every action.",
      },
      {
        icon: FileCode2,
        title: "Code you can audit",
        body: "The full source is public, including exactly how coverage and freshness are calculated.",
      },
    ],
  },
  faq: {
    kicker: "faq",
    title: "What security teams ask",
    items: [
      {
        q: "Will Trust make us SOC 2 compliant?",
        a: "No tool can. Trust tracks readiness and evidence; an independent auditor examines your controls and issues the report. Trust keeps that work organised and exportable.",
      },
      {
        q: "Which frameworks are included?",
        a: "SOC 2 common criteria (CC1–CC9, 33 controls) and a 15-control subset of ISO 27001:2022 Annex A, in Trust's own paraphrased wording, library version 2026.10.0.",
      },
      {
        q: "Does it connect to our cloud and identity providers?",
        a: "Not yet. There are no connectors or automated checks today: your team records evidence as links or pasted text, with dates that make expiry automatic.",
      },
      {
        q: "How do auditors get access?",
        a: "Create an audit period and invite the auditor as a read-only viewer. Their access ends on the date you set, or as soon as you revoke it.",
      },
      {
        q: "What appears on the public trust center?",
        a: "Only what an admin turns on: frameworks, readiness percentage, per-category counts and the names of approved policies, labelled as self-reported. Evidence, owners, risks, vendors and policy text are never published.",
      },
      {
        q: "Can we import our program from Vanta?",
        a: "Not yet. You can export everything from Trust at any time.",
      },
    ],
  },
  cta: {
    title: "See where your program really stands",
    body: "Create a workspace, pick a framework and assign your first controls.",
    label: "Start your program",
  },
  signIn: {
    title: "Readiness you can show your auditor.",
    body: "Sign in to your compliance workspace, or create one for your team.",
    points: [
      "SOC 2 and ISO 27001 controls with owners",
      "Evidence that flags itself when it expires",
      "An evidence package per framework, on demand",
    ],
  },
  footer: {
    tagline: "Open-source compliance readiness and evidence tracking. Not a certification.",
  },
};
