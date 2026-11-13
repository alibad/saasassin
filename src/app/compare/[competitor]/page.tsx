import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, CodeXml, MessagesSquare } from "lucide-react";

import { CostCalculator } from "@/components/compare/cost-calculator";
import { ParityProgress } from "@/components/compare/parity-progress";
import { InterestForm } from "@/components/interest-form";
import { JsonLd } from "@/components/json-ld";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { comparisons, getComparison } from "@/data/comparisons";
import { siteConfig, sourceFileUrl } from "@/lib/app-config";
import { loadParitySummary } from "@/lib/compare/parity-file";
import { comparisonBreadcrumbTrail, comparisonJsonLd } from "@/lib/compare/structured-data";
import type { Comparison, ComparisonEdge } from "@/lib/compare/types";

// Only published comparisons exist; anything else is a 404 rather than an on-demand render.
export const dynamicParams = false;

export function generateStaticParams() {
  return comparisons.map((comparison) => ({ competitor: comparison.slug }));
}

export async function generateMetadata({ params }: PageProps<"/compare/[competitor]">): Promise<Metadata> {
  const { competitor } = await params;
  const comparison = getComparison(competitor);
  if (!comparison) return { title: "Comparison not found" };

  const path = `/compare/${comparison.slug}`;
  const title = comparison.seo.title;
  const fullTitle = `${title} | ${siteConfig.name}`;

  return {
    title,
    description: comparison.seo.description,
    keywords: comparison.seo.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: fullTitle,
      description: comparison.seo.description,
      url: path,
      siteName: siteConfig.name,
      images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: comparison.seo.description,
      images: ["/opengraph-image.png"],
    },
  };
}

function edgeLabel(edge: ComparisonEdge, comparison: Comparison) {
  switch (edge) {
    case "saasassin":
      return "SaaSassin ahead";
    case "competitor":
      return `${comparison.competitorName} ahead`;
    case "even":
      return "Even";
    default:
      return "Different approach";
  }
}

