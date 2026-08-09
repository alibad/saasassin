import type { Metadata } from "next";

import { CatalogExplorer } from "@/components/catalog-explorer";
import { getCatalogSnapshot } from "@/lib/data";

export const metadata: Metadata = {
  title: "Target catalog",
  description:
    "Explore the ranked SaaS products SaaSassin believes AI-native open-source teams can credibly displace.",
};

export default async function CatalogPage() {
  const catalog = await getCatalogSnapshot();

  return (
    <main>
      <section className="page-hero catalog-hero">
        <div className="shell">
          <div className="page-hero-grid">
            <div>
              <p className="eyebrow">Target catalog / v0.1</p>
              <h1>Ten products worth putting under pressure.</h1>
            </div>
            <div className="page-hero-aside">
              <p>
                Scores combine economic pain, public demand, buildability,
                open-source whitespace, data portability, and sustainable operating
                economics.
              </p>
              <span className="data-source-badge">
                {catalog.source === "firestore" ? "Live from Firestore" : "Seed dataset"}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section catalog-section">
        <div className="shell">
          <CatalogExplorer targets={catalog.items} />
        </div>
      </section>
    </main>
  );
}
