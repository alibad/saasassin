import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleDot,
  FileSearch,
  GitFork,
  Handshake,
  ShieldCheck,
  Users,
} from "lucide-react";

import { MissionInterestForm } from "@/components/mission-interest-form";
import { MissionView, TrackedLink } from "@/components/mission-analytics";
import { getMissionBySlug } from "@/lib/data";

export const metadata: Metadata = {
  title: "Mission 01: Canny to Fider",
  description:
    "Join the public, upstream-first mission to make Fider the easiest credible migration path away from Canny.",
};

const compatibilityRows = [
  {
    area: "Boards and posts",
    input: "Canny board CSV",
    path: "Map into Fider posts and categories",
    status: "Mapped",
  },
  {
    area: "Statuses and tags",
    input: "Canny post export",
    path: "Normalize against the destination instance",
    status: "Mapped",
  },
  {
    area: "Authors",
    input: "Post author fields",
    path: "Preserve attribution where identity can be verified",
    status: "Validate",
  },
  {
    area: "Votes and voters",
    input: "Separate voter exports or API",
    path: "Reconcile identities before creating votes",
    status: "Needs sample",
  },
  {
    area: "Comments",
    input: "Canny API or supplemental export",
    path: "Confirm supported upstream import path",
    status: "Needs alignment",
  },
  {
    area: "Images and attachments",
    input: "Exported URLs and source files",
    path: "Download, verify, and report any loss",
    status: "Investigate",
  },
];

const nonGoals = [
  "No disconnected Fider fork and no new repository presented as the replacement.",
  "No use of Canny proprietary code, private implementation details, or confusing branding.",
  "No broad roadmap, changelog, or SSO work before Fider maintainers accept the scope.",
  "No migration counted until the adopter verifies its data and can reverse the cutover.",
];

