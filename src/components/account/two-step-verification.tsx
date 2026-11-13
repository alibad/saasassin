"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import {
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorInfo,
  type TotpSecret,
  type User,
} from "firebase/auth";
import QRCode from "qrcode";
import { Copy, LoaderCircle, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { toast } from "@/components/ui/toast";

import { readableAuthError } from "./auth-errors";
import { refreshProductSession } from "./client";
import { totpEnabled } from "./firebase-auth";
import { TotpCodeInput } from "./totp-code-input";

type Guard = (action: () => Promise<void>) => Promise<void>;

type Enrollment = { secret: TotpSecret; qr: string; key: string };

function groupKey(key: string) {
  return key.replace(/(.{4})/g, "$1 ").trim();
}

/** Two-step verification with an authenticator app (TOTP): set up with a QR code or key, list, remove. */
export function TwoStepVerification({ product, productName, user, guard, onChanged }: {
  product: string;
  productName: string;
  user: User;
  guard: Guard;
  onChanged: () => void;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, setStarting] = useState(false);
  const [removing, setRemoveTarget] = useState<MultiFactorInfo | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const available = totpEnabled();
  const factors = multiFactor(user).enrolledFactors;

  async function afterChange(message: string) {
    await refreshProductSession(product).catch(() => undefined);
    onChanged();
    toast({ title: message });
  }

  async function start() {
    setStarting(true);
    try {
      await guard(async () => {
        const session = await multiFactor(user).getSession();
        const secret = await TotpMultiFactorGenerator.generateSecret(session);
        const url = secret.generateQrCodeUrl(user.email ?? "account", productName);
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 192, errorCorrectionLevel: "M" });
        setEnrollment({ secret, qr, key: secret.secretKey });
      });
    } catch (caught) {
      toast({ title: "Couldn't start setup", description: readableAuthError(caught), variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function remove(factor: MultiFactorInfo) {
    try {
      await guard(async () => {
        await multiFactor(user).unenroll(factor);
        await afterChange("Authenticator app removed");
      });
    } catch (caught) {
      toast({ title: "Couldn't remove it", description: readableAuthError(caught), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-step verification
          {factors.length ? <Badge variant="secondary"><ShieldCheck /> On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>
          After your password or provider, also enter a code from an authenticator app such as 1Password, Google Authenticator or Authy.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {factors.length ? (
          <ul className="grid gap-3">
            {factors.map((factor) => (
              <li key={factor.uid} className="flex flex-wrap items-center gap-3">
                <span className="grid size-9 place-items-center rounded-[var(--radius)] border bg-background">
                  <Smartphone className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{factor.displayName || "Authenticator app"}</span>
                  <span className="block text-xs text-muted-foreground">
                    Added {new Date(factor.enrollmentTime).toLocaleDateString(undefined, { dateStyle: "medium" })}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => { setRemoveTarget(factor); setRemoveOpen(true); }}>
                  <ShieldOff /> Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {!available ? (
          <Alert>
            <ShieldOff />
            <AlertTitle>Not switched on for this deployment yet</AlertTitle>
            <AlertDescription>
              Authenticator apps become available here once multi-factor sign-in is turned on for this
              site. There is nothing you need to do until then.
            </AlertDescription>
          </Alert>
        ) : !user.emailVerified ? (
          <Alert>
            <ShieldOff />
            <AlertTitle>Confirm your email first</AlertTitle>
            <AlertDescription>Two-step verification needs a confirmed email address. Confirm it under Sign-in methods.</AlertDescription>
          </Alert>
        ) : (
          <div>
            <Button onClick={start} disabled={starting}>
              {starting ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              {factors.length ? "Add another authenticator app" : "Set up an authenticator app"}
            </Button>
          </div>
        )}
      </CardContent>

      <EnrollDialog
        enrollment={enrollment}
        onClose={() => setEnrollment(null)}
        onEnroll={async (code, name) => {
          if (!enrollment) return;
          await guard(async () => {
            const assertion = TotpMultiFactorGenerator.assertionForEnrollment(enrollment.secret, code);
            await multiFactor(user).enroll(assertion, name || "Authenticator app");
            setEnrollment(null);
            await afterChange("Two-step verification is on");
          });
        }}
      />

      <AlertDialog open={removeOpen && removing !== null} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.displayName || "this authenticator app"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {factors.length <= 1
                ? "Signing in will only need your password or provider again. You can set it up again at any time."
                : "Codes from this app will stop working. Your other authenticator apps keep working."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) void remove(removing);
                setRemoveOpen(false);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EnrollDialog({ enrollment, onClose, onEnroll }: {
  enrollment: Enrollment | null;
  onClose: () => void;
  onEnroll: (code: string, name: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("Authenticator app");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onEnroll(code, name.trim());
      setCode("");
    } catch (caught) {
      setError(readableAuthError(caught, "That code didn't work. Try the newest one from your app."));
    } finally {
      setSaving(false);
    }
  }

  async function copyKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.key);
      toast({ title: "Setup key copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the key and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={enrollment !== null} onOpenChange={(open) => { if (!open && !saving) { setError(""); setCode(""); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Set up your authenticator app</DialogTitle>
            <DialogDescription>Scan the code with your app, then enter the six-digit code it shows.</DialogDescription>
          </DialogHeader>
          {enrollment ? (
            <div className="grid justify-items-center gap-3">
              <span className="rounded-[var(--radius)] border bg-card p-2">
                <Image src={enrollment.qr} alt="QR code to add this account to your authenticator app" width={192} height={192} unoptimized />
              </span>
              <div className="grid w-full gap-1.5">
                <Label htmlFor="totp-setup-key">Can&apos;t scan? Enter this key instead</Label>
                <div className="flex gap-2">
                  <Input id="totp-setup-key" readOnly value={groupKey(enrollment.key)} className="font-mono text-sm" onFocus={(event) => event.target.select()} />
                  <Button type="button" variant="outline" size="icon" onClick={copyKey} aria-label="Copy setup key">
                    <Copy />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="totp-setup-code">Six-digit code</Label>
            <TotpCodeInput id="totp-setup-code" value={code} onValueChange={setCode} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="totp-setup-name">Name this app</Label>
            <Input id="totp-setup-name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || code.length !== 6}>
              {saving ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Turn on
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
