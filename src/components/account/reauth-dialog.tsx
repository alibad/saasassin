"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  type User,
} from "firebase/auth";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { PROVIDER_LABELS, providerFromFirebaseId, type AuthProviderId } from "@/lib/fleet/account/identity";

import { authErrorCode, readableAuthError } from "./auth-errors";
import { isReauthRequired, refreshProductSession } from "./client";
import {
  completeTotpChallenge,
  createProvider,
  isMultiFactorRequired,
  totpChallengeFromError,
  type TotpChallenge,
} from "./firebase-auth";
import { ProviderIcon } from "./provider-icons";
import { TotpCodeInput } from "./totp-code-input";

type ReauthDialogProps = {
  product: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the person has signed in again and this product's session has been refreshed. */
  onConfirmed: () => void | Promise<void>;
  description?: string;
};

/** "Confirm it's you": signs in again with an existing method before a sensitive change. */
export function ReauthDialog({ product, open, onOpenChange, onConfirmed, description }: ReauthDialogProps) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [challenge, setChallenge] = useState<TotpChallenge | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const auth = getFirebaseClientAuth();
    void auth.authStateReady().then(() => {
      if (!cancelled) setUser(auth.currentUser);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setPending(null);
    setError("");
    setChallenge(null);
    setCode("");
  }

  async function confirmed() {
    await refreshProductSession(product);
    reset();
    onOpenChange(false);
    await onConfirmed();
  }

  async function attempt(key: string, run: () => Promise<unknown>) {
    setPending(key);
    setError("");
    try {
      await run();
      await confirmed();
    } catch (caught) {
      if (isMultiFactorRequired(caught)) {
        const totp = totpChallengeFromError(getFirebaseClientAuth(), caught);
        if (totp) {
          setChallenge(totp);
          setCode("");
        } else {
          setError("Your account uses a second step this page cannot complete.");
        }
      } else if (authErrorCode(caught) !== "popup-closed-by-user") {
        setError(readableAuthError(caught, "That didn't work. Try again."));
      }
    } finally {
      setPending(null);
    }
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.email) return;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    void attempt("password", () => reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password)));
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    void attempt("totp", () => completeTotpChallenge(challenge, code));
  }

  const methods = (user?.providerData ?? [])
    .map((info) => providerFromFirebaseId(info.providerId))
    .filter((method): method is AuthProviderId | "password" => method !== null);
  const oauthMethods = methods.filter((method): method is AuthProviderId => method !== "password");
  const hasPassword = methods.includes("password");

  let body: ReactNode;
  if (user === undefined) {
    body = <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Checking your sign-in…</p>;
  } else if (user === null) {
    body = (
      <Alert>
        <AlertDescription>Your sign-in on this device has expired. Sign out, sign in again, then retry.</AlertDescription>
      </Alert>
    );
  } else if (challenge) {
    body = (
      <form className="grid gap-3" onSubmit={submitCode}>
        <div className="grid gap-1.5">
          <Label htmlFor={`${product}-reauth-totp`}>{challenge.displayName} code</Label>
          <TotpCodeInput id={`${product}-reauth-totp`} value={code} onValueChange={setCode} autoFocus required />
        </div>
        <Button type="submit" disabled={pending !== null || code.length !== 6}>
          {pending === "totp" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Confirm
        </Button>
      </form>
    );
  } else {
    body = (
      <div className="grid gap-3">
        {hasPassword ? (
          <form className="grid gap-3" onSubmit={submitPassword}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${product}-reauth-password`}>Password for {user.email}</Label>
              <Input id={`${product}-reauth-password`} name="password" type="password" autoComplete="current-password" autoFocus required />
            </div>
            <Button type="submit" disabled={pending !== null}>
              {pending === "password" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />} Confirm with password
            </Button>
          </form>
        ) : null}
        {oauthMethods.map((method) => (
          <Button
            key={method}
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void attempt(method, () => reauthenticateWithPopup(user, createProvider(method)))}
          >
            {pending === method ? <LoaderCircle className="animate-spin" /> : <ProviderIcon provider={method} />}
            Continue with {PROVIDER_LABELS[method]}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm it&apos;s you</DialogTitle>
          <DialogDescription>{description ?? "For your security, sign in again before making this change."}</DialogDescription>
        </DialogHeader>
        {body}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription aria-live="polite">{error}</AlertDescription>
          </Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Runs an action; if the server or Firebase says the sign-in is too old, asks the person to
 * confirm it's them and then runs the action again.
 */
export function useReauthGuard(product: string) {
  const [retry, setRetry] = useState<(() => Promise<void>) | null>(null);

  async function guard(action: () => Promise<void>) {
    try {
      await action();
    } catch (caught) {
      if (isReauthRequired(caught) || authErrorCode(caught) === "requires-recent-login") {
        setRetry(() => action);
        return;
      }
      throw caught;
    }
  }

  const dialog = (
    <ReauthDialog
      product={product}
      open={retry !== null}
      onOpenChange={(open) => { if (!open) setRetry(null); }}
      onConfirmed={async () => {
        const action = retry;
        setRetry(null);
        if (!action) return;
        try {
          await action();
        } catch (caught) {
          toast({ title: "That didn't work", description: readableAuthError(caught), variant: "destructive" });
        }
      }}
    />
  );

  return { guard, dialog };
}
