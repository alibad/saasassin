import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFleetApp } from "@/lib/fleet/apps";
import { getFleetUser } from "@/lib/fleet/platform/session";
import { previewInvitation } from "@/lib/fleet/platform/team";

import { AccountSettings } from "./account-settings";
import { InviteAcceptView } from "./invite-accept-view";

/**
 * Server pages behind /apps/{slug}/account and /apps/{slug}/invite/{token} (and, on a product's
 * own host, /account and /invite/{token}). Each product's route file is a one-line wrapper, so
 * the product layout around it supplies the brand.
 */

function productOrNotFound(slug: string) {
  const app = getFleetApp(slug);
  if (!app || app.slug === "performance") notFound();
  return app;
}

export function accountPageMetadata(slug: string): Metadata {
  const app = getFleetApp(slug);
  return { title: app ? `Account settings — ${app.productName}` : "Account settings", robots: { index: false, follow: false } };
}

export function invitePageMetadata(slug: string): Metadata {
  const app = getFleetApp(slug);
  return { title: app ? `Join a workspace — ${app.productName}` : "Invitation", robots: { index: false, follow: false } };
}

export async function AccountSettingsPage({ product }: { product: string }) {
  const app = productOrNotFound(product);
  const appHref = `/apps/${app.slug}`;
  const signInHref = `${appHref}/sign-in`;
  const user = await getFleetUser(app.slug);
  if (!user) redirect(`${signInHref}?next=${encodeURIComponent(`${appHref}/account`)}`);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:py-12">
        <div className="grid gap-3">
          <Button asChild variant="ghost" size="sm" className="w-fit">
            <Link href={appHref}><ArrowLeft /> Back to {app.productName}</Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
          <p className="text-sm text-muted-foreground">Your profile, how you sign in, and where you&apos;re signed in.</p>
        </div>
        <AccountSettings product={app.slug} productName={app.productName} signInHref={signInHref} />
      </div>
    </main>
  );
}

export async function InviteAcceptPage({ product, token }: { product: string; token: string }) {
  const app = productOrNotFound(product);
  const user = await getFleetUser(app.slug);
  const preview = await previewInvitation(app.slug, token, user);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10 text-foreground">
      <InviteAcceptView
        product={app.slug}
        productName={app.productName}
        token={token}
        preview={preview}
        appHref={`/apps/${app.slug}`}
      />
    </main>
  );
}
