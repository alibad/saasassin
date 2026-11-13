import {
  CalendarDays,
  Download,
  EyeOff,
  FileCode2,
  GraduationCap,
  KeyRound,
  MessagesSquare,
  ScrollText,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Community homepage copy. Claims trace to docs/fleet/status/community.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "From Circle", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "The community platform",
    title: "A home for your members that you actually own.",
    emphasis: "you actually own",
    lede:
      "Spaces, threads, events and courses for your members, with real moderation, member privacy and a full export. Bring your members and posts over from Circle when you're ready.",
    primaryCta: "Start your community",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source (AGPL-3.0).",
  },
  features: {
    kicker: "Everything in one place",
    title: "Conversations, events and courses under one roof",
    lede: "Members get a feed that feels alive. You get the controls to keep it kind.",
    items: [
      {
        icon: MessagesSquare,
        title: "Spaces and threads",
        body: "Discussion, announcement and event spaces. Members post, reply in threads, react with Like, Celebrate or Insightful, save posts and search — the feed loads page by page.",
      },
      {
        icon: CalendarDays,
        title: "Events with RSVPs",
        body: "Members RSVP and add events to their calendar with an .ics file. Moderators check people in at the door.",
      },
      {
        icon: GraduationCap,
        title: "Courses and cohorts",
        body: "Group members into cohorts, unlock lessons a set number of days after each cohort starts, and award a certificate when they finish.",
      },
      {
        icon: KeyRound,
        title: "Private spaces and plans",
        body: "Open a space to a hand-picked list, whole cohorts or a membership plan. Plan access is granted and revoked by hand, with an immutable history.",
      },
      {
        icon: ShieldCheck,
        title: "Moderation that keeps receipts",
        body: "Pin, close, remove with a reason and restore. A reports queue, one appeal per removal, a posting limit to slow floods, and an audit log of every action.",
      },
      {
        icon: EyeOff,
        title: "Privacy members can feel",
        body: "Members pick an @handle and never see each other's email. They can mute or block someone, and the other person is never told.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From an empty space to a busy one",
    items: [
      {
        title: "Create your community",
        body: "Add discussion, announcement and event spaces, order them, and decide who can see each one.",
      },
      {
        title: "Invite people",
        body: "Share an invite link — switch it off or replace it any time — or add existing accounts by email with a role.",
      },
      {
        title: "Bring your history",
        body: "Import members and posts from Circle's CSV exports. Imported people wait as pending invites until they join.",
      },
      {
        title: "Run it together",
        body: "Moderators work the reports and appeals queues; owners and admins see every change in the audit log.",
      },
    ],
  },
  importer: {
    kicker: "Switching from Circle?",
    title: "Bring your members and posts from Circle",
    body: "Upload Circle's members CSV, posts CSV or both. A preview shows what will be invited, imported, matched, created and skipped — and why — before anything is written.",
    formats: ["Circle members CSV", "Circle posts CSV"],
    points: [
      "Members become pending invites: no accounts are created and nobody is emailed",
      "Run the same files again and nothing is imported twice",
      "When someone joins with their imported email, their profile and posts become theirs",
    ],
  },
  ownership: {
    kicker: "Open source",
    title: "Your community, your data",
    body: "Community is free and open source under the AGPL-3.0. Every space, post, member, event and audit record can leave with you in one export.",
    points: [
      {
        icon: Download,
        title: "A complete export",
        body: "Owners and admins download the whole community as versioned JSON: a manifest plus 23 typed files.",
      },
      {
        icon: ScrollText,
        title: "An audit trail",
        body: "Every change is recorded. Moderators see members' public names in the log, never their emails.",
      },
      {
        icon: UserCheck,
        title: "Roles enforced on the server",
        body: "Owners, admins, moderators and members, checked on every request. Private posts answer “not found”, not “forbidden”.",
      },
      {
        icon: FileCode2,
        title: "Code you can read",
        body: "The full source is public, so you can see exactly how member data is handled.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "What community builders ask",
    items: [
      {
        q: "Can I charge for membership?",
        a: "Not yet. Membership plans unlock private spaces, but checkout isn't connected: owners grant and revoke plan access by hand, and every change is kept in the access history.",
      },
      {
        q: "Does it send email notifications?",
        a: "No. Replies and @mentions land in each member's in-app inbox. Email notifications and digests aren't built yet, so you share invite links yourself.",
      },
      {
        q: "What comes across from Circle?",
        a: "Members (as pending invites) and posts, from Circle's CSV exports — up to 5,000 members and 2,000 posts per run. Comments, reactions and direct messages aren't imported.",
      },
      {
        q: "Can members see each other's email addresses?",
        a: "No. Members appear by name and @handle. Only owners and admins see emails: in the member list, pending invites, the export and the full audit log.",
      },
      {
        q: "How does moderation work?",
        a: "Moderators pin posts, close comments, remove posts with a reason and restore them, and work the reports and appeals queues. A per-member posting limit slows floods; moderators are exempt from it.",
      },
      {
        q: "What does it cost?",
        a: "Community is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Give your members a place to gather",
    body: "Create a community, open your first spaces and share the invite link.",
    label: "Start your community",
  },
  signIn: {
    title: "Your members are waiting.",
    body: "Sign in to your community, or start a new one.",
    points: [
      "Spaces, threads, events and courses in one place",
      "Moderation with reasons, appeals and an audit log",
      "Export the whole community whenever you want",
    ],
  },
  footer: {
    tagline: "The open-source community platform for spaces, events and courses.",
  },
};
