import {
  Blocks,
  Download,
  Flag,
  ListTree,
  Quote,
  ScrollText,
  UsersRound,
  Webhook,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Studies homepage copy. Claims trace to docs/fleet/status/studies.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "From Maze", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Unmoderated user research",
    title: "Run studies. Keep every answer.",
    emphasis: "Keep every answer",
    lede:
      "Build surveys, card sorts, tree tests and website tasks from blocks, share one link, and turn responses into findings that cite the exact answers behind them.",
    primaryCta: "Build your first study",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source. Participants answer anonymously — no account needed.",
  },
  features: {
    kicker: "What you get",
    title: "Precise answers, from study design to finding",
    lede: "Every block, response and decision is stored, versioned and exportable — and nothing is excluded behind your back.",
    items: [
      {
        icon: Blocks,
        title: "Studies built from blocks",
        body: "Welcome and consent, multiple choice, opinion scales, open text, yes/no, website tasks, closed card sorts and tree tests. Add skip logic and screeners, then preview with nothing recorded.",
        points: [
          "Publishing freezes an immutable version",
          "Cap participants or set a close date",
          "Duplicate a study to run it again",
        ],
      },
      {
        icon: ListTree,
        title: "Tree testing, task by task",
        body: "Participants navigate a text-only tree one task at a time. For each task you see success rate, directness, median time, the outcome split, first clicks and where people ended up.",
      },
      {
        icon: Flag,
        title: "Quality flags you decide on",
        body: "Speeders, straight-lining and empty or junk open text are flagged with the reason. You exclude a session with a written reason or keep it — both are audited, and nothing is excluded automatically.",
      },
      {
        icon: Quote,
        title: "Findings that cite their evidence",
        body: "Record a finding with a severity and at least one piece of evidence: a specific session's answer or a whole block. The server checks every citation and keeps an excerpt.",
        points: ["Shared results show findings above the charts", "No raw sessions on the share link"],
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From question to finding in four steps",
    items: [
      {
        title: "Build the study",
        body: "Stack blocks, add skip logic and screeners, and preview it exactly as a participant will see it.",
      },
      {
        title: "Publish and share",
        body: "Publishing freezes a version. Share one participant link; cap responses or set a close date.",
      },
      {
        title: "Collect answers",
        body: "Participants consent and answer anonymously, and the server validates every response against the frozen version.",
      },
      {
        title: "Analyse and cite",
        body: "Read results per block, review quality flags, exclude with a reason, and record findings that cite answers.",
      },
    ],
  },
  importer: {
    kicker: "Switching from Maze?",
    title: "Bring your Maze results with you",
    body: "Import a Maze results CSV. You see exactly how each column maps — block type, timing, metadata, dropped — before anything is written, then analyse it like any other study.",
    formats: ["Maze results CSV"],
    points: [
      "Imported as a closed, read-only study you can analyse, exclude, cite and export — or duplicate to re-run in Studies",
      "Emails, names, IPs, device and location columns are dropped, and the preview says so",
      "Click paths, heatmaps and recordings aren't portable from Maze, so they aren't imported",
    ],
  },
  ownership: {
    kicker: "Open source, open data",
    title: "Your participants' answers stay yours",
    body: "Studies is free and open source under the AGPL-3.0. Read the code, export every response, and wire results into your own tools.",
    points: [
      {
        icon: Download,
        title: "Exports at every level",
        body: "Study responses as JSON (with quality flags, decisions and findings), a CSV per block, and the complete workspace bundle.",
      },
      {
        icon: Webhook,
        title: "Signed webhooks",
        body: "HTTPS endpoints for response.completed and study.closed, signed with HMAC-SHA256, with a delivery log that shows failures honestly.",
      },
      {
        icon: ScrollText,
        title: "An audit log",
        body: "Every researcher action is recorded — including each exclusion and the reason behind it.",
      },
      {
        icon: UsersRound,
        title: "Roles enforced on the server",
        body: "Admins, researchers and viewers. Viewers read results; every write they attempt is refused.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "What researchers ask first",
    items: [
      {
        q: "Can I test a Figma prototype or see heatmaps?",
        a: "Not yet. Prototype click paths, heatmaps and screen recordings aren't built. Website tasks measure whether a participant opened the site and answered, not instrumented clicks.",
      },
      {
        q: "Do participants need an account?",
        a: "No. They open your link, give consent and answer anonymously. Their progress is kept if they reload the tab.",
      },
      {
        q: "How do you deal with low-quality responses?",
        a: "Sessions are flagged for speeding, straight-lining and empty or junk open text, with the reason shown. You decide: exclude with a reason or keep. Excluded sessions stay in your exports, marked as excluded.",
      },
      {
        q: "Can you recruit participants for me?",
        a: "No. There's no participant panel today — you share the study link with your own users or a recruiter you already use.",
      },
      {
        q: "What comes across from Maze?",
        a: "The results CSV: answers and mission outcomes, inferred into block types you can check in the preview. Personal columns are dropped. Click paths, heatmaps and recordings don't come across.",
      },
      {
        q: "What does it cost?",
        a: "Studies is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Ask your next question properly",
    body: "Create a workspace, build a study from blocks and share the link with your first participants.",
    label: "Build your first study",
  },
  signIn: {
    title: "Ask better questions. Keep every answer.",
    body: "Sign in to your studies, or create a workspace for your team.",
    points: [
      "Surveys, card sorts, tree tests and website tasks",
      "Quality flags you review, never silent exclusions",
      "Findings that cite the answers behind them",
    ],
  },
  footer: {
    tagline: "Open-source unmoderated research: precise studies, every answer exportable.",
  },
};
