import { describe, expect, it } from "vitest";

import { comparisons, getComparison, getComparisonForTarget } from "../src/data/comparisons";
import targetsSeed from "../src/data/targets.json";
import { comparisonJsonLd, serializeJsonLd } from "../src/lib/compare/structured-data";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const catalogSlugs = new Set(targetsSeed.map((target) => target.slug));

describe("comparison data files", () => {
  it("has unique, URL-safe slugs and interest sources", () => {
    const slugs = comparisons.map((comparison) => comparison.slug);
    const sources = comparisons.map((comparison) => comparison.interest.source);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(sources).size).toBe(sources.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    for (const source of sources) expect(source).toMatch(/^compare-[a-z0-9-]+$/);
  });

  for (const comparison of comparisons) {
    describe(comparison.slug, () => {
      it("cites a dated, public source for every competitor cell", () => {
        for (const row of comparison.rows) {
          expect(row.sources.length, row.capability).toBeGreaterThan(0);
          for (const source of row.sources) {
            expect(source.url, row.capability).toMatch(/^https:\/\//);
            expect(source.accessed, row.capability).toMatch(isoDate);
          }
        }
      });

      it("keeps SEO copy inside search-result limits", () => {
        expect(`${comparison.seo.title} | SaaSassin`.length).toBeLessThanOrEqual(60);
        expect(comparison.seo.description.length).toBeLessThanOrEqual(155);
      });

      it("dates its prices and files interest against a real catalog target", () => {
        expect(comparison.lastVerified).toMatch(isoDate);
        expect(comparison.pricing.asOf).toMatch(isoDate);
        expect(comparison.pricing.sourceUrl).toMatch(/^https:\/\//);
        expect(comparison.pricing.modules.some((module) => module.required)).toBe(true);
        expect(comparison.pricing.seats.min).toBeLessThan(comparison.pricing.seats.max);
        expect(catalogSlugs.has(comparison.interest.target)).toBe(true);
      });

      it("never claims what story.md says we cannot claim yet", () => {
        const copy = JSON.stringify(comparison).toLowerCase();
        for (const banned of ["free forever", "soc 2 compliant", "gdpr compliant", "feature parity", "full lattice replacement"]) {
          expect(copy.includes(banned), banned).toBe(false);
        }
        // Self-hosting may only be described as coming, never as available today.
        expect(copy.match(/self-host it (from|on|today)|self-host in \d|\d+ minutes to self-host/)).toBeNull();
      });

      it("links the trademark line and the Talk to us anchor", () => {
        expect(comparison.trademark).toContain("not affiliated with or endorsed by");
        expect(comparison.ctas.talk.href).toBe("#talk-to-us");
      });
    });
  }

  it("looks comparisons up by slug and by catalog target", () => {
    expect(getComparison("lattice")?.competitorName).toBe("Lattice");
    expect(getComparison("nope")).toBeNull();
    expect(getComparisonForTarget("lattice")?.slug).toBe("lattice");
    expect(getComparisonForTarget("canny")).toBeNull();
  });
});

describe("comparison JSON-LD", () => {
  it("describes the product at price 0, every FAQ and a three-step breadcrumb with absolute URLs", () => {
    const comparison = getComparison("lattice");
    expect(comparison).not.toBeNull();
    if (!comparison) return;
    const [application, faq, breadcrumb] = comparisonJsonLd(comparison, "https://saasassin.net");

    expect(application["@type"]).toBe("SoftwareApplication");
    expect(application.offers).toMatchObject({ price: "0", priceCurrency: "USD" });
    expect(application).not.toHaveProperty("aggregateRating");
    expect(faq["@type"]).toBe("FAQPage");
    expect(faq.mainEntity).toHaveLength(comparison.faq.length);
    expect(breadcrumb.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: "https://saasassin.net/" },
      { "@type": "ListItem", position: 2, name: "Compare", item: "https://saasassin.net/compare" },
      { "@type": "ListItem", position: 3, name: "Lattice", item: "https://saasassin.net/compare/lattice" },
    ]);
  });

  it("escapes < so a string can never close the script tag", () => {
    const serialized = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized).name).toBe("</script><script>alert(1)</script>");
  });
});
