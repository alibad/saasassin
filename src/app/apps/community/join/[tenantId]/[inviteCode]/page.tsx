import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogIn, Users } from "lucide-react";

import { paperCard } from "@/components/community/api";
import { JoinCommunityButton } from "@/components/community/join-community-button";
import { Button } from "@/components/ui/button";
import { previewInvite } from "@/lib/community/data";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata: Metadata = {
  title: "Join a community on SaaSassin Community",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; inviteCode: string }> };

export default async function JoinCommunityPage({ params }: PageProps) {
  const app = getFleetApp("community");
  if (!app) notFound();
  const { tenantId, inviteCode } = await params;
  const user = await getFleetUser(app.slug);
  const joinPath = `/apps/community/join/${encodeURIComponent(tenantId)}/${encodeURIComponent(inviteCode)}`;
  const preview = user ? await previewInvite(tenantId, inviteCode).catch(() => ({ ok: false as const, error: "Invites are unavailable right now." })) : null;

  return (
    <main className="fleet-app grid min-h-screen place-items-center bg-[var(--paper)] px-4 py-10 text-[var(--ink)]">
      <section className={`${paperCard} flex w-full max-w-md flex-col gap-4 p-6`}>
        <span className="grid size-12 place-items-center rounded-lg border-2 border-[var(--ink)] bg-[#a855f7] text-white"><Users /></span>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">SaaSassin Community invite</p>
        {!user ? (
          <>
            <h1 className="text-2xl font-black">You have been invited to a community</h1>
            <p className="text-sm text-[var(--muted)]">Sign in or create a free SaaSassin Community account, then come back to this link to join.</p>
            <Button asChild>
              <Link href={`/apps/community/sign-in?next=${encodeURIComponent(joinPath)}`}><LogIn /> Sign in to join</Link>
            </Button>
          </>
        ) : preview?.ok ? (
          <>
            <h1 className="text-2xl font-black">Join {preview.name}</h1>
            <p className="text-sm text-[var(--muted)]">You will join as a member, signed in as {user.email}. The owner can see that you joined.</p>
            <JoinCommunityButton tenantId={tenantId} inviteCode={inviteCode} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black">This invite cannot be used</h1>
            <p className="text-sm text-[var(--muted)]">{preview?.error ?? "This invite link is not valid."} Ask the community owner for a fresh link.</p>
            <Button asChild variant="outline"><Link href="/apps/community">Go to your communities</Link></Button>
          </>
        )}
      </section>
    </main>
  );
}
