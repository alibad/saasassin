export const siteConfig = {
  name: "SaaSassin",
  shortName: "SaaSassin",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "A catalog and public roadmap for AI-native builders replacing expensive closed SaaS with credible open-source products.",
  promise: "Pick a target. Ship the exit.",
} as const;
