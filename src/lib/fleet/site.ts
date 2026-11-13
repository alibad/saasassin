/** The public SaaSassin site: research briefs, product decisions and the product fleet. */
export const SAASASSIN_SITE_URL = "https://saasassin.net";

/**
 * Absolute link to a parent-site page. Product code links to the public site absolutely so the
 * link works from a product host and from a generated single-product repository, which does not
 * contain the parent site's routes.
 */
export function getSaasassinSiteUrl(path = "/") {
  return `${SAASASSIN_SITE_URL}${path}`;
}

/** The public research brief and product decision for a product's migration target. */
export function getTargetBriefUrl(targetSlug: string) {
  return getSaasassinSiteUrl(`/targets/${targetSlug}`);
}
