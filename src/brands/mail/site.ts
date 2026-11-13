import {
  AlarmClock,
  BellOff,
  Download,
  Filter,
  ListChecks,
  Rows3,
  ScrollText,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Mail homepage copy. Claims trace to docs/fleet/status/mail.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "Shortcuts", href: "#shortcuts" },
    { label: "Import", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Keyboard-first email",
    title: "Get through email at the speed of your keyboard.",
    emphasis: "your keyboard",
    lede:
      "Import your mail and triage it without touching the mouse: j and k to move, e to mark done, h to snooze, / to search. Split inboxes, follow-ups, filters and bulk actions you can undo.",
    primaryCta: "Get started",
    secondaryCta: { label: "See the shortcuts", href: "#shortcuts" },
    note: "Free and open source. Works with .eml and .mbox exports today; live Gmail and Microsoft sync isn't switched on yet.",
  },
  features: {
    kicker: "Built for triage",
    title: "Everything you need to get through the pile",
    lede: "Every action has a key, every key is listed in the command palette, and almost everything can be undone.",
    items: [
      {
        icon: Rows3,
        title: "Split inbox",
        body: "Rule-based splits for calendar invites, newsletters, senders, labels or subjects, each with unread and total counts. Tab cycles through them.",
      },
      {
        icon: AlarmClock,
        title: "Snooze and follow-ups",
        body: "h hides a thread until the time you pick, and new mail wakes it early. f brings a thread back only if nobody replied.",
      },
      {
        icon: Filter,
        title: "Filters you can test first",
        body: "Rules on sender, recipients, subject, list or attachments that label, archive, star or skip the inbox — tested against your existing mail before you save.",
      },
      {
        icon: ListChecks,
        title: "Bulk triage with exact undo",
        body: "x selects and Shift+J/K extends. Archive, trash, star or label the whole selection, and z undoes it exactly.",
      },
      {
        icon: BellOff,
        title: "Mute and unsubscribe",
        body: "m mutes a thread so later replies never bring it back. Newsletters show their unsubscribe options, and nothing is ever requested on your behalf.",
      },
      {
        icon: Search,
        title: "Search with operators",
        body: "from:, to:, cc:, subject:, has:invite and has:attachment, answered from an index of every imported message.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From an export to an empty inbox",
    items: [
      { title: "Create a workspace", body: "Sign in and create a mail workspace. Invite teammates as admins, members or read-only viewers." },
      { title: "Import your mail", body: "Upload .eml files or an .mbox export. Messages are threaded and de-duplicated by Message-ID, so importing twice is safe." },
      { title: "Shape the inbox", body: "Add splits and filters, test them against existing mail, and let them run on every import." },
      { title: "Triage from the keyboard", body: "Move, mark done, snooze, mute, label and reply without reaching for the mouse. z undoes the last action." },
    ],
  },
  importer: {
    kicker: "Bring your mail",
    title: "Start with the mail you already have",
    body: "Export from your current mail client as .mbox or .eml and upload it. Mail is parsed on the server, rebuilt into threads and kept with its import history.",
    formats: [".mbox", ".eml"],
    points: [
      "Threads rebuilt from message headers, even when a reply arrives before its parent",
      "Re-importing the same mail never creates duplicates",
      "Your filters run on every import, so new mail lands where it belongs",
    ],
  },
  ownership: {
    kicker: "Open source",
    title: "Email software you can actually inspect",
    body: "Mail is free and open source under the AGPL-3.0. Read the code that touches your messages, and export everything whenever you want.",
    points: [
      {
        icon: ShieldCheck,
        title: "Safe by default",
        body: "Email HTML is never rendered. Messages show as text, so remote images and tracking pixels never load.",
      },
      {
        icon: Download,
        title: "A complete export",
        body: "Threads, messages, drafts, splits, snippets, filters, contacts, settings, members and the audit log, in one download.",
      },
      {
        icon: ScrollText,
        title: "An append-only audit log",
        body: "Every change in a shared workspace is recorded, and admins can read the whole trail.",
      },
      {
        icon: UsersRound,
        title: "Roles for shared inboxes",
        body: "Admins, members and viewers. Viewers can read every thread but never change one.",
      },
    ],
  },
  faq: {
    kicker: "FAQ",
    title: "Before you switch",
    items: [
      {
        q: "Does it connect to Gmail or Outlook?",
        a: "Not yet. Today you import .eml or .mbox files. Live Gmail and Microsoft sync need OAuth apps that aren't switched on, and the app shows that state plainly instead of pretending.",
      },
      {
        q: "Can I send email from Mail?",
        a: "Not yet. You can reply, write drafts with snippets and queue send-later drafts, but nothing is sent until a sending provider is connected. Every draft says so.",
      },
      {
        q: "Why are emails shown as text?",
        a: "Mail never renders email HTML, so remote images and tracking pixels never load. It's a deliberate safety choice.",
      },
      {
        q: "Which keyboard shortcuts are there?",
        a: "j/k move, Enter opens, e marks done, # trashes, s stars, u toggles read, h snoozes, f sets a follow-up, m mutes, l labels, r replies, c composes, / searches and z undoes. ⌘K or ? shows everything else.",
      },
      {
        q: "Are attachments kept?",
        a: "Attachments are listed on each message but not stored yet, and very large raw messages are skipped on import.",
      },
      {
        q: "What does it cost?",
        a: "Mail is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Your inbox, one keystroke at a time",
    body: "Create a workspace, import an .mbox export and triage it without touching the mouse.",
    label: "Get started",
  },
  signIn: {
    title: "Your inbox, at keyboard speed.",
    body: "Sign in to Mail, or create a workspace and import your first export.",
    points: ["Split inbox, snooze and follow-ups", "Bulk triage with exact undo", "Mail shown as text: no tracking pixels"],
  },
  footer: {
    tagline: "Keyboard-first email triage, free and open source.",
  },
};
