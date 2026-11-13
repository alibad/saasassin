export const siteConfig = {
  name: "SaaSassin",
  shortName: "SaaSassin",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  description:
    "A catalog and public roadmap for AI-native builders replacing expensive closed SaaS with credible open-source products.",
  promise: "Pick a target. Ship the exit.",
} as const;

/**
 * Public source repositories, in one place. Every product lives in the monorepo today;
 * when a product moves to its own repository, change its entry here and every
 * "Read the source" link follows.
 */
export const sourceRepositories = {
  saasassin: "https://github.com/alibad/saasassin",
  performance: "https://github.com/alibad/saasassin",
} as const;

/** Link to a file on the default branch of a source repository. */
export function sourceFileUrl(repository: string, repoRelativePath: string) {
  return `${repository}/blob/main/${repoRelativePath}`;
}
