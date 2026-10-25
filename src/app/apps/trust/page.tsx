import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ClipboardCheck, FileClock, Globe, ShieldCheck } from "lucide-react";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { TrustWorkspace } from "@/components/trust/trust-workspace";
import { Button } from "@/components/ui/button";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("trust");

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

const FEATURES = [
  { icon: ClipboardCheck, title: "Versioned control library", body: "SOC 2 common criteria (CC1–CC9) and an ISO 27001 Annex A subset, paraphrased and mapped, with owners and status per control." },
  { icon: FileClock, title: "Evidence that expires", body: "Every item has a collection date and review cadence. When evidence lapses, its controls flip to “needs evidence” on their own." },
  { icon: ShieldCheck, title: "Policies, risks, vendors", body: "Template policies with versions, approval and acknowledgements; a scored risk register; a tiered vendor inventory with review dates." },
  { icon: Globe, title: "Trust center you control", body: "Publish only what you choose to a public page, and export the whole program as versioned JSON whenever you want." },
];

export default async function TrustAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <TrustWorkspace userEmail={user.email} />;

  return (
    <>
      <section className="fleet-app border-b-2 border-[#171715] bg-[#e8ff59] text-[#171715]">
        <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] gap-6 py-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest">SaaSassin Trust · open compliance readiness</p>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">Track controls, evidence, policies and risk in a workspace you own.</h1>
            <p className="mt-3 max-w-xl text-base">
              Readiness and evidence tracking for SOC 2 and ISO 27001 programs. SaaSassin Trust does not certify anyone or replace your auditor; it keeps the work organised and exportable.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="rounded-none border-2 border-[#171715] shadow-[4px_4px_0_#171715]">
                <Link href="/apps/trust/sign-in">Sign in / Create account <ArrowRight /></Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="border-2 border-[#171715] bg-[#fffdf7] p-3 shadow-[3px_3px_0_#171715]">
                <Icon className="size-5" aria-hidden="true" />
                <p className="mt-1 font-bold">{title}</p>
                <p className="text-xs">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <FleetAppShell app={app} />
    </>
  );
}
