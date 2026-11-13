"use client";

import { useState, type FormEvent } from "react";
import {
  EmailAuthProvider,
  linkWithCredential,
  linkWithPopup,
  sendEmailVerification,
  unlink,
  updatePassword,
  type User,
} from "firebase/auth";
import { CheckCircle2, LoaderCircle, MailWarning } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import {
  FIREBASE_PROVIDER_IDS,
  PROVIDER_LABELS,
  providerFromFirebaseId,
  type AuthProviderId,
} from "@/lib/fleet/account/identity";

import { readableAuthError } from "./auth-errors";
import { refreshAccount, refreshProductSession } from "./client";
import { createProvider, enabledProviders } from "./firebase-auth";
import { ProviderIcon } from "./provider-icons";

type Guard = (action: () => Promise<void>) => Promise<void>;

/** Linked providers, password and email verification for the signed-in Firebase user. */
export function SignInMethods({ product, user, guard, onChanged }: {
  product: string;
  user: User;
  guard: Guard;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [unlinking, setUnlinkTarget] = useState<AuthProviderId | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const linked = new Map(
    user.providerData
      .map((info) => [providerFromFirebaseId(info.providerId), info] as const)
      .filter(([id]) => id !== null),
  );
  const hasPassword = linked.has("password");
  const oauth = [...new Set<AuthProviderId>([
    ...enabledProviders(),
    ...[...linked.keys()].filter((id): id is AuthProviderId => id !== null && id !== "password"),
  ])];
  const methodCount = linked.size;

  async function afterSecurityChange(message: string) {
    // Some changes revoke older sessions; re-issue this product's session from the fresh token.
    await refreshProductSession(product).catch(() => undefined);
    onChanged();
    void refreshAccount(product);
    toast({ title: message });
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    try {
      await guard(action);
    } catch (caught) {
      toast({ title: "That didn't work", description: readableAuthError(caught), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function connect(provider: AuthProviderId) {
    void run(provider, async () => {
      await linkWithPopup(user, createProvider(provider));
      await afterSecurityChange(`${PROVIDER_LABELS[provider]} is connected. You can sign in with it now.`);
    });
  }

  function disconnect(provider: AuthProviderId) {
    void run(`unlink-${provider}`, async () => {
      await unlink(user, FIREBASE_PROVIDER_IDS[provider]);
      await afterSecurityChange(`${PROVIDER_LABELS[provider]} is disconnected.`);
    });
  }

  function sendVerification() {
    void run("verify", async () => {
      await sendEmailVerification(user);
      toast({ title: "Verification email sent", description: `Open the link we sent to ${user.email}.` });
    });
  }

  function checkVerification() {
    void run("verified", async () => {
      await user.reload();
      if (!user.emailVerified) {
        toast({ title: "Not confirmed yet", description: "Open the link in the email, then try again.", variant: "destructive" });
        return;
      }
      await afterSecurityChange("Email confirmed. Invitations to this address will now find you.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>Ways you can sign in to this account. Keep at least one.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!user.emailVerified && user.email ? (
          <Alert>
            <MailWarning />
            <AlertTitle>Confirm {user.email}</AlertTitle>
            <AlertDescription>
              <p>Confirming your email protects your account and lets invitations sent to this address reach you.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={sendVerification} disabled={busy !== null}>
                  {busy === "verify" ? <LoaderCircle className="animate-spin" /> : null} Send confirmation email
                </Button>
                <Button size="sm" variant="outline" onClick={checkVerification} disabled={busy !== null}>
                  {busy === "verified" ? <LoaderCircle className="animate-spin" /> : null} I&apos;ve confirmed it
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <ul className="grid gap-3">
          {oauth.map((provider) => {
            const info = linked.get(provider);
            return (
              <li key={provider} className="flex flex-wrap items-center gap-3">
                <span className="grid size-9 place-items-center rounded-[var(--radius)] border bg-background">
                  <ProviderIcon provider={provider} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {info ? info.email ?? "Connected" : "Not connected"}
                  </span>
                </span>
                {info ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || methodCount <= 1}
                    onClick={() => { setUnlinkTarget(provider); setUnlinkOpen(true); }}
                  >
                    {busy === `unlink-${provider}` ? <LoaderCircle className="animate-spin" /> : null} Disconnect
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => connect(provider)}>
                    {busy === provider ? <LoaderCircle className="animate-spin" /> : null} Connect
                  </Button>
                )}
              </li>
            );
          })}
          <Separator />
          <li className="flex flex-wrap items-center gap-3">
            <span className="grid size-9 place-items-center rounded-[var(--radius)] border bg-background">
              <ProviderIcon provider="password" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Password</span>
              <span className="block truncate text-xs text-muted-foreground">
                {hasPassword ? `Sign in with ${user.email}` : "No password set"}
              </span>
            </span>
            {hasPassword ? <Badge variant="secondary"><CheckCircle2 /> Set</Badge> : null}
            <Button variant="outline" size="sm" disabled={busy !== null || !user.email} onClick={() => setPasswordOpen(true)}>
              {hasPassword ? "Change password" : "Set a password"}
            </Button>
          </li>
        </ul>
        {methodCount <= 1 ? (
          <p className="text-xs text-muted-foreground">To disconnect a method, add another way to sign in first.</p>
        ) : null}
      </CardContent>

      <AlertDialog open={unlinkOpen && unlinking !== null} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {unlinking ? PROVIDER_LABELS[unlinking] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t be able to sign in with it until you connect it again. Your other sign-in methods keep working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (unlinking) disconnect(unlinking);
                setUnlinkOpen(false);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        hasPassword={hasPassword}
        onSubmit={async (password) => {
          await guard(async () => {
            if (hasPassword) await updatePassword(user, password);
            else await linkWithCredential(user, EmailAuthProvider.credential(user.email ?? "", password));
            setPasswordOpen(false);
            await afterSecurityChange(hasPassword ? "Password changed" : "Password set. You can sign in with your email now.");
          });
        }}
      />
    </Card>
  );
}

function PasswordDialog({ open, onOpenChange, hasPassword, onSubmit }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword: boolean;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 8) return setError("Use at least eight characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setSaving(true);
    setError("");
    try {
      await onSubmit(password);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setError(""); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{hasPassword ? "Change your password" : "Set a password"}</DialogTitle>
            <DialogDescription>
              {hasPassword
                ? "You may need to sign in again on your other devices afterwards."
                : "You'll be able to sign in with your email and this password as well."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="account-new-password">New password</Label>
            <Input id="account-new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="account-confirm-password">Confirm new password</Label>
            <Input id="account-confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" /> : null} {hasPassword ? "Change password" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
