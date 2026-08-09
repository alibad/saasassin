import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { getRoadmapSnapshot } from "@/lib/data";

export const metadata: Metadata = {
  title: "Public roadmap",
  description:
    "Follow SaaSassin's first missions from catalog launch through verified open-source migrations.",
};

export default async function RoadmapPage() {
  const roadmap = await getRoadmapSnapshot();

  return (
    <main>
      <section className="page-hero roadmap-page-hero">
        <div className="shell page-hero-grid">
          <div>
            <p className="eyebrow">The public roadmap</p>
            <h1>Earn the right to take on harder targets.</h1>
          </div>
          <div className="page-hero-aside">
            <p>
              The sequence begins with an existing open-source project, moves to an
              AI-native greenfield build, then tackles a sensitive-data flagship.
            </p>
            <span className="data-source-badge">
              {roadmap.source === "firestore" ? "Live from Firestore" : "Seed dataset"}
            </span>
          </div>
        </div>
      </section>

      <section className="section roadmap-full-section">
        <div className="shell roadmap-timeline">
          {roadmap.items.map((item) => (
            <article key={item.id} className="roadmap-entry">
              <div className="roadmap-marker">
                <span>{String(item.order).padStart(2, "0")}</span>
              </div>
              <div className="roadmap-entry-body">
                <div className="roadmap-entry-meta">
                  <span className={`roadmap-status status-${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                  <span>{item.window}</span>
                  <span>{item.kicker}</span>
                </div>
                <h2>{item.title}</h2>
                <p className="roadmap-outcome">{item.outcome}</p>

                <div className="roadmap-details">
                  <div>
                    <p className="eyebrow">Deliverables</p>
                    <ul>
                      {item.deliverables.map((deliverable) => (
                        <li key={deliverable}>
                          <Check aria-hidden="true" size={16} />
                          {deliverable}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="exit-gate">
                    <p className="eyebrow">Exit gate</p>
                    <strong>{item.successMetric}</strong>
                    {item.targetSlug ? (
                      <Link href={`/targets/${item.targetSlug}`}>
                        Open mission brief
                        <ArrowRight aria-hidden="true" size={16} />
                      </Link>
                    ) : (
                      <Link href="/catalog">
                        Explore the catalog
                        <ArrowRight aria-hidden="true" size={16} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
