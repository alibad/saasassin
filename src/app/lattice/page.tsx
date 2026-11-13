import type { Metadata } from "next";

import { PerformanceHome } from "@/brands/performance/home";
import { LatticeWorkspace } from "@/components/lattice-workspace";
import { brandHomeMetadata } from "@/lib/brand/metadata";
import { memberPhotos } from "@/lib/lattice/account";
import { getCurrentSessionUser } from "@/lib/lattice/auth";
import { getWorkspaceSnapshot } from "@/lib/lattice/data";
import { getIntegrationsSnapshot } from "@/lib/lattice/integrations-data";
import { linkInvitedMemberships } from "@/lib/lattice/member-links";
import { getProgramSnapshot } from "@/lib/lattice/program-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = brandHomeMetadata();

export default async function LatticePage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const user = await getCurrentSessionUser();
  if (!user) return <PerformanceHome />;
  const { organization } = await searchParams;
  // Claim any imported directory record for this verified email (idempotent).
  await linkInvitedMemberships(user).catch((error) => console.error("Member linking failed", error));
  const snapshot = await getWorkspaceSnapshot(user, organization);
  const [program, integrations, photos] = await Promise.all([
    getProgramSnapshot(user, snapshot),
    snapshot.organization ? getIntegrationsSnapshot(user, snapshot.organization.id) : Promise.resolve(null),
    memberPhotos(snapshot).catch((error) => {
      // Faces are a nicety: initials still identify everyone if profiles can't be read.
      console.error("Loading profile photos failed", error);
      return {};
    }),
  ]);
  return <LatticeWorkspace snapshot={snapshot} program={program} integrations={integrations} photos={photos} />;
}