export default async function CannyFiderMissionPage() {
  const mission = await getMissionBySlug("canny-fider");

  if (!mission) {
    notFound();
  }

  const projectJsonLd = {
    "@context": "https://schema.org",
    "@type": "Project",
    name: mission.title,
    description: mission.summary,
    url: "https://saasassin.net/missions/canny-fider",
    sameAs: [mission.challengerUrl],
  };

  return (
    <>
      <MissionView mission={mission.slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(projectJsonLd) }}
      />

      <main>
        <section className="mission-hero">
          <div className="shell mission-hero-grid">
            <div>
              <div className="mission-status-line">
                <span>{mission.kicker}</span>
                <span>{mission.status}</span>
                <span>Upstream first</span>
              </div>
              <p className="eyebrow">The proving mission</p>
              <h1>
                Canny <span>→</span> Fider
              </h1>
              <p className="mission-hero-lede">{mission.summary}</p>
              <div className="mission-hero-actions">
                <TrackedLink
                  className="primary-button"
                  event="mission_cta_clicked"
                  href="#join-mission"
                  properties={{ mission: mission.slug, placement: "hero" }}
                >
                  Join Mission 01
                  <ArrowRight aria-hidden="true" size={18} />
                </TrackedLink>
                <a
                  className="text-link mission-hero-link"
                  href={mission.challengerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect Fider
                  <ArrowUpRight aria-hidden="true" size={16} />
                </a>
              </div>
            </div>

            <aside className="mission-gate-card">
              <p className="eyebrow">Current gate</p>
              <h2>Alignment before implementation.</h2>
              <p>{mission.statusNote}</p>
              <div className="mission-gate-metric">
                <span>Exit condition</span>
                <strong>{mission.exitMetric}</strong>
              </div>
            </aside>
          </div>
        </section>

        <section className="mission-score-strip">
          <div className="shell">
            <div>
              <strong>10</strong>
              <span>qualified builders</span>
            </div>
            <div>
              <strong>01</strong>
              <span>design partner</span>
            </div>
            <div>
              <strong>05</strong>
              <span>Canny interviews</span>
            </div>
            <div>
              <strong>03</strong>
              <span>verified migrations</span>
            </div>
          </div>
        </section>

        <section className="section mission-proof-section">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">Why this can work</p>
                <h2>A bounded exit, not a speculative clone.</h2>
              </div>
              <p>
                The first mission is deliberately a “back” strategy: strengthen the
                credible open project, make migration legible, and measure adoption.
              </p>
            </div>

            <div className="mission-proof-grid">
              {mission.proofPoints.map((proof, index) => (
                <article key={proof}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {index === 0 ? (
                    <FileSearch aria-hidden="true" size={24} />
                  ) : index === 1 ? (
                    <GitFork aria-hidden="true" size={24} />
                  ) : (
                    <ShieldCheck aria-hidden="true" size={24} />
                  )}
                  <p>{proof}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section mission-plan-section">
          <div className="shell">
            <div className="mission-plan-heading">
              <div>
                <p className="eyebrow">The mission sequence</p>
                <h2>Four gates. Every claim earned.</h2>
              </div>
              <Link className="text-link" href="/roadmap">
                See the platform roadmap
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>

            <div className="mission-phase-list">
              {mission.phases.map((phase) => (
                <article key={phase.id} className="mission-phase">
                  <div className="mission-phase-marker">
                    <span>{phase.label}</span>
                    <small>{phase.status}</small>
                  </div>
                  <div className="mission-phase-body">
                    <h3>{phase.title}</h3>
                    <ul>
                      {phase.deliverables.map((deliverable) => (
                        <li key={deliverable}>
                          <Check aria-hidden="true" size={16} />
                          {deliverable}
                        </li>
                      ))}
                    </ul>
                    <div>
                      <span>Gate</span>
                      <strong>{phase.exitGate}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section mission-mapping-section">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">Migration hypothesis</p>
                <h2>Preserve what can move. Report what cannot.</h2>
              </div>
              <p>
                This matrix is a discovery artifact, not a compatibility promise. A
                representative export and maintainer input must validate it.
              </p>
            </div>

            <div className="compatibility-table" role="table" aria-label="Migration compatibility hypothesis">
              <div className="compatibility-row compatibility-header" role="row">
                <span role="columnheader">Data area</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Proposed path</span>
                <span role="columnheader">State</span>
              </div>
              {compatibilityRows.map((row) => (
                <div key={row.area} className="compatibility-row" role="row">
                  <strong role="cell">{row.area}</strong>
                  <span role="cell">{row.input}</span>
                  <span role="cell">{row.path}</span>
                  <span className="compatibility-status" role="cell">
                    <CircleDot aria-hidden="true" size={13} />
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section mission-boundary-section">
          <div className="shell mission-boundary-grid">
            <div>
              <p className="eyebrow">Hard boundaries</p>
              <h2>What this mission will not do.</h2>
            </div>
            <ul>
              {nonGoals.map((nonGoal) => (
                <li key={nonGoal}>
                  <span>×</span>
                  {nonGoal}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section mission-roles-section">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">Who is needed now</p>
                <h2>Bring the export or own a bounded problem.</h2>
              </div>
              <p>
                The discovery gate needs evidence and alignment—not a burst of
                uncoordinated pull requests.
              </p>
            </div>
            <div className="mission-role-grid">
              <article>
                <Handshake aria-hidden="true" size={25} />
                <p className="eyebrow">Design partner</p>
                <h3>A real Canny workspace</h3>
                <p>
                  Provide a representative export, define must-keep data, review the
                  loss report, and test a reversible cutover.
                </p>
              </article>
              <article>
                <Users aria-hidden="true" size={25} />
                <p className="eyebrow">Builders</p>
                <h3>Go, TypeScript, data migration</h3>
                <p>
                  Map formats, build deterministic validators, improve deployment,
                  and contribute only within accepted upstream scope.
                </p>
              </article>
              <article>
                <GitFork aria-hidden="true" size={25} />
                <p className="eyebrow">Maintainers</p>
                <h3>Architecture and ownership</h3>
                <p>
                  Set boundaries, identify the right proposal channel, and reject
                  work that would add unsustainable maintenance burden.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="mission-join-section" id="join-mission">
          <div className="shell mission-join-grid">
            <div className="mission-join-copy">
              <p className="eyebrow">Apply to Mission 01</p>
              <h2>Evidence first. Then builders. Then code.</h2>
              <p>
                Current and recent Canny users can volunteer for one of five focused
                interviews. Builders should name the migration or upstream problem
                they can own.
              </p>

              <div className="mission-resource-links">
                <a
                  href="https://github.com/alibad/saasassin/blob/main/docs/missions/canny-fider/charter.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Read the full charter
                  <ArrowUpRight aria-hidden="true" size={15} />
                </a>
                {mission.sources.map((source) => (
                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                    {source.label}
                    <ArrowUpRight aria-hidden="true" size={15} />
                  </a>
                ))}
              </div>
            </div>
            <MissionInterestForm />
          </div>
        </section>
      </main>
    </>
  );
}
