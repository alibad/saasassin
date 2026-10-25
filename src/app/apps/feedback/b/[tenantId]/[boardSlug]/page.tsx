import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicBoard } from "@/components/feedback/public-board";
import { PublicUnavailable } from "@/components/feedback/public-unavailable";
import { loadPublicBoard, PRODUCT } from "@/lib/feedback/data";
import { FleetError, getFleetUser } from "@/lib/fleet/platform/session";

type PageProps = {
  params: Promise<{ tenantId: string; boardSlug: string }>;
  searchParams: Promise<{ post?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feedback board · SaaSassin Feedback",
  robots: { index: false, follow: false },
};

export default async function PublicBoardPage({ params, searchParams }: PageProps) {
  const { tenantId, boardSlug } = await params;
  const requested = (await searchParams).post;
  const initialPostId = typeof requested === "string" ? requested : null;
  const viewer = await getFleetUser(PRODUCT);
  let initial: Awaited<ReturnType<typeof loadPublicBoard>>;
  try {
    initial = await loadPublicBoard(tenantId, boardSlug, viewer);
  } catch (error) {
    if (error instanceof FleetError && error.status === 404) notFound();
    return <PublicUnavailable message={error instanceof FleetError ? error.message : "This board could not be loaded right now."} />;
  }
  return <PublicBoard initial={initial} tenantId={tenantId} initialPostId={initialPostId} />;
}
