import { sourceRepositories } from "@/lib/app-config";

import type { BrandSlug } from "./types";

/**
 * In-app links for a product. They use the internal paths (`/apps/<slug>`, `/lattice` for
 * Performance), which work on saasassin.net, on the product's own host (src/lib/fleet/routing.ts)
 * and in a standalone repository.
 */
export function productLinks(slug: BrandSlug) {
  const home = slug === "performance" ? "/lattice" : `/apps/${slug}`;
  return { home, signIn: `${home}/sign-in` };
}

/** The product's public source repository (src/lib/app-config.ts). */
export function productRepository(slug: BrandSlug): string {
  return sourceRepositories[slug];
}
