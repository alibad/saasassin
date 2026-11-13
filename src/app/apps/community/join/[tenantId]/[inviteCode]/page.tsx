import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtSign, CalendarDays, LogIn, MessagesSquare, ShieldCheck } from "lucide-react";

import { CommunityMark } from "@/brands/community/mark";
import { JoinCommunityButton } from "@/components/community/join-community-button";
import { Wordmark } from "@/components/product-site/wordmark";
import { Button } from "@/components/ui/button";
import { previewInvite } from "@/lib/community/data";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";

export const metadata: Metadata = {
  title: "Join a community",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ tenantId: string; inviteCode: string }> };

const PROMISES = [
  { icon: MessagesSquare, text: "Conversations in spaces, with replies and reactions" },
  { icon: CalendarDays, text: "Events you can RSVP to and add to your calendar" },
  { icon: AtSign, text: "Pick an @handle. Other members never see your email" },
  { icon: ShieldCheck, text: "Mute or block anyone, privately" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

/** Where a community's invite link lands: who's inviting, what you get, and one button to join. */
export default async function JoinCommunityPage({ params }: PageProps) {
  const app = getFleetApp("community");
  if (!app) notFound();
  const { tenantId, inviteCode } = await params;
  const user = await getFleetUser(app.slug);
  const joinPath = `/apps/community/join/${encodeURIComponent(tenantId)}/${encodeURIComponent(inviteCode)}`;
  const preview = user ? await previewInvite(tenantId, inviteCode).catch(() => ({ ok: false as const, error: "Invites can't be checked right now. Try again in a moment." })) : null;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4 py-12 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_15%_0%,color-mix(in_oklab,var(--primary)_18%,transparent)_0%,transparent_70%),radial-gradient(45%_55%_at_100%_100%,color-mix(in_oklab,var(--brand-accent)_22%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
      <div className="relative grid w-full max-w-md gap-6">
        <Wordmark name="Community" mark={<CommunityMark />} href="/apps/community" size="sm" className="justify-self-center" />
        <section className="grid gap-5 rounded-[calc(var(--radius)*1.3)] bg-card p-7 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.35)] ring-1 ring-border">
          {!user ? (
            <>
              <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><MessagesSquare className="size-6" aria-hidden="true" /></span>
              <div>
                <h1 className="brand-heading text-3xl leading-tight">You&apos;re invited to join a community</h1>
                <p className="mt-2 text-muted-foreground">Sign in or create a free account, and you&apos;ll come straight back here to join.</p>
              </div>
              <Button asChild size="lg" className="h-11 rounded-full text-base">
                <Link href={`/apps/community/sign-in?next=${encodeURIComponent(joinPath)}`}><LogIn /> Continue to join</Link>
              </Button>
            </>
          ) : preview?.ok ? (
            <>
              <span className="grid size-16 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--brand-accent))] font-heading text-xl font-bold text-primary-foreground">{initials(preview.name)}</span>
              <div>
                <p className="text-sm font-medium text-primary">You&apos;re invited</p>
                <h1 className="brand-heading mt-1 text-3xl leading-tight">Join {preview.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground">You&apos;ll join as a member, signed in as {user.email}. The community&apos;s team can see that you joined; other members see only the name and handle you choose.</p>
              </div>
              <JoinCommunityButton tenantId={tenantId} inviteCode={inviteCode} />
            </>
          ) : (
            <>
              <div>
                <h1 className="brand-heading text-3xl leading-tight">This invite link has stopped working</h1>
                <p className="mt-2 text-muted-foreground">{preview?.error ?? "This invite link isn't valid."} Ask whoever shared it for a fresh one.</p>
              </div>
              <Button asChild variant="outline" className="rounded-full"><Link href="/apps/community">Go to your communities</Link></Button>
            </>
          )}
          <ul className="grid gap-2.5 border-t border-border pt-5 text-sm">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Icon className="size-4" aria-hidden="true" /></span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
