import { brand as community } from "../../brands/community/brand";
import { brand as creator } from "../../brands/creator/brand";
import { brand as feedback } from "../../brands/feedback/brand";
import { brand as mail } from "../../brands/mail/brand";
import { brand as performance } from "../../brands/performance/brand";
import { brand as planner } from "../../brands/planner/brand";
import { brand as research } from "../../brands/research/brand";
import { brand as revenue } from "../../brands/revenue/brand";
import { brand as studies } from "../../brands/studies/brand";
import { brand as trust } from "../../brands/trust/brand";

import type { Brand, BrandSlug } from "./types";

/**
 * All ten brands as data, for code that spans products (tests, the saasassin.net fleet pages).
 * Product routes import their own `@/brands/<slug>/…` modules directly instead, so a product —
 * and its standalone repository from scripts/export-product.mjs — never carries the others.
 */
export const brands: Record<BrandSlug, Brand> = {
  performance,
  research,
  planner,
  creator,
  feedback,
  studies,
  revenue,
  community,
  mail,
  trust,
};

export const brandSlugs = Object.keys(brands) as BrandSlug[];

export function getBrand(slug: string): Brand | null {
  return (brands as Record<string, Brand>)[slug] ?? null;
}
