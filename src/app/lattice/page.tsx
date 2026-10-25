import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LatticeWorkspace } from "@/components/lattice-workspace";
import { getCurrentSessionUser } from "@/lib/lattice/auth";
import { getWorkspaceSnapshot } from "@/lib/lattice/data";
import { getProgramSnapshot } from "@/lib/lattice/program-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lattice Performance workspace",
  description: "A secure, open performance review workspace built by SaaSassin.",
  robots: { index: false, follow: false },
};

export default async function LatticePage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/lattice/sign-in");
  const { organization } = await searchParams;
  const snapshot = await getWorkspaceSnapshot(user, organization);
  const program = await getProgramSnapshot(user, snapshot);
  return <LatticeWorkspace snapshot={snapshot} program={program} />;
}
