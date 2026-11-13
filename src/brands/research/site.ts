import {
  Download,
  FileCode2,
  FolderLock,
  Highlighter,
  History,
  Lightbulb,
  ScrollText,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Research homepage copy. Claims trace to docs/fleet/status/research.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "From Dovetail", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "The customer research repository",
    title: "Every insight, traceable to the words behind it.",
    emphasis: "the words behind it",
    lede:
      "Keep interviews, consent, highlights and insights in one searchable repository. An insight can't exist without evidence, and every citation opens the exact span of the transcript it came from.",
    primaryCta: "Start your repository",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source. Bring transcripts as .vtt, .srt or .txt.",
  },
  features: {
    kicker: "What you get",
    title: "A research archive your whole team can trust",
    lede: "Built around one rule: a finding is only as good as the evidence you can show for it.",
    items: [
      {
        icon: Highlighter,
        title: "Highlights that stay put",
        body: "Select words in a transcript to make a tagged highlight. Fix a typo later and the highlight re-anchors to the same words; every span is validated on the server.",
      },
      {
        icon: Lightbulb,
        title: "Insights that cite their evidence",
        body: "An insight can't be saved without evidence. Each backlink jumps to the transcript and marks the exact span, and themes group related insights.",
      },
      {
        icon: Search,
        title: "Search that respects access",
        body: "Ranked, server-side search across a project that only returns what each person may see, with deep links straight into the transcript.",
      },
      {
        icon: ShieldCheck,
        title: "Consent, retention and legal holds",
        body: "Record consent and retention per participant. Preview a retention run before it deletes anything, and place legal holds that block deletion and redaction.",
      },
      {
        icon: FolderLock,
        title: "Folders with real access control",
        body: "Restricted folders stay hidden from anyone not listed — in the project view, search, exports, reports, version history and the audit log.",
      },
      {
        icon: History,
        title: "Version history for every insight",
        body: "Every edit makes a new, immutable version with a word-level diff, plus the evidence added or removed and theme changes.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From raw interview to a finding you can defend",
    lede: "Four steps, and the source chain is kept at every one of them.",
    items: [
      {
        title: "Add an interview",
        body: "Upload or paste a .vtt, .srt or .txt transcript, check the live preview, and record the participant and their consent.",
      },
      {
        title: "Correct the transcript",
        body: "Fix text and speakers segment by segment, or rename a speaker everywhere at once. Highlights follow the words.",
      },
      {
        title: "Highlight and tag",
        body: "Select what matters and tag it. Tag frequency, renames and merges keep patterns visible as the archive grows.",
      },
      {
        title: "Write insights, share a report",
        body: "Cite highlights, group insights into themes, and publish a read-only report that shows each insight with its quotes.",
      },
    ],
  },
  importer: {
    kicker: "Switching from Dovetail?",
    title: "Bring your Dovetail archive with you",
    body: "Import a Dovetail CSV or JSON export. You see how every column maps before anything is written, and a report of what came across afterwards.",
    formats: ["Dovetail CSV", "Dovetail JSON", ".vtt", ".srt", ".txt"],
    points: [
      "A mapping preview before a single record is written",
      "An import report that lists what came across and what didn't",
      "Transcripts arrive as speaker and timestamp segments, ready to highlight",
    ],
  },
  ownership: {
    kicker: "Open source, open archive",
    title: "Your research stays yours",
    body: "Research is free and open source under the AGPL-3.0. Read every line of the code, and take the whole archive with you whenever you want.",
    points: [
      {
        icon: Download,
        title: "Versioned exports",
        body: "Export a project or the whole workspace — sources, highlights, insights, themes, the evidence chain, members and audit — as versioned JSON.",
      },
      {
        icon: ScrollText,
        title: "An audit trail",
        body: "Every change is recorded. A redaction keeps who, when, the reason and the length — never the removed words.",
      },
      {
        icon: UsersRound,
        title: "Roles enforced on the server",
        body: "Admins, researchers and viewers. Viewers can read and search; every write they attempt is refused.",
      },
      {
        icon: FileCode2,
        title: "Code you can inspect",
        body: "The full source is public, so your security team can check exactly what happens to participant data.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "What researchers ask first",
    items: [
      {
        q: "Can I upload audio or video recordings?",
        a: "Not yet. Research works from transcripts today: upload or paste .vtt, .srt or .txt. Recording upload and transcription need a storage and transcription provider that isn't connected, and the app tells you so instead of pretending.",
      },
      {
        q: "Does it use AI to write insights?",
        a: "No. Insights are written by people and must cite evidence. There is no AI summarisation or semantic search today.",
      },
      {
        q: "How is participant data protected?",
        a: "Each workspace is isolated, roles are checked on the server for every read and write, restricted folders hide sources from anyone not listed, and redaction removes the original words from storage.",
      },
      {
        q: "Can I share findings outside my team?",
        a: "Reports are read-only pages for members of your workspace. There are no public links, by design.",
      },
      {
        q: "How do I move from Dovetail?",
        a: "Export your data from Dovetail as CSV or JSON, upload it, check the mapping preview, then import. You get a report of everything that came across.",
      },
      {
        q: "What does it cost?",
        a: "Research is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Give every insight its receipts",
    body: "Create a workspace, add an interview and write your first insight that cites its evidence.",
    label: "Create your workspace",
  },
  signIn: {
    title: "Your research, with its receipts.",
    body: "Sign in to your repository, or create a workspace for your team.",
    points: [
      "Insights that cite the exact words behind them",
      "Consent, retention and legal holds per participant",
      "Export the whole archive whenever you want",
    ],
  },
  footer: {
    tagline: "The open-source research repository where every insight keeps its source.",
  },
};