export default async function ComparePage({ params }: PageProps<"/compare/[competitor]">) {
  const { competitor } = await params;
  const comparison = getComparison(competitor);
  if (!comparison) notFound();

  const parity = loadParitySummary(comparison.parityFile);
  const repository = comparison.repository;
  const trail = comparisonBreadcrumbTrail(comparison);
  const { competitorName, productName, lastVerified } = comparison;

  return (
    <main className="compare-page">
      {comparisonJsonLd(comparison, siteConfig.url).map((data) => (
        <JsonLd key={String(data["@type"])} data={data} />
      ))}

      <section className="compare-hero">
        <div className="shell">
          <nav className="compare-breadcrumbs" aria-label="Breadcrumb">
            <ol>
              {trail.map((crumb, index) => (
                <li key={crumb.path}>
                  {index < trail.length - 1 ? (
                    <Link href={crumb.path}>{crumb.name}</Link>
                  ) : (
                    <span aria-current="page">{crumb.name}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="compare-hero-grid">
            <div>
              <p className="eyebrow">{comparison.hero.eyebrow}</p>
              <h1>{comparison.hero.title}</h1>
              <p className="compare-hero-lede">{comparison.hero.lede}</p>
              <div className="compare-hero-actions">
                <a className="primary-button" href={comparison.ctas.primary.href}>
                  {comparison.ctas.primary.label}
                  <ArrowRight aria-hidden="true" size={17} />
                </a>
                <a className="secondary-button" href={comparison.ctas.source.href} target="_blank" rel="noreferrer">
                  <CodeXml aria-hidden="true" size={17} />
                  {comparison.ctas.source.label}
                </a>
                <a className="text-link compare-talk-link" href={comparison.ctas.talk.href}>
                  <MessagesSquare aria-hidden="true" size={16} />
                  {comparison.ctas.talk.label}
                </a>
              </div>
              <ul className="compare-proof-strip" aria-label="What you can check in the product">
                {comparison.hero.proof.map((item) => (
                  <li key={item}>
                    <Check aria-hidden="true" size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <aside className="compare-glance" aria-label="At a glance">
              <p className="eyebrow">At a glance</p>
              <dl>
                {comparison.rows.slice(0, 4).map((row) => (
                  <div key={row.capability}>
                    <dt>{row.capability}</dt>
                    <dd>
                      <span>{productName}</span>
                      <strong>{row.saasassin}</strong>
                    </dd>
                    <dd>
                      <span>{competitorName}</span>
                      {row.competitor}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="compare-glance-date">
                {competitorName} facts last verified <time dateTime={lastVerified}>{lastVerified}</time>
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section className="compare-built-for">
        <div className="shell">
          <p className="eyebrow">Who it is for</p>
          <h2>{comparison.builtFor.title}</h2>
          <p>
            {comparison.builtFor.body} {comparison.builtFor.notFor}
          </p>
        </div>
      </section>

      <section className="section compare-differentiators">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Why teams switch</p>
              <h2>Reviews you can trust and take with you.</h2>
            </div>
            <p>Each point below is a feature in the product today, with a link to the code that does it.</p>
          </div>
          <ol className="compare-diff-grid">
            {comparison.differentiators.map((item, index) => (
              <li key={item.title}>
                <span className="compare-diff-number">{String(index + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                {item.proof.href ? (
                  <a href={item.proof.href} target="_blank" rel="noreferrer">
                    {item.proof.label}
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </a>
                ) : (
                  <span className="compare-diff-proof">{item.proof.label}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section compare-table-section" id="comparison">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Row by row</p>
              <h2>
                {productName} and {competitorName}, side by side.
              </h2>
            </div>
            <p>
              Every {competitorName} cell links to the public page it came from. Rows where {competitorName} is ahead
              stay on the page on purpose.
            </p>
          </div>

          <Table className="compare-table">
            <TableCaption>
              {competitorName} facts are from its public pages, last verified{" "}
              <time dateTime={lastVerified}>{lastVerified}</time>. {productName} facts describe the product as of
              this page&apos;s last update.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Capability</TableHead>
                <TableHead scope="col">{productName}</TableHead>
                <TableHead scope="col">{competitorName}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((row) => (
                <TableRow key={row.capability} data-edge={row.edge}>
                  <TableHead scope="row" className="compare-table-capability">
                    <span>{row.capability}</span>
                    <Badge variant="outline" className={`compare-edge compare-edge-${row.edge}`}>
                      {edgeLabel(row.edge, comparison)}
                    </Badge>
                  </TableHead>
                  <TableCell data-label={productName} className="compare-table-ours">
                    {row.saasassin}
                    {row.note ? <small>{row.note}</small> : null}
                  </TableCell>
                  <TableCell data-label={competitorName} className="compare-table-theirs">
                    {row.competitor}
                    <span className="compare-sources">
                      {row.sources.map((source) => (
                        <a key={source.id} href={source.url} target="_blank" rel="noreferrer nofollow">
                          {source.label}, {source.accessed}
                          <ArrowUpRight aria-hidden="true" size={12} />
                        </a>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {parity ? (
        <section className="section section-dark compare-parity-section" id="parity">
          <div className="shell">
            <div className="section-heading dark-heading">
              <p className="eyebrow">Tracked in public</p>
              <h2>Where we stand against {competitorName}, capability by capability.</h2>
              <p>
                We track {parity.total} {competitorName} capabilities in a public matrix. This section is rebuilt from
                that file on every deploy, so it moves as the daily build loop ships. It is a to-do list, not a claim
                of parity.
              </p>
            </div>
            <ParityProgress
              summary={parity}
              competitorName={competitorName}
              productName={productName}
              matrixUrl={sourceFileUrl(repository, comparison.parityFile ?? "")}
            />
          </div>
        </section>
      ) : null}

      <section className="section compare-cost-section" id="cost">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">What it costs</p>
              <h2>{competitorName} list price for your team.</h2>
            </div>
            <p>
              Pick a team size and the {competitorName} modules you would compare. The arithmetic uses the published
              list prices and the annual minimum, nothing negotiated.
            </p>
          </div>
          <CostCalculator competitorName={competitorName} productName={productName} pricing={comparison.pricing} />
          {comparison.pricing.excludedModules.length > 0 ? (
            <div className="compare-excluded">
              <p className="eyebrow">Left out of the calculator</p>
              <ul>
                {comparison.pricing.excludedModules.map((module) => (
                  <li key={module.name}>
                    <strong>{module.name}</strong> ({module.price}): {module.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section compare-honest-section">
        <div className="shell compare-honest-grid">
          <article className="compare-better">
            <p className="eyebrow">Honest fit</p>
            <h2>{comparison.betterChoice.title}</h2>
            <p>{comparison.betterChoice.intro}</p>
            <ul>
              {comparison.betterChoice.items.map((item) => (
                <li key={item}>
                  <ArrowRight aria-hidden="true" size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </article>
          <article className="compare-migration">
            <p className="eyebrow">Migration</p>
            <h2>{comparison.migration.title}</h2>
            <p>{comparison.migration.body}</p>
            <ul>
              {comparison.migration.items.map((item) => (
                <li key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <Badge variant="outline" className="compare-migration-status">
                      {item.status}
                    </Badge>
                  </div>
                  <p>{item.body}</p>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="section compare-faq-section" id="faq">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Questions</p>
            <h2>Asked before switching.</h2>
          </div>
          <dl className="compare-faq">
            {comparison.faq.map((entry) => (
              <div key={entry.question}>
                <dt>{entry.question}</dt>
                <dd>{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="compare-talk-section" id="talk-to-us">
        <div className="shell compare-talk-grid">
          <div className="compare-talk-intro">
            <p className="eyebrow">Talk to us</p>
            <h2>Planning your next review cycle?</h2>
            <p>Tell us about your team and the tool you use today, and we will reply by email.</p>
            <div className="compare-talk-actions">
              <a className="primary-button primary-button-dark" href={comparison.ctas.primary.href}>
                {comparison.ctas.primary.label}
                <ArrowRight aria-hidden="true" size={17} />
              </a>
              <a className="secondary-button" href={comparison.ctas.source.href} target="_blank" rel="noreferrer">
                <CodeXml aria-hidden="true" size={17} />
                {comparison.ctas.source.label}
              </a>
            </div>
          </div>
          <div className="compare-talk-form">
            <InterestForm
              target={comparison.interest.target}
              targetName={competitorName}
              source={comparison.interest.source}
              variant="contact"
            />
          </div>
          <nav className="compare-related" aria-label="Related pages">
            <p className="eyebrow">Keep reading</p>
            <ul>
              {comparison.related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>
                    {link.label}
                    <ArrowRight aria-hidden="true" size={14} />
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/compare">
                  All comparisons
                  <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </section>

      <aside className="compare-legal">
        <div className="shell">
          <p>{comparison.trademark}</p>
          <p>
            Comparisons reflect {competitorName}&apos;s public pages as of{" "}
            <time dateTime={lastVerified}>{lastVerified}</time>. Spot something out of date?{" "}
            <a href={`${repository}/issues/new`} target="_blank" rel="noreferrer">
              Open an issue
            </a>{" "}
            or <a href="#talk-to-us">tell us here</a>.
          </p>
        </div>
      </aside>
    </main>
  );
}
