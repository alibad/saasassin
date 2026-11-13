import {
  BarChart3,
  Building2,
  Eye,
  FileJson,
  HeartHandshake,
  ScrollText,
  Target,
  Undo2,
  UsersRound,
  Webhook,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/**
 * Performance homepage copy. Claims trace to docs/fleet/status/performance.md and the "can we say
 * it today?" column of docs/competitors/lattice/story.md (no self-hosting, email reminders, AI,
 * Lattice import, SSO or "free forever").
 */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Open source", href: "#open-source" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Open-source performance reviews",
    title: "Performance reviews your people can trust.",
    emphasis: "can trust",
    lede:
      "Run self, manager, peer and upward reviews with phases you preview before they happen and can undo after. Permissions you can inspect, feedback that stays fair, and every review, goal and 1:1 in one export.",
    primaryCta: "Start your workspace",
    secondaryCta: { label: "See a review cycle", href: "#how-it-works" },
    note: "Free and open source. No per-seat price, no minimum contract.",
  },
  features: {
    kicker: "Why it feels different",
    title: "A review cycle that's fair to everyone in it",
    lede: "The hard parts of performance reviews are trust and timing. Performance makes both visible.",
    items: [
      {
        icon: Undo2,
        title: "Phases you can preview and undo",
        body: "Every phase change shows its effects, blockers and warnings first, moves one step at a time, and can be reversed without losing anything anyone wrote.",
      },
      {
        icon: Eye,
        title: "Permissions you can inspect",
        body: "Sixteen plain-language permissions, a permission simulator and View as role, so you see what a role can do before anyone has it.",
      },
      {
        icon: HeartHandshake,
        title: "Fair by design",
        body: "Peer and upward feedback is anonymised — and withheld, not averaged, when too few people responded. Answers and feedback text never enter the audit log.",
      },
      {
        icon: UsersRound,
        title: "Self, manager, peer and upward",
        body: "Peer nominations with approvals, deadlines, reminders and escalations in an in-app inbox, calibration, review packets and acknowledgement.",
      },
      {
        icon: Target,
        title: "Goals, feedback and 1:1s",
        body: "Goals with check-ins, praise and constructive feedback with clear visibility, shared 1:1 agendas, and a timeline that only shows what each viewer may see.",
      },
      {
        icon: BarChart3,
        title: "Reports you can save",
        body: "Completion by direction and team, acknowledgement rates, goal health and the rating distribution, with private or shared saved views.",
      },
    ],
  },
  steps: {
    kicker: "How a cycle runs",
    title: "From org chart to acknowledged review",
    lede: "Every step is previewed before it happens, and every privileged action lands in the audit log.",
    items: [
      { title: "Import your people", body: "Upload your org chart as a CSV and see every row before anything is written. Nobody gets admin rights from a spreadsheet." },
      { title: "Build a template", body: "Versioned review templates with the questions and rating scales you choose." },
      { title: "Preview, then launch", body: "See exactly what launching will do — who writes which review, and what's blocking — before you confirm." },
      { title: "Nominate and write", body: "Employees nominate peers and managers approve. Reviews save as people write, with deadlines that show who is on track." },
      { title: "Calibrate and release", body: "Calibrate ratings with private notes, then release packets with peer and upward feedback anonymised." },
      { title: "Acknowledge and keep", body: "Employees acknowledge with a comment, a packet can be reopened with a reason, and the workspace exports as one versioned file." },
    ],
  },
  ownership: {
    kicker: "Open source",
    title: "Your review history leaves with you",
    body: "Performance is free and open source under the AGPL-3.0. There's no per-seat price and no minimum contract, the code is public, and your data comes out in one versioned file.",
    points: [
      {
        icon: FileJson,
        title: "One versioned export",
        body: "Every review, goal, feedback item, 1:1 and audit event in one file, each part with its own schema, version and checksum.",
      },
      {
        icon: Webhook,
        title: "A read API and signed webhooks",
        body: "Scoped, revocable API keys for the directory, cycles and public goals, and HMAC-signed webhooks with an honest delivery log.",
      },
      {
        icon: ScrollText,
        title: "An append-only audit log",
        body: "Every privileged action is recorded. Review answers, feedback text and ratings never are.",
      },
      {
        icon: Building2,
        title: "Isolated workspaces",
        body: "Every read and write is scoped to your organisation and re-checked on the server.",
      },
    ],
  },
  faq: {
    kicker: "FAQ",
    title: "Good questions to ask",
    items: [
      {
        q: "Is it really free?",
        a: "Performance is free and open source under the AGPL-3.0. The hosted workspace has no per-seat price and no minimum contract.",
      },
      {
        q: "Who is it for?",
        a: "People teams at companies of roughly 25 to 250 employees who want a fair, well-run review cycle. The CSV import handles up to 250 people.",
      },
      {
        q: "Does it replace a full HR platform?",
        a: "No. It covers reviews, goals, feedback and one-to-ones. Engagement surveys, compensation, payroll, SSO, HRIS sync, a mobile app and AI-drafted reviews aren't part of it.",
      },
      {
        q: "How does anonymity work?",
        a: "Peer and upward feedback is anonymised in review packets. Each cycle sets a minimum number of responses (three by default); below it, those responses are withheld entirely and the packet explains why.",
      },
      {
        q: "Do reminders go out by email?",
        a: "Not yet. Reminders and escalations land in an in-app inbox on the Overview page.",
      },
      {
        q: "Can I import from the tool I use today?",
        a: "You can import your org chart from a CSV. Importing review history from another tool isn't available yet.",
      },
    ],
  },
  cta: {
    title: "Run your next review cycle here",
    body: "Create a workspace, import your org chart and preview your first cycle before you launch it.",
    label: "Start your workspace",
  },
  signIn: {
    title: "Reviews your people can trust.",
    body: "Sign in to your performance workspace, or create one for your company.",
    points: [
      "Phases you preview before they happen — and can undo",
      "Peer feedback withheld, not averaged, below the threshold",
      "No per-seat price, no minimum contract",
    ],
  },
  footer: {
    tagline: "Open-source performance reviews: fair, reversible and yours to keep.",
  },
};
