export const siteConfig = {
  name: "SaaSassin",
  shortName: "SaaSassin",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "A catalog and public roadmap for AI-native builders replacing expensive closed SaaS with credible open-source products.",
  promise: "Pick a target. Ship the exit.",
} as const;

/**
 * Public source repositories, in one place. Every product is developed in the monorepo, and
 * scripts/publish-products.mjs publishes each one as its own repository (alibad/saasassin-<slug>).
 * Product sites link to their own repository; Performance still points at the monorepo because
 * the Lattice comparison links to files there. Change an entry here and every "Read the source"
 * link follows.
 */
export const sourceRepositories = {
  saasassin: "https://github.com/alibad/saasassin",
  performance: "https://github.com/alibad/saasassin",
  research: "https://github.com/alibad/saasassin-research",
  planner: "https://github.com/alibad/saasassin-planner",
  creator: "https://github.com/alibad/saasassin-creator",
  feedback: "https://github.com/alibad/saasassin-feedback",
  studies: "https://github.com/alibad/saasassin-studies",
  revenue: "https://github.com/alibad/saasassin-revenue",
  community: "https://github.com/alibad/saasassin-community",
  mail: "https://github.com/alibad/saasassin-mail",
  trust: "https://github.com/alibad/saasassin-trust",
} as const;

/** Link to a file on the default branch of a source repository. */
export function sourceFileUrl(repository: string, repoRelativePath: string) {
  return `${repository}/blob/main/${repoRelativePath}`;
}
