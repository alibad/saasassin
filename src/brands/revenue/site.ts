import {
  Download,
  EyeOff,
  FileText,
  GraduationCap,
  ScrollText,
  ShieldCheck,
  SquareKanban,
  TrendingUp,
  UsersRound,
  Webhook,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Revenue homepage copy. Claims trace to docs/fleet/status/revenue.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "Definitions", href: "#definitions" },
    { label: "How it works", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Conversation intelligence for sales teams",
    title: "Know why every deal moves — and show the call that proves it.",
    emphasis: "show the call that proves it",
    lede:
      "Log consented call transcripts against your deals. Revenue measures talk ratio, questions and next steps, flags deal risks, and links every number to the moment in the call it came from.",
    primaryCta: "Start your workspace",
    secondaryCta: { label: "How the numbers work", href: "#definitions" },
    note: "Free and open source. Works from transcripts — no bots join your meetings.",
  },
  features: {
    kicker: "What you get",
    title: "Call analysis your reps can check for themselves",
    lede: "Every insight is a rule you can read, applied to a transcript you can open.",
    items: [
      {
        icon: FileText,
        title: "Transcripts in, analysis out",
        body: "Paste or upload a WebVTT, SRT or “Speaker: text” transcript. Revenue computes talk ratio, longest monologue, questions, interactivity, tracker hits and next steps — the same input always gives the same result.",
      },
      {
        icon: ShieldCheck,
        title: "Consent before anything is stored",
        body: "Every call needs a recording-consent record: jurisdiction, consent basis and an all-party confirmation. Without it, the server refuses the transcript.",
      },
      {
        icon: SquareKanban,
        title: "A deal board with risk signals",
        body: "Stages, amounts, close dates and contacts with deal roles. Each risk signal says which rule fired and links to the call — and timestamp — that caused it.",
      },
      {
        icon: TrendingUp,
        title: "A forecast built from real deals",
        body: "Commit, best case, pipeline, weighted pipeline and closed won, by month and by rep. The owner's call stays visible; manager overrides need a reason and are audited.",
      },
      {
        icon: GraduationCap,
        title: "Coaching on the exact moment",
        body: "Comments at a timestamp, scorecards against a weighted rubric, clips collected into playlists, and coaching assignments reps acknowledge.",
      },
      {
        icon: EyeOff,
        title: "Redaction and retention",
        body: "Redact an exact span and the original text is never kept. Set a retention period, preview which calls it would delete, then apply it.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From a call transcript to a deal you understand",
    lede: "No recording, no meeting bot: just the transcript your meeting tool already gives you.",
    items: [
      {
        title: "Build your pipeline",
        body: "Add accounts, deals with stage, amount, close date and owner, and the contacts on each deal with their role.",
      },
      {
        title: "Log a consented call",
        body: "Paste or upload the transcript against a deal and record consent. The form previews the parse and the analysis before you save.",
      },
      {
        title: "Review the analysis",
        body: "Read the transcript with tracker highlights, jump to any moment, link speakers to contacts, comment and score the call.",
      },
      {
        title: "Act on the deal",
        body: "Risk signals on the board, a timeline of stages and calls, and a forecast category the owner calls and managers can override with a reason.",
      },
    ],
  },
  importer: {
    kicker: "Bring your transcripts",
    title: "Works with the transcripts you already have",
    body: "Revenue doesn't record calls or send anything into your meetings. Export a transcript from the meeting tool you use, paste or upload it against a deal, and record consent.",
    formats: ["WebVTT", "SRT", "Speaker: text", "[mm:ss] stamps"],
    points: [
      "A consent record is required before a transcript is saved",
      "See the parsed transcript and the analysis before you commit",
      "Re-analyse any call later with your current trackers",
    ],
  },
  ownership: {
    kicker: "Open source, open records",
    title: "Your calls and pipeline stay yours",
    body: "Revenue is free and open source under the AGPL-3.0. Read every rule it applies, and export the whole workspace whenever you want.",
    points: [
      {
        icon: Download,
        title: "A complete export",
        body: "Accounts, deals, calls with transcripts and consent, comments, scorecards, trackers, contacts, members and audit, as versioned JSON.",
      },
      {
        icon: Webhook,
        title: "Signed webhooks",
        body: "call.analyzed and deal.stage_changed, signed with HMAC-SHA256. Payloads carry analysis numbers, never transcript text.",
      },
      {
        icon: ScrollText,
        title: "An audit log without transcripts",
        body: "Every change is recorded with who and when. Transcript text and redacted words never enter the audit log.",
      },
      {
        icon: UsersRound,
        title: "Roles for real sales teams",
        body: "Admins, managers, reps and viewers, checked on the server for every read and write.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "What sales leaders ask first",
    items: [
      {
        q: "Does Revenue record or join my calls?",
        a: "No. Revenue processes no audio and sends no bots into meetings. You bring the transcript from the meeting tool you already use. Meeting capture isn't connected, and the app says so.",
      },
      {
        q: "Is the analysis done by AI?",
        a: "No. Talk ratio, questions, interactivity, tracker hits and next steps come from deterministic rules you can read. The same transcript always gives the same result.",
      },
      {
        q: "Does it update my CRM?",
        a: "Not yet. Each deal shows the CRM fields an approved sync would write — stage, amount, close date, last call, next step, competitors — with a link to the transcript moment behind each value. No CRM is connected, so nothing is written.",
      },
      {
        q: "How is consent handled?",
        a: "Every call needs a consent record with the jurisdiction, the consent basis and an all-party confirmation. The server rejects a transcript without one, and the form won't submit until it's complete.",
      },
      {
        q: "Can I remove sensitive details from a transcript?",
        a: "Yes. Managers and admins redact an exact span: it's replaced with [REDACTED], the original is not kept, and the analysis is recomputed. The audit log records who, where, the length and the reason — not the text.",
      },
      {
        q: "What does it cost?",
        a: "Revenue is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Put every deal on the record",
    body: "Create a workspace, add a deal and log your first consented call transcript.",
    label: "Start your workspace",
  },
  signIn: {
    title: "Every number, linked to the moment that made it.",
    body: "Sign in to your workspace, or create one for your sales team.",
    points: [
      "Deterministic call analysis you can check",
      "A consent record before any transcript is stored",
      "A forecast built only from your real deals",
    ],
  },
  footer: {
    tagline: "Open-source conversation intelligence: consented transcripts, evidence-linked analysis.",
  },
};
