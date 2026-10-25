import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FleetAppShell } from "@/components/fleet-app-shell";
import { StudiesWorkspace } from "@/components/studies/studies-workspace";
import { getFleetApp, getFleetAppUrl } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

const app = getFleetApp("studies");

export const dynamic = "force-dynamic";

export const metadata: Metadata = app
  ? {
      title: `SaaSassin ${app.productName}`,
      description: app.promise,
      alternates: { canonical: getFleetAppUrl(app) },
      robots: { index: false, follow: false },
    }
  : { title: "Product not found" };

export default async function StudiesAppPage() {
  if (!app) notFound();
  const user = await getFleetUser(app.slug);
  if (user) return <StudiesWorkspace user={{ email: user.email, name: user.name }} />;

  return (
    <>
      <div className="bg-[#ffbd2e] px-4 py-3 text-[#111]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">
            Studies is live: build unmoderated studies, share a participant link, analyze and export every response.
          </p>
          <Link
            href={`/apps/${app.slug}/sign-in`}
            className="border-2 border-[#111] bg-white px-4 py-2 font-semibold shadow-[3px_3px_0_#111]"
          >
            Sign in / Create account
          </Link>
        </div>
      </div>
      <FleetAppShell app={app} />
    </>
  );
}
