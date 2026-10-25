import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, CircleDashed, Route } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { fleetApps, getFleetPublicHref } from "@/lib/fleet/apps";

export const metadata: Metadata = {
  title: "Open product fleet",
  description: "The ten capability products, build boundaries, and delivery status in the SaaSassin fleet.",
};

export default function AppsPage() {
  return (
    <main>
      <section className="page-hero fleet-page-hero">
        <div className="shell page-hero-grid">
          <div><p className="eyebrow">The product fleet</p><h1>One clear capability per product.</h1></div>
          <div className="page-hero-aside">
            <p>Incumbent names stay in migration research. Each replacement gets an independent SaaSassin identity, capability subdomain, product boundary, and evidence gate.</p>
            <span className="data-source-badge"><Route /> Ten routed app foundations</span>
          </div>
        </div>
      </section>
      <section className="section fleet-grid-section">
        <div className="shell">
          <div className="fleet-principles">
            <span><Boxes /> Shared platform, isolated product data</span>
            <span><CheckCircle2 /> Vertical demos before parity</span>
            <span><CircleDashed /> Upstream gates stay explicit</span>
          </div>
          <div className="fleet-product-grid">
            {fleetApps.map((app) => (
              <article key={app.slug} className="fleet-product-card" style={{ "--card-accent": app.accent } as CSSProperties}>
                <div className="fleet-product-lockup">
                  <span><Image src="/brand/saasassin-mark.png" alt="" width={34} height={34} /></span>
                  <div><strong>SaaSassin</strong><small>{app.productName}</small></div>
                </div>
                <div className="fleet-product-meta"><Badge variant="outline">{app.status}</Badge><span>{app.subdomain}.saasassin.net</span></div>
                <p className="eyebrow">{app.targetName} / {app.strategy}</p>
                <h2>{app.promise}</h2>
                <p>{app.primaryJob}</p>
                <Link href={getFleetPublicHref(app)}>Open product foundation <ArrowRight /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
