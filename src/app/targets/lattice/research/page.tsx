import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleAlert,
  Database,
  FileArchive,
  GitBranch,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Lattice research and build decision",
  description: "The source-backed decision record and product boundary for SaaSassin's open Lattice Performance replacement.",
};

const gaps = [
  {
    number: "01",
    title: "Phase changes hide consequential side effects",
    finding: "Lattice documents that ending peer selection automatically launches writing and auto-approves unapproved nominations; ending an individual review can submit drafts automatically.",
    response: "Adjacent-only transitions, a dry-run impact preview, incomplete-work blockers, and a reversible reopen path.",
    sources: [
      ["End peer selection", "https://help.lattice.com/hc/en-us/articles/10765260630679-End-Peer-Selection"],
      ["End a reviewee early", "https://help.lattice.com/hc/en-us/articles/1500002051882-End-a-Reviewee-s-Review-Cycle-Early"],
    ],
  },
  {
    number: "02",
    title: "Permission power is difficult to predict",
    finding: "Custom review permissions mix company-wide, targeted, cycle-management, visibility, calibration, and actions that may affect everyone in a cycle.",
    response: "Named atomic permissions, a role simulator, view-as-role UI, server re-authorization, and audit evidence for every privileged change.",
    sources: [["Custom review permissions", "https://help.lattice.com/hc/en-us/articles/360061578653-Configure-Custom-Role-Reviews-Permissions"]],
  },
  {
    number: "03",
    title: "Portability is fragmented by feature",
    finding: "Review progress, responses, packet sharing, result images, employee census, documents, and other datasets follow separate export paths and formats.",
    response: "One complete workspace archive using an open, versioned schema, plus focused CSV exports for day-to-day analysis.",
    sources: [
      ["Review cycle exports", "https://help.lattice.com/hc/en-us/articles/360060448714-Review-Cycle-Exports"],
      ["Data exports and retention", "https://help.lattice.com/hc/en-us/articles/1500001262262-Lattice-Data-Exports-and-Data-Retention-Period"],
    ],
  },
  {
    number: "04",
    title: "Directory synchronization needs inspectable failure history",
    finding: "Official troubleshooting routes admins through import logs, resyncs, reconfiguration, external-ID repair, and sometimes support escalation.",
    response: "Previewed field mapping, employee-level validation, immutable integration runs, retry history, and explicit source-of-truth ownership.",
    sources: [
      ["HRIS troubleshooting", "https://help.lattice.com/hc/en-us/articles/1500000932341-Troubleshooting-HRIS-Integrations"],
      ["External ID mismatch", "https://help.lattice.com/hc/en-us/articles/9809866022807-Import-Log-Error-External-ID-does-not-match"],
    ],
  },
  {
    number: "05",
    title: "Everyday navigation, filtering, reporting, and save confidence matter",
    finding: "Recent reviewer feedback praises the core workflow while repeatedly asking for deeper filters, more flexible reports, smoother navigation, and automatic saving for notes.",
    response: "Composable filters, URL-addressable views, an explicit autosave indicator, useful empty states, and report building from the same typed event model.",
    sources: [
      ["G2 reviews", "https://www.g2.com/products/lattice-lattice/reviews"],
      ["Capterra reviews", "https://www.capterra.com/p/151676/Lattice/reviews/"],
    ],
  },
  {
    number: "06",
    title: "AI output must remain evidence, not authority",
    finding: "Performance summaries influence sensitive employment conversations. A useful summary must preserve the exact review, goal, feedback, or note behind each claim.",
    response: "AI remains optional. Every generated claim carries source evidence IDs and direct links; users can inspect, remove, or regenerate individual claims.",
    sources: [["Lattice AI performance examples", "https://help.lattice.com/hc/en-us/article_attachments/36490860782359"]],
  },
] as const;

const included = [
  "Organizations, teams, directory, and reporting lines",
  "Fine-grained roles, simulator, and view-as-role",
  "Templates; self, manager, peer, and upward reviews",
  "Manual and scheduled reversible review cycles",
  "Goals, feedback, evidence, and 1:1 notes",
  "Calibration, packets, acknowledgement, and reporting",
  "Open versioned workspace export, API, and webhooks",
  "Optional evidence-linked AI summaries",
];

const excluded = [
  "Payroll, benefits, recruiting, and attendance",
  "Full HRIS functionality or compensation benchmarks",
  "Engagement surveys and succession planning",
  "Native mobile apps or a broad integration marketplace",
];

