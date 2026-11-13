import {
  Award,
  BarChart3,
  CalendarClock,
  Download,
  Globe,
  LayoutList,
  ListChecks,
  MailCheck,
  ScrollText,
  UsersRound,
} from "lucide-react";

import type { ProductSite } from "@/lib/brand/types";

/** Creator homepage copy. Claims trace to docs/fleet/status/creator.md. */
export const site: ProductSite = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "From Kajabi", href: "#switch" },
    { label: "FAQ", href: "#faq" },
  ],
  hero: {
    kicker: "Online courses you own",
    title: "Teach what you know. Own everything you build.",
    emphasis: "Own everything you build.",
    lede:
      "Build courses with modules, lessons, video, quizzes and drip schedules. Publish a landing page and a catalog, enroll learners, follow their progress and award certificates — then export your whole school whenever you like.",
    primaryCta: "Create your school",
    secondaryCta: { label: "See how it works", href: "#how-it-works" },
    note: "Free and open source. Free enrollment today; paid checkout isn't connected yet.",
  },
  features: {
    kicker: "Everything a course needs",
    title: "From first lesson to finished certificate",
    lede: "The parts of a course business that matter to learners, built to work together.",
    items: [
      {
        icon: LayoutList,
        title: "A course builder that keeps up",
        body: "Modules and lessons you can reorder, lesson text, YouTube, Vimeo or Loom video, and a preview of every lesson as your learners see it.",
      },
      {
        icon: CalendarClock,
        title: "Drip that's really enforced",
        body: "Unlock a lesson a set number of days after enrollment. Locked lessons never reach the learner's browser until their day comes.",
      },
      {
        icon: ListChecks,
        title: "Quizzes scored on the server",
        body: "Attach a scored quiz to any lesson. Answers are never sent to learners, so the score is one you can trust.",
      },
      {
        icon: Globe,
        title: "A landing page and a catalog",
        body: "Every published course gets a public landing page, your school gets a catalog, and visitors can join your email list with clear consent.",
      },
      {
        icon: Award,
        title: "Progress, discussion, certificates",
        body: "Learners mark lessons done, discuss each lesson with each other, and open a printable certificate when they finish.",
      },
      {
        icon: BarChart3,
        title: "Analytics with the maths shown",
        body: "Enrollments over time, completion rate, a per-lesson funnel, the drop-off lesson and quiz pass rates — each with its definition on screen.",
      },
    ],
  },
  steps: {
    kicker: "How it works",
    title: "Four steps from idea to enrolled learners",
    items: [
      { title: "Build the course", body: "Add modules and lessons, write, embed video, set drip days and attach quizzes." },
      { title: "Publish", body: "Move it from draft to published. The landing page and your catalog update at once." },
      { title: "Enroll learners", body: "Learners enroll for free from the landing page, or you bulk-enroll existing accounts by email." },
      { title: "Watch them finish", body: "Follow progress and quiz results, moderate discussions, and see where people drop off." },
    ],
  },
  importer: {
    kicker: "Switching from Kajabi?",
    title: "Bring your Kajabi courses across",
    body: "Paste or upload a Kajabi-style CSV (Product, Category and Post columns) or a JSON export. Review the column mapping, warnings and errors, then import every course as a draft in one audited batch.",
    formats: ["Kajabi CSV", "Kajabi JSON"],
    points: [
      "Nothing is written until you confirm the preview",
      "Every course arrives as a draft you can review before publishing",
      "Course content only today — customers, offers and subscriptions aren't imported",
    ],
  },
  ownership: {
    kicker: "Open source",
    title: "Your school, on your terms",
    body: "Creator is free and open source under the AGPL-3.0. Your courses, learners and email list are yours, and they leave with you in one file.",
    points: [
      {
        icon: Download,
        title: "One-file export",
        body: "Download the whole school as versioned JSON: courses, enrollments, leads, comments, team and audit.",
      },
      {
        icon: MailCheck,
        title: "Consent you can show",
        body: "Email-list sign-ups need explicit consent. When someone withdraws, the record of the removal stays — not their address.",
      },
      {
        icon: UsersRound,
        title: "Team roles",
        body: "Owners and admins publish, export and manage access; members draft, edit and moderate; viewers read.",
      },
      {
        icon: ScrollText,
        title: "Every change audited",
        body: "Publishing, archiving, access changes and moderation are written to an audit log you can read.",
      },
    ],
  },
  faq: {
    kicker: "Questions",
    title: "What creators ask first",
    items: [
      {
        q: "Can I sell my courses?",
        a: "Not yet. You can set a price, but checkout isn't connected: a paid course says \"Payments not connected\" and nobody can be charged. Free enrollment works today.",
      },
      {
        q: "Does it email my learners?",
        a: "Not yet. Email-list sign-ups are stored with consent and included in your export, but no email provider is connected, so nothing is sent.",
      },
      {
        q: "What can I bring over from Kajabi?",
        a: "Course content: products, categories and posts from a CSV or JSON export, previewed before anything is written. Customers, offers and subscriptions aren't imported.",
      },
      {
        q: "Where do my lesson videos live?",
        a: "Lessons embed video from YouTube, Vimeo or Loom, so you keep hosting them where they are today.",
      },
      {
        q: "Can I take a learner's access away?",
        a: "Yes. Owners and admins can revoke access — progress is kept and re-enrollment is blocked — and restore it later. Both are audited.",
      },
      {
        q: "What does it cost?",
        a: "Creator is free and open source under the AGPL-3.0, and the hosted version has no billing.",
      },
    ],
  },
  cta: {
    title: "Build your first course",
    body: "Create a school, write your first lesson and publish a landing page you can share.",
    label: "Create your school",
  },
  signIn: {
    title: "Teach it. Own it.",
    body: "Sign in to your school, or create one and start your first course.",
    points: [
      "Courses with drip, quizzes and certificates",
      "A public landing page and catalog",
      "Your whole school in one export, any time",
    ],
  },
  footer: {
    tagline: "The open-source course platform where your school, your learners and your content stay yours.",
  },
};
