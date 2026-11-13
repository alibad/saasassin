"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { ArrowRight, CircleAlert, Clock, LoaderCircle, LogOut, MailCheck, ShieldX, UserCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster, toast } from "@/components/ui/toast";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import type { InvitePreview } from "@/lib/fleet/account/types";
import { cn } from "@/lib/utils";

import { AuthPanel } from "./auth-panel";
import { readableAuthError } from "./auth-errors";
import { accountApiBase, accountRequest, refreshProductSession } from "./client";
import { signOutOfProduct } from "./use-firebase-user";
import { UserAvatar } from "./user-avatar";

export type InviteAcceptViewProps = {
  /** Fleet product slug. */
  product: string;
  productName: string;
  /** The "<id>.<secret>" token from the invitation link. */
  token: string;
  /** Computed on the server for the current viewer (see InviteAcceptPage). */
  preview: InvitePreview;
  /** The product's home. After joining, people land on `${appHref}?workspace=<tenantId>`. */
  appHref: string;
  mark?: ReactNode;
  className?: string;
};

function withWorkspace(href: string, tenantId: string | null) {
  if (!tenantId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(tenantId)}`;
}

/** Everything someone sees when they open an invitation link, from signed out to joined. */
export function InviteAcceptView({ product, productName, token, preview, appHref, mark, className }: InviteAcceptViewProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const workspace = preview.workspaceName ?? "this workspace";
  const destination = withWorkspace(appHref, preview.tenantId);

  async function accept() {
    setBusy("accept");
    setError("");
    try {
      await accountRequest(`${accountApiBase(product)}/invitations/accept`, { method: "POST", json: { token } });
      router.push(destination);
      router.refresh();
    } catch (caught) {
      setError(readableAuthError(caught));
      setBusy(null);
    }
  }

  async function switchAccount() {
    setBusy("switch");
    await signOutOfProduct(product);
    router.refresh();
    setBusy(null);
  }

  async function sendConfirmation() {
    setBusy("send");
    setError("");
    try {
      const auth = getFirebaseClientAuth();
      await auth.authStateReady();
      if (!auth.currentUser) throw new Error("Sign in again to send the confirmation email.");
      await sendEmailVerification(auth.currentUser);
      toast({ title: "Confirmation email sent", description: `Open the link we sent to ${preview.viewerEmail}.` });
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function checkConfirmed() {
    setBusy("check");
    setError("");
    try {
      const auth = getFirebaseClientAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in again to continue.");
      await user.reload();
      if (!user.emailVerified) {
        setError("We haven't seen the confirmation yet. Open the link in the email, then try again.");
        return;
      }
      await refreshProductSession(product);
      router.refresh();
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setBusy(null);
    }
  }

  const summary = preview.inviter && preview.role ? (
    <div className="flex items-start gap-3 rounded-[var(--radius)] border bg-muted/40 p-3">
      <UserAvatar person={{ uid: preview.inviter.name, name: preview.inviter.name, photoURL: preview.inviter.photoURL }} size="lg" />
      <div className="grid gap-1">
        <p className="text-sm">
          <span className="font-medium">{preview.inviter.name}</span> invited you to join{" "}
          <span className="font-medium">{workspace}</span> on {productName}.
        </p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{preview.role.label}</Badge>
          {preview.role.description}
        </p>
      </div>
    </div>
  ) : null;

  let title: string;
  let description: ReactNode = null;
  let body: ReactNode = null;
  let footer: ReactNode = null;
  const home = (
    <Button asChild variant="outline">
      <Link href={appHref}>Go to {productName}</Link>
    </Button>
  );

  switch (preview.state) {
    case "invalid":
      title = "This invitation link isn't valid";
      description = "It may be incomplete, or a newer link may have replaced it. Ask the person who invited you to send a new one.";
      footer = home;
      break;
    case "revoked":
      title = "This invitation was withdrawn";
      description = `It can no longer be used to join ${workspace}. If you still need access, ask for a new invitation.`;
      footer = home;
      break;
    case "expired":
      title = "This invitation has expired";
      description = `Invitations last 14 days. Ask ${preview.inviter?.name ?? "the person who invited you"} to send a new link.`;
      footer = home;
      break;
    case "used":
      title = "This invitation has already been used";
      description = "Each invitation works once. If that wasn't you, ask for a new one.";
      footer = home;
      break;
    case "signed_out":
      title = `Join ${workspace}`;
      description = `Sign in or create your ${productName} account with ${preview.invitedEmail ?? "the invited email"} to accept.`;
      body = (
        <>
          {summary}
          <AuthPanel
            product={product}
            productName={productName}
            next={appHref}
            onSignedIn={() => router.refresh()}
            className="max-w-none border-0 p-0 shadow-none ring-0"
          />
        </>
      );
      break;
    case "wrong_email":
      title = "This invitation is for a different email";
      description = (
        <>
          It was sent to <span className="font-medium text-foreground">{preview.invitedEmail}</span>, but you&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{preview.viewerEmail}</span>. Sign in with the invited address to accept.
        </>
      );
      body = summary;
      footer = (
        <>
          <Button onClick={switchAccount} disabled={busy !== null}>
            {busy === "switch" ? <LoaderCircle className="animate-spin" /> : <LogOut />} Sign out and switch account
          </Button>
          {home}
        </>
      );
      break;
    case "verify_email":
      title = "Confirm your email to join";
      description = (
        <>
          For your security, invitations can only be accepted from a confirmed address. Confirm{" "}
          <span className="font-medium text-foreground">{preview.viewerEmail}</span>, then come back here.
        </>
      );
      body = summary;
      footer = (
        <>
          <Button onClick={checkConfirmed} disabled={busy !== null}>
            {busy === "check" ? <LoaderCircle className="animate-spin" /> : <MailCheck />} I&apos;ve confirmed it
          </Button>
          <Button variant="outline" onClick={sendConfirmation} disabled={busy !== null}>
            {busy === "send" ? <LoaderCircle className="animate-spin" /> : null} Send confirmation email
          </Button>
        </>
      );
      break;
    case "already_member":
      title = `You're already in ${workspace}`;
      description = "There's nothing else to do.";
      footer = (
        <Button asChild>
          <Link href={destination}>Open {workspace} <ArrowRight /></Link>
        </Button>
      );
      break;
    default:
      title = `Join ${workspace}`;
      description = `You're signed in as ${preview.viewerEmail}.`;
      body = summary;
      footer = (
        <Button onClick={accept} disabled={busy !== null}>
          {busy === "accept" ? <LoaderCircle className="animate-spin" /> : <UserCheck />} Join {workspace}
        </Button>
      );
  }

  const icon = {
    invalid: <CircleAlert />,
    revoked: <ShieldX />,
    expired: <Clock />,
    used: <CircleAlert />,
  }[preview.state as "invalid" | "revoked" | "expired" | "used"];

  return (
    <Card className={cn("w-full max-w-lg", className)}>
      <Toaster />
      <CardHeader className="gap-2">
        {mark ? <div className="mb-2 flex items-center">{mark}</div> : null}
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon ? <span className="text-muted-foreground [&_svg]:size-5">{icon}</span> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {body || error ? (
        <CardContent className="grid gap-4">
          {body}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription aria-live="polite">{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      ) : null}
      {footer ? <CardFooter className="flex flex-wrap gap-2">{footer}</CardFooter> : null}
    </Card>
  );
}