export default function LatticeResearchPage() {
  return (
    <main className="lattice-research-page">
      <section className="lattice-research-hero">
        <div className="shell">
          <Link className="back-link" href="/targets/lattice"><ArrowLeft />Back to Lattice target</Link>
          <div className="lattice-research-hero-grid">
            <div>
              <div className="pill-row"><Badge>Active build</Badge><Badge variant="outline">Decision record 2026-08-10</Badge></div>
              <p className="eyebrow">Target 02 / promoted to Mission 01</p>
              <h1>Build the trustworthy performance layer.</h1>
              <p>
                SaaSassin will build an open-source replacement for Lattice Performance
                for organizations with 25–250 employees—not a clone of the entire Lattice suite.
              </p>
              <div className="lattice-research-actions">
                <Button asChild size="lg"><Link href="/lattice"><ArrowRight />Open the working product</Link></Button>
                <Button asChild variant="outline" size="lg"><a href="#evidence"><Database />Inspect evidence</a></Button>
              </div>
            </div>
            <Card className="decision-card">
              <CardHeader><CardDescription>Decision</CardDescription><CardTitle>Promote Lattice now</CardTitle></CardHeader>
              <CardContent>
                <p>The category has a bounded performance core, painful minimum spend, meaningful data-sovereignty value, and no mature focused open replacement.</p>
                <div><span>Primary user</span><strong>People teams at 25–250 employee organizations</strong></div>
                <div><span>Initial proof</span><strong>One complete, audited review cycle</strong></div>
                <div><span>License direction</span><strong>Open source with portable data by default</strong></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="section lattice-boundary-section">
        <div className="shell">
          <div className="section-heading split-heading"><div><p className="eyebrow">Product boundary</p><h2>Deep performance workflow. Deliberately narrow HR scope.</h2></div><p>The line is drawn around evidence-rich performance conversations and the operating controls required to run them safely.</p></div>
          <div className="lattice-boundary-grid">
            <Card><CardHeader><ShieldCheck /><CardTitle>Included</CardTitle></CardHeader><CardContent><ul>{included.map((item) => <li key={item}><Check />{item}</li>)}</ul></CardContent></Card>
            <Card><CardHeader><CircleAlert /><CardTitle>Excluded for now</CardTitle></CardHeader><CardContent><ul>{excluded.map((item) => <li key={item}><ArrowRight />{item}</li>)}</ul></CardContent></Card>
          </div>
        </div>
      </section>

      <section className="section section-dark lattice-gap-section" id="evidence">
        <div className="shell">
          <div className="section-heading dark-heading"><p className="eyebrow">Evidence → decision → implementation</p><h2>Six gaps become six product rules.</h2><p>Official help documentation establishes current mechanics. User-review sources are treated as directional evidence, not controlled research.</p></div>
          <div className="lattice-gap-list">
            {gaps.map((gap) => (
              <article key={gap.number}>
                <span>{gap.number}</span>
                <div><h3>{gap.title}</h3><p>{gap.finding}</p><div className="source-links">{gap.sources.map(([label, url]) => <a key={url} href={url} target="_blank" rel="noreferrer">{label}<ArrowUpRight /></a>)}</div></div>
                <div><p className="eyebrow">SaaSassin response</p><strong>{gap.response}</strong></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section lattice-slice-section">
        <div className="shell">
          <div className="section-heading split-heading"><div><p className="eyebrow">Vertical delivery</p><h2>The first slice proves the risky spine.</h2></div><p>Usability, isolation, transitions, and auditability ship together so the demo is a real workflow rather than disconnected screens.</p></div>
          <div className="lattice-slice-grid">
            <Card><CardHeader><KeyRound /><CardTitle>Identity and tenancy</CardTitle></CardHeader><CardContent><p>Firebase Authentication, HTTP-only sessions, organization-scoped collections, atomic owner bootstrap, roles, and cross-tenant rule tests.</p></CardContent></Card>
            <Card><CardHeader><Database /><CardTitle>Organization graph</CardTitle></CardHeader><CardContent><p>Previewed CSV import creates employees, teams, titles, managers, and safe role mappings without granting privileged access.</p></CardContent></Card>
            <Card><CardHeader><GitBranch /><CardTitle>Review state machine</CardTitle></CardHeader><CardContent><p>Templates create assignments; phase previews expose effects and blockers; reversals preserve work; drafts autosave before submission.</p></CardContent></Card>
            <Card><CardHeader><FileArchive /><CardTitle>Audit evidence</CardTitle></CardHeader><CardContent><p>Organization, directory, permission, cycle, and submission events are append-only and visible in the same workspace.</p></CardContent></Card>
          </div>
          <div className="lattice-research-cta"><p className="eyebrow">Implementation is live</p><h2>Create an organization and run the first review.</h2><Button asChild size="lg"><Link href="/lattice">Open Lattice Performance<ArrowRight /></Link></Button></div>
        </div>
      </section>
    </main>
  );
}
