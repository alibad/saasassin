import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";

import { getPublicTrustCenter } from "@/lib/trust/public";

type PageProps = { params: Promise<{ tenantId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tenantId } = await params;
  const center = await getPublicTrustCenter(tenantId);
  return {
    title: center ? `${center.displayName} trust center` : "Trust center",
    robots: { index: false, follow: false },
  };
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function PublicTrustCenterPage({ params }: PageProps) {
  const { tenantId } = await params;
  const center = await getPublicTrustCenter(tenantId);
  if (!center) notFound();

  return (
    <main className="fleet-app min-h-screen bg-[#f5f2e9] text-[#171715]">
      <header className="border-b-2 border-[#171715] bg-[#e8ff59]">
        <div className="mx-auto w-[min(960px,calc(100%-32px))] py-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"><ShieldCheck className="size-4" /> Trust center</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">{center.displayName}</h1>
          {center.headline ? <p className="mt-3 max-w-2xl whitespace-pre-line">{center.headline}</p> : null}
          {center.contactEmail ? (
            <a className="mt-4 inline-flex items-center gap-2 border-2 border-[#171715] bg-[#fffdf7] px-3 py-1.5 text-sm font-semibold" href={`mailto:${center.contactEmail}`}>
              <Mail className="size-4" /> {center.contactEmail}
            </a>
          ) : null}
        </div>
      </header>
      <div className="mx-auto grid w-[min(960px,calc(100%-32px))] gap-6 py-8">
        {center.frameworks && center.frameworks.length > 0 ? (
          <section className="border-2 border-[#171715] bg-[#fffdf7] p-5 shadow-[4px_4px_0_#171715]">
            <h2 className="text-xl font-bold">Frameworks we track readiness against</h2>
            <ul className="mt-3 grid gap-2">
              {center.frameworks.map((framework) => (
                <li key={framework.id} className="border border-[#171715] bg-white p-3">
                  <p className="font-semibold">{framework.name}</p>
                  <p className="text-xs text-[#6d6c64]">Tracked with control library {framework.libraryVersion}. Tracking readiness is not the same as holding a certification or audit report.</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {center.readiness ? (
          <section className="border-2 border-[#171715] bg-[#fffdf7] p-5 shadow-[4px_4px_0_#171715]">
            <h2 className="text-xl font-bold">Program readiness</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="border border-[#171715] bg-white p-4">
                <p className="text-3xl font-black">{center.readiness.coveragePercent}%</p>
                <p className="text-sm">of {center.readiness.applicableControls} applicable controls are marked implemented with current evidence</p>
              </div>
              <div className="border border-[#171715] bg-white p-4">
                <p className="text-3xl font-black">{center.readiness.freshnessPercent}%</p>
                <p className="text-sm">of tracked evidence is within its review window</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#6d6c64]">Self-reported by {center.displayName}. Not independently verified.</p>
          </section>
        ) : null}
        {center.categories && center.categories.length > 0 ? (
          <section className="border-2 border-[#171715] bg-[#fffdf7] p-5 shadow-[4px_4px_0_#171715]">
            <h2 className="text-xl font-bold">Controls by area</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {center.categories.map((category) => (
                <li key={`${category.framework}-${category.category}`} className="flex items-center justify-between gap-2 border border-[#171715] bg-white p-3 text-sm">
                  <span><strong>{category.category}</strong><br /><span className="text-xs text-[#6d6c64]">{category.framework}</span></span>
                  <span className="font-mono font-bold">{category.implemented}/{category.applicable}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {center.policies.length > 0 ? (
          <section className="border-2 border-[#171715] bg-[#fffdf7] p-5 shadow-[4px_4px_0_#171715]">
            <h2 className="text-xl font-bold">Policies</h2>
            <ul className="mt-3 grid gap-2">
              {center.policies.map((policy) => (
                <li key={policy.id} className="flex flex-wrap justify-between gap-2 border border-[#171715] bg-white p-3 text-sm">
                  <span className="font-semibold">{policy.title}</span>
                  <span className="text-[#6d6c64]">Version {policy.version} · approved {formatDay(policy.approvedAt)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#6d6c64]">Contact {center.contactEmail || "the company"} to request policy documents.</p>
          </section>
        ) : null}
        <p className="text-center text-xs text-[#6d6c64]">Published with SaaSassin Trust. Information on this page is provided by {center.displayName}.</p>
      </div>
    </main>
  );
}
