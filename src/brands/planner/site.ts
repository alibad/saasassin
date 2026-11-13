import {
  CalendarClock,
  Download,
  GitCompareArrows,
  History,
  Lock,
  Lightbulb,
  ScrollText,
  Webhook,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Planner homepage copy. Claims trace to docs/fleet/status/planner.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Calendars", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Auto-scheduling you can explain",
    title: "Plan the week you can actually finish.",
    emphasis: "actually finish",
    lede:
      "Capture tasks with estimates and deadlines, add your meetings, and Planner lays out a realistic week. Every block says why it landed there, and anything you lock stays exactly where you put it.",
    primaryCta: "Plan your week",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source. Bring meetings in from any .ics calendar export.",
  },
  features: {
    kicker: "Why it's different",
    title: "A scheduler that shows its work",
    lede: "Planner is a deterministic engine, not a black box: the same tasks, meetings and hours always produce the same plan.",
    items: [
      {
        icon: Lightbulb,
        title: "Every block explains itself",
        body: "Open any scheduled block to see why it's there: the deadline it protects, the task it waits on, the focus hours it fits.",
        points: ["Dependencies are always scheduled in order", "Late or impossible work is flagged, not hidden"],
      },
      {
        icon: Lock,
        title: "Locks always win",
        body: "Pin a block to a time and every re-plan works around it. Completed work is kept, so re-planning never undoes your day.",
        points: ["Locked blocks keep their exact time in every new version", "Nothing is ever scheduled on top of them"],
      },
      {
        icon: GitCompareArrows,
        title: "Try a what-if before you commit",
        body: "Preview a re-plan as a diff — what moves, what's added, what slips — without saving a plan or touching your history.",
        points: ["Restore any earlier plan version in one step"],
      },
      {
        icon: CalendarClock,
        title: "Focus hours that never cost a deadline",
        body: "Mark work as deep or shallow and set preferred focus hours. Planner keeps deep work inside them, unless that would make it late — and then says so.",
        points: ["Workspace default hours, plus each person's own", "Repeating tasks planned day by day"],
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "From to-do list to a week on the calendar",
    items: [
      { title: "Set your hours", body: "Working hours, time zone and focus windows for the workspace — and for each person." },
      { title: "Capture tasks", body: "Quick capture, then add estimates, deadlines, priorities, dependencies and repeats." },
      { title: "Add your meetings", body: "Block meetings by hand or import an .ics export as busy time for everyone or one person." },
      { title: "Run the scheduler", body: "Get an explainable plan, lock what matters, preview a what-if and save a new version." },
    ],
  },
  importer: {
    kicker: "Bring your calendar",
    title: "Your meetings, already on the plan",
    body: "Export your calendar as .ics from Google Calendar, Outlook or Apple Calendar and import it as busy time — for the whole workspace or one person. Re-importing updates what changed instead of duplicating it.",
    formats: [".ics", "Google Calendar export", "Outlook export", "Apple Calendar export"],
    points: [
      "Recurring meetings, time zones, exceptions and moved instances are understood",
      "Import for everyone, or as one person's busy time",
      "Re-import the same calendar and only the changes are applied",
    ],
  },
  ownership: {
    kicker: "Open source",
    title: "A planner you can audit",
    body: "Planner is free and open source under the AGPL-3.0. Read exactly how the scheduler decides, and take every task and plan with you.",
    points: [
      {
        icon: Download,
        title: "Export everything",
        body: "Download the workspace as JSON — tasks, plans, meetings, settings — or your plan as an .ics calendar.",
      },
      {
        icon: History,
        title: "Every plan is a version",
        body: "Each run saves an immutable plan version with a fingerprint. Restore an earlier one without losing the rest.",
      },
      {
        icon: Webhook,
        title: "Signed webhooks",
        body: "Send plan.applied and task.at_risk to your own tools, signed with HMAC, with a delivery log that records failures honestly.",
      },
      {
        icon: ScrollText,
        title: "An audit trail",
        body: "Every change to tasks, hours, plans and team settings is recorded, and admins can read it.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "Before you plan your first week",
    items: [
      {
        q: "Does it sync live with Google Calendar or Outlook?",
        a: "Not yet. Today you import an .ics export and re-import it to update. Live Google and Microsoft sync needs OAuth apps that aren't connected, and the app says \"connection not configured\" rather than pretending.",
      },
      {
        q: "Is there AI in the scheduler?",
        a: "No. Scheduling is a deterministic engine: the same inputs always give the same plan, and every block carries its reason. There's no AI intent parsing today.",
      },
      {
        q: "What happens when my day changes?",
        a: "Run the scheduler again. Locked blocks stay exactly where they are, completed work is kept, and you can preview a what-if before saving — or restore an earlier version.",
      },
      {
        q: "Does it send reminders?",
        a: "Not yet. There are no reminder emails or notifications. Signed webhooks for plan.applied and task.at_risk let you connect your own.",
      },
      {
        q: "Can my team plan together?",
        a: "Yes. Invite teammates with roles; admins set capacity and assign work, and assigned tasks are planned in that person's lane. Everyone can set their own focus hours.",
      },
      {
        q: "What does it cost?",
        a: "Planner is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Plan a week you can finish",
    body: "Set your hours, capture your tasks, add your meetings and let Planner lay out the week — with a reason for every block.",
    label: "Plan your week",
  },
  signIn: {
    title: "Your week, planned and explained.",
    body: "Sign in to your workspace, or create one and plan your first week.",
    points: ["A reason for every scheduled block", "Locks that never move", "What-if previews before you commit"],
  },
  footer: {
    tagline: "Open-source auto-scheduling that explains every block it places.",
  },
};
