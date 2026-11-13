import {
  Building2,
  ChevronsUp,
  Combine,
  Download,
  EyeOff,
  Map,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Webhook,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Feedback homepage copy. Claims trace to docs/fleet/status/feedback.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "From Canny", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Feedback boards, roadmap and changelog",
    title: "Hear every idea. Close the loop.",
    emphasis: "Close the loop.",
    lede:
      "Give your customers a public board to post ideas and vote — once each. Triage with statuses, tags and merges, then close the loop with a public roadmap and a changelog.",
    primaryCta: "Create your board",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source. Import from Canny, export to Fider.",
  },
  features: {
    kicker: "Built for the whole loop",
    title: "From the first vote to the changelog entry",
    lede: "Everything between \"someone has an idea\" and \"we shipped it\", in one place your customers can see.",
    items: [
      {
        icon: ChevronsUp,
        title: "One person, one vote",
        body: "Votes and their counts change together in one transaction, so double-clicks and retries never double count. People can take a vote back.",
      },
      {
        icon: Combine,
        title: "Merge duplicates without losing votes",
        body: "Merging moves the votes across and counts someone who voted on both just once. Unmerge restores exactly what was there.",
      },
      {
        icon: Map,
        title: "A public roadmap",
        body: "Planned, started and completed columns, grouped into themes or releases with shipped progress, each item linked to its post.",
      },
      {
        icon: Megaphone,
        title: "A changelog tied to real work",
        body: "Publish changelog entries linked to completed posts, so everyone who asked can see it shipped.",
      },
      {
        icon: Building2,
        title: "Know who's asking",
        body: "Record a voter's company and customer segment, then filter and rank ideas by the votes of a segment.",
      },
      {
        icon: ShieldCheck,
        title: "Moderation with a record",
        body: "Hide spam with a recorded reason and restore it later. Team-only internal notes never reach public pages.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From a shared link to a changelog",
    items: [
      { title: "Create a board", body: "Public or private. Share the link — anyone can read a public board without signing in." },
      { title: "Collect ideas and votes", body: "People post and vote. While typing a title they see similar ideas, so they vote instead of duplicating." },
      { title: "Triage", body: "Set a status with a public note, tag, assign an owner and merge duplicates." },
      { title: "Close the loop", body: "Move work across the roadmap and publish a changelog entry when it ships." },
    ],
  },
  importer: {
    kicker: "Switching from Canny?",
    title: "Bring your Canny board with you",
    body: "Import a Canny posts CSV. Preview how each column maps and any problems before you commit — and re-importing the same file never creates duplicates.",
    formats: ["Canny posts CSV"],
    points: [
      "Vote totals come across as imported counts — Canny's CSV has no voter identities",
      "Imported boards and tags start private, so you can review before going public",
      "Comments aren't in Canny's posts CSV, so they aren't imported",
    ],
  },
  ownership: {
    kicker: "Open source, open data",
    title: "Your feedback stays portable",
    body: "Feedback is free and open source under the AGPL-3.0, and its data follows Fider's shapes, so your boards can move to Fider or anywhere else.",
    points: [
      {
        icon: Download,
        title: "Fider-compatible export",
        body: "Download a full versioned JSON export, or just the Fider mapping: users, posts, votes, comments and tags.",
      },
      {
        icon: Webhook,
        title: "Signed webhooks",
        body: "Send post.created and status.changed to your own tools, signed with HMAC, with a test send and a delivery log.",
      },
      {
        icon: ScrollText,
        title: "An audit log",
        body: "Every change is recorded. When the team edits a post's wording, the previous text is kept in the log.",
      },
      {
        icon: EyeOff,
        title: "Private where it matters",
        body: "Public pages never show who voted. Voter lists are for owners and admins only.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "Good to know",
    items: [
      {
        q: "Do voters get an email when their idea ships?",
        a: "Not yet. No email provider is connected, so status changes show an honest \"not connected\" notice for subscribers. The roadmap and changelog are public for everyone to follow.",
      },
      {
        q: "Can I import my Canny board?",
        a: "Yes, from a Canny posts CSV with a preview first. Vote totals come across as imported counts because the CSV has no voter identities, and comments aren't included in that file.",
      },
      {
        q: "Is it compatible with Fider?",
        a: "The data follows Fider's shapes, and the export includes a Fider mapping. Each board exports as one Fider instance.",
      },
      {
        q: "Can a board be private?",
        a: "Yes. Boards are public or private, and private boards are never shown to signed-out visitors.",
      },
      {
        q: "Is there single sign-on?",
        a: "Not yet. People sign in with a Feedback account using email or Google.",
      },
      {
        q: "What does it cost?",
        a: "Feedback is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Start listening in public",
    body: "Create a board, share the link and watch the first votes come in.",
    label: "Create your board",
  },
  signIn: {
    title: "Ideas in. Changelog out.",
    body: "Sign in to your workspace, or create one and open your first board.",
    points: [
      "Public boards with one vote per person",
      "A roadmap and changelog people can follow",
      "Canny import and a Fider-compatible export",
    ],
  },
  footer: {
    tagline: "Open-source feedback boards, roadmap and changelog — with data that stays portable.",
  },
};
