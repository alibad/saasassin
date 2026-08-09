import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownToLine, ArrowRight, Layers3 } from "lucide-react";

import variations from "@/data/logo-variations.json";

export const metadata: Metadata = {
  title: "Logo lab — 50 SVG directions",
  description:
    "Compare and download 50 vector logo directions for SaaSassin across five distinct identity families.",
  robots: {
    index: false,
    follow: false,
  },
};

const families = Array.from(
  variations.reduce((groups, variation) => {
    const existing = groups.get(variation.familySlug) ?? {
      slug: variation.familySlug,
      name: variation.family,
      thesis: variation.thesis,
      variations: [],
    };
    existing.variations.push(variation);
    groups.set(variation.familySlug, existing);
    return groups;
  }, new Map<string, { slug: string; name: string; thesis: string; variations: typeof variations }>()),
).map(([, family]) => family);

export default function LogoLabPage() {
  return (
    <main>
      <section className="logo-lab-hero">
        <div className="shell logo-lab-hero-grid">
          <div>
            <p className="eyebrow">Identity exploration / Round 01</p>
            <h1>50 marks. Pick the one with a pulse.</h1>
          </div>
          <div className="logo-lab-brief">
            <p>
              Five distinct visual territories, ten marks each. Every direction is
              a real, editable SVG—not a raster mockup.
            </p>
            <div className="logo-lab-count">
              <Layers3 aria-hidden="true" size={18} />
              <strong>50</strong>
              <span>downloadable vectors</span>
            </div>
          </div>
        </div>
      </section>

      <nav className="logo-family-nav" aria-label="Logo families">
        <div className="shell">
          {families.map((family, index) => (
            <Link key={family.slug} href={`#${family.slug}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {family.name}
            </Link>
          ))}
        </div>
      </nav>

      <section className="logo-lab-intro">
        <div className="shell logo-lab-instruction">
          <p>
            Choose by code: reply with an ID such as <strong>SA-17</strong>. I’ll
            refine the winner into the production mark, wordmark, favicon, and
            monochrome set.
          </p>
          <Link className="text-link" href="#forked-signal">
            Start comparing
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </section>

      {families.map((family, familyIndex) => (
        <section key={family.slug} className="logo-family-section" id={family.slug}>
          <div className="shell">
            <div className="logo-family-heading">
              <p className="eyebrow">
                Family {String(familyIndex + 1).padStart(2, "0")} / 05
              </p>
              <h2>{family.name}</h2>
              <p>{family.thesis}</p>
            </div>

            <div className="logo-variation-grid">
              {family.variations.map((variation) => (
                <article key={variation.id} className="logo-variation-card">
                  <div className="logo-artboard">
                    <Image
                      src={variation.src}
                      alt={`${variation.id}: ${variation.title}`}
                      width={256}
                      height={256}
                      unoptimized
                    />
                  </div>
                  <div className="logo-card-copy">
                    <div>
                      <span>{variation.id}</span>
                      <h3>{variation.title}</h3>
                    </div>
                    <a href={variation.src} download={variation.filename}>
                      SVG
                      <ArrowDownToLine aria-hidden="true" size={15} />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="logo-lab-closing">
        <div className="shell">
          <p className="eyebrow">Your move</p>
          <h2>Send me one ID—or a shortlist of three.</h2>
          <p>
            The next round will stress-test the finalists at favicon size, in
            monochrome, beside the SaaSassin wordmark, and on the live product.
          </p>
        </div>
      </section>
    </main>
  );
}
