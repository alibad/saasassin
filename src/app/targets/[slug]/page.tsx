import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, GitFork, TriangleAlert } from "lucide-react";

import { InterestForm } from "@/components/interest-form";
import { ScoreRing } from "@/components/score-ring";
import { StatusPill, StrategyPill } from "@/components/strategy-pill";
import { getSeededTargetSlugs, getTargetBySlug } from "@/lib/data";

const scoreLabels = {
  economicPain: ["Economic pain", 25],
  demand: ["Demand evidence", 15],
  tractability: ["MVP tractability", 20],
  ossWhitespace: ["Open-source whitespace", 20],
  portability: ["Data portability", 10],
  economics: ["Sustainable economics", 10],
} as const;

export function generateStaticParams() {
  return getSeededTargetSlugs();
}

export async function generateMetadata({
  params,
}: PageProps<"/targets/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const target = await getTargetBySlug(slug);

  if (!target) {
    return { title: "Target not found" };
  }

  return {
    title: `${target.name} displacement brief`,
    description: target.summary,
  };
}

export default async function TargetPage({ params }: PageProps<"/targets/[slug]">) {
  const { slug } = await params;
  const target = await getTargetBySlug(slug);

  if (!target) {
    notFound();
  }

  return (
    <main>
      <section className="target-detail-hero">
        <div className="shell">
          <Link className="back-link" href="/catalog">
            <ArrowLeft aria-hidden="true" size={16} />
            Back to all targets
          </Link>

          <div className="target-title-grid">
            <div>
              <div className="pill-row">
                <span className="rank-label">#{String(target.rank).padStart(2, "0")}</span>
                <StatusPill status={target.status} />
                <StrategyPill strategy={target.strategy} />
              </div>
              <p className="eyebrow">{target.category}</p>
              <h1>{target.name}</h1>
              <p className="target-detail-lede">{target.summary}</p>
            </div>
            <div className="target-score-panel">
              <ScoreRing score={target.score} size="large" />
              <span>Displacement attractiveness</span>
              <small>Research judgment, not market telemetry</small>
            </div>
          </div>
        </div>
      </section>

      <section className="target-brief-section">
        <div className="shell target-brief-grid">
          <div className="target-brief-main">
            <article className="brief-block brief-lead">
              <p className="eyebrow">Why now</p>
              <h2>{target.whyNow}</h2>
              <div className="price-signal-large">
                <span>Public spend signal</span>
                <strong>{target.priceSignal}</strong>
                <a href={target.sourceUrl} target="_blank" rel="noreferrer">
                  View source
                  <ArrowUpRight aria-hidden="true" size={15} />
                </a>
              </div>
            </article>

            <article className="brief-block">
              <p className="eyebrow">The opening wedge</p>
              <h2>Win the migration before chasing parity.</h2>
              <p>{target.wedge}</p>
            </article>

            <div className="brief-two-column">
              <article className="brief-block">
                <GitFork aria-hidden="true" size={22} />
                <p className="eyebrow">Open-source position</p>
                <p>{target.ossLandscape}</p>
                {target.challengerUrl ? (
                  <a href={target.challengerUrl} target="_blank" rel="noreferrer">
                    Explore {target.challengerName}
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </a>
                ) : null}
              </article>
              <article className="brief-block risk-block">
                <TriangleAlert aria-hidden="true" size={22} />
                <p className="eyebrow">Hard truth</p>
                <p>{target.risk}</p>
              </article>
            </div>

            <article className="brief-block">
              <p className="eyebrow">Recommended move</p>
              <h2>{target.recommendedMove}</h2>
              <ul className="milestone-list">
                {target.milestones.map((milestone) => (
                  <li key={milestone}>
                    <Check aria-hidden="true" size={17} />
                    {milestone}
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <aside className="target-sidebar">
            <section className="scorecard">
              <p className="eyebrow">Scorecard</p>
              {Object.entries(scoreLabels).map(([key, [label, maximum]]) => {
                const value = target.metrics[key as keyof typeof target.metrics];
                return (
                  <div key={key} className="score-line">
                    <div>
                      <span>{label}</span>
                      <strong>
                        {value}/{maximum}
                      </strong>
                    </div>
                    <div className="score-track">
                      <span style={{ width: `${(value / maximum) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="join-panel">
              <p className="eyebrow">Join {target.phase}</p>
              <h2>Help move this from thesis to migration.</h2>
              <p>
                Builders, maintainers, design partners, and sponsors all enter through
                the same mission brief.
              </p>
              {target.slug === "canny" ? (
                <Link className="join-mission-link" href="/missions/canny-fider">
                  Open the full Canny → Fider mission
                  <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              ) : null}
              <InterestForm target={target.slug} targetName={target.name} />
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
