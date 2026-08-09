import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Crosshair,
  GitFork,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { TargetCard } from "@/components/target-card";
import { siteConfig } from "@/lib/app-config";
import { getCatalogSnapshot, getRoadmapSnapshot } from "@/lib/data";

const processSteps = [
  {
    number: "01",
    icon: Crosshair,
    title: "Choose the right target",
    copy: "We rank customer pain, demand, buildability, open-source whitespace, portability, and sustainable economics.",
  },
  {
    number: "02",
    icon: GitFork,
    title: "Pick the honest attack",
    copy: "Build where there is whitespace. Assemble proven primitives. Back maintainers when the challenger already exists.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Verify real displacement",
    copy: "A mission wins through clean-room delivery, successful migrations, retained users, security, and maintenance.",
  },
];

export default async function Home() {
  const [catalog, roadmap] = await Promise.all([
    getCatalogSnapshot(),
    getRoadmapSnapshot(),
  ]);
  const featured = catalog.items.slice(0, 3);
  const activeMission = catalog.items.find((target) => target.status === "Active");

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    description:
      "A coordinated catalog and roadmap for open-source replacements of expensive closed SaaS products.",
    url: siteConfig.url,
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      <main>
        <section className="hero-section">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <div className="hero-kicker">
                <span className="live-dot" />
                Open-source displacement foundry
              </div>
              <h1>
                Pick a target.
                <br />
                <span>Ship the exit.</span>
              </h1>
              <p className="hero-lede">
                SaaSassin coordinates AI-native builders, maintainers, and adopters
                to replace expensive closed software with credible open products.
              </p>
              <div className="hero-actions">
                <Link className="primary-button" href="/missions/canny-fider">
                  Join Mission 01
                  <ArrowRight aria-hidden="true" size={18} />
                </Link>
                <Link className="text-link" href="/catalog">
                  Explore the targets
                </Link>
              </div>
            </div>

            <Link
              className="mission-console"
              href="/missions/canny-fider"
              aria-label="Open the current SaaSassin mission"
            >
              <div className="console-topbar">
                <span>Mission control</span>
                <span>v0.1</span>
              </div>
              <div className="console-main">
                <p className="console-label">Now recruiting</p>
                <p className="console-target">{activeMission?.name ?? "Canny"}</p>
                <p className="console-command">
                  <span>&gt;</span> strengthen {activeMission?.challengerName ?? "Fider"}
                </p>
                <div className="console-stats">
                  <div>
                    <strong>{catalog.items.length}</strong>
                    <span>targets</span>
                  </div>
                  <div>
                    <strong>3</strong>
                    <span>attack modes</span>
                  </div>
                  <div>
                    <strong>{roadmap.items.length}</strong>
                    <span>launch phases</span>
                  </div>
                </div>
                <div className="console-checks">
                  <span>
                    <CheckCircle2 aria-hidden="true" size={16} /> Evidence scored
                  </span>
                  <span>
                    <CheckCircle2 aria-hidden="true" size={16} /> Migration gated
                  </span>
                  <span>
                    <CheckCircle2 aria-hidden="true" size={16} /> Clean-room scope
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </section>

        <section className="ticker" aria-label="SaaSassin operating principles">
          <div>
            <span>BUILD WHERE THERE IS WHITESPACE</span>
            <span>•</span>
            <span>BACK MAINTAINERS BEFORE FORKING</span>
            <span>•</span>
            <span>MIGRATIONS OVER MOCKUPS</span>
            <span>•</span>
            <span>OPEN EXPORTS. ALWAYS.</span>
          </div>
        </section>

        <section className="section" id="targets">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">The current hit list</p>
                <h2>High pain. Reachable product. Credible wedge.</h2>
              </div>
              <p>
                The ranking rewards displacement potential—not incumbent size. A
                large brand scores poorly when the moat is a network, regulated rail,
                or already-solved open-source category.
              </p>
            </div>

            <div className="featured-grid">
              {featured.map((target) => (
                <TargetCard key={target.slug} target={target} />
              ))}
            </div>

            <div className="section-cta-row">
              <Link className="secondary-button" href="/catalog">
                See all 10 targets
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <span>Public-source research snapshot: 8 August 2026</span>
            </div>
          </div>
        </section>

        <section className="section section-dark" id="how-it-works">
          <div className="shell">
            <div className="section-heading dark-heading">
              <p className="eyebrow">The operating model</p>
              <h2>Not another directory of abandoned repos.</h2>
              <p>
                SaaSassin treats open-source displacement as product work: research,
                scope, maintainers, design partners, migration, verification, and
                ongoing economics.
              </p>
            </div>

            <div className="process-grid">
              {processSteps.map((step) => (
                <article key={step.number} className="process-card">
                  <div className="process-card-top">
                    <span>{step.number}</span>
                    <step.icon aria-hidden="true" size={24} />
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section roadmap-preview">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">First 165 days</p>
                <h2>One proving mission. Two escalating bets.</h2>
              </div>
              <Link className="text-link" href="/roadmap">
                Open the full roadmap
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>

            <div className="roadmap-strip">
              {roadmap.items.map((item) => (
                <article key={item.id} className="roadmap-mini-card">
                  <div>
                    <span className={`roadmap-status status-${item.status.toLowerCase()}`}>
                      {item.status}
                    </span>
                    <span>{item.window}</span>
                  </div>
                  <p>{item.kicker}</p>
                  <h3>{item.title}</h3>
                  <strong>{item.successMetric}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="closing-cta">
          <div className="shell closing-cta-inner">
            <Sparkles aria-hidden="true" size={30} />
            <p className="eyebrow">The ask</p>
            <h2>Bring code, a painful SaaS bill, or a real migration.</h2>
            <p>
              Missions advance only when credible builders and adopters meet around a
              measurable outcome.
            </p>
            <Link
              className="primary-button primary-button-dark"
              href="/missions/canny-fider"
            >
              Join Mission 01
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
