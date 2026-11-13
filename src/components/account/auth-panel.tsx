"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  linkWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { ArrowLeft, ArrowRight, LoaderCircle, MailCheck, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { PROVIDER_LABELS, sanitizeNextPath, type AuthProviderId } from "@/lib/fleet/account/identity";
import { cn } from "@/lib/utils";

import { authErrorCode, readableAuthError } from "./auth-errors";
import { accountRequest, sessionEndpoint } from "./client";
import {
  completeTotpChallenge,
  createProvider,
  credentialFromError,
  emailFromError,
  enabledProviders,
  isMultiFactorRequired,
  totpChallengeFromError,
  type TotpChallenge,
} from "./firebase-auth";
import { ProviderIcon } from "./provider-icons";
import { TotpCodeInput } from "./totp-code-input";

export type AuthPanelProps = {
  /** Fleet product slug ("research", …) or "performance". Picks the session endpoint. */
  product: string;
  productName: string;
  /** One line under the title. */
  description?: string;
  /** Where to go after signing in, unless the URL carries a safe ?next=/relative/path. */
  next: string;
  /** The product's mark, shown above the title. */
  mark?: ReactNode;
  defaultMode?: "signup" | "signin";
  /** Called once the session cookie is set. Defaults to navigating to `next`. */
  onSignedIn?: () => void;
  /** Prefills the email field (for example from an invitation). */
  defaultEmail?: string;
  className?: string;
};

type Mode = "signup" | "signin" | "reset" | "verify" | "totp";

type PendingLink = { provider: AuthProviderId; email: string; credential: AuthCredential };

/**
 * Sign in and sign up for one product: Google always, Microsoft / GitHub / Apple when switched
 * on (NEXT_PUBLIC_FLEET_AUTH_PROVIDERS), email and password with reset and verification,
 * account linking when an email already uses another method, and authenticator-app codes for
 * accounts with two-step verification.
 */
export function AuthPanel({
  product,
  productName,
  description,
  next,
  mark,
  defaultMode = "signup",
  onSignedIn,
  defaultEmail = "",
  className,
}: AuthPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [challenge, setChallenge] = useState<TotpChallenge | null>(null);
  const [code, setCode] = useState("");
  const [verifyingUser, setVerifyingUser] = useState<User | null>(null);
  const providers = enabledProviders();

  function destination() {
    const fallback = sanitizeNextPath(next, "/");
    if (typeof window === "undefined") return fallback;
    return sanitizeNextPath(new URLSearchParams(window.location.search).get("next"), fallback);
  }

  function done() {
    if (onSignedIn) {
      onSignedIn();
      return;
    }
    router.push(destination());
    router.refresh();
  }

  async function startSession(user: User) {
    const idToken = await user.getIdToken(true);
    await accountRequest(sessionEndpoint(product), { method: "POST", json: { idToken } });
  }

  async function finishSignIn(user: User, options: { newEmailAccount?: boolean } = {}) {
    if (pendingLink) {
      try {
        await linkWithCredential(user, pendingLink.credential);
      } catch (caught) {
        if (authErrorCode(caught) !== "provider-already-linked") {
          setNotice(`Signed in, but ${PROVIDER_LABELS[pendingLink.provider]} could not be connected: ${readableAuthError(caught)}`);
        }
      }
      setPendingLink(null);
    }
    await startSession(user);
    if (options.newEmailAccount && !user.emailVerified) {
      await sendEmailVerification(user).catch(() => undefined);
      setVerifyingUser(user);
      setMode("verify");
      return;
    }
    done();
  }

  function handleFailure(caught: unknown, provider?: AuthProviderId) {
    const auth = getFirebaseClientAuth();
    if (isMultiFactorRequired(caught)) {
      const totp = totpChallengeFromError(auth, caught);
      if (!totp) {
        setError("This account uses a second step this page cannot complete. Sign in with an authenticator app instead.");
        return;
      }
      setChallenge(totp);
      setCode("");
      setMode("totp");
      return;
    }
    if (provider && authErrorCode(caught) === "account-exists-with-different-credential") {
      const credential = credentialFromError(provider, caught);
      const existingEmail = emailFromError(caught);
      if (credential) {
        setPendingLink({ provider, email: existingEmail, credential });
        if (existingEmail) setEmail(existingEmail);
        setMode("signin");
        setError("");
        return;
      }
    }
    setError(readableAuthError(caught, "Sign-in didn't work. Try again."));
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setPending("email");
    setError("");
    setNotice("");
    try {
      const auth = getFirebaseClientAuth();
      if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name) await updateProfile(credential.user, { displayName: name });
        await finishSignIn(credential.user, { newEmailAccount: true });
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        await finishSignIn(credential.user);
      }
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setPending(null);
    }
  }

  async function continueWith(provider: AuthProviderId) {
    setPending(provider);
    setError("");
    setNotice("");
    try {
      const credential = await signInWithPopup(getFirebaseClientAuth(), createProvider(provider));
      await finishSignIn(credential.user);
    } catch (caught) {
      handleFailure(caught, provider);
    } finally {
      setPending(null);
    }
  }

  async function submitTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setPending("totp");
    setError("");
    try {
      const credential = await completeTotpChallenge(challenge, code);
      setChallenge(null);
      await finishSignIn(credential.user);
    } catch (caught) {
      setError(readableAuthError(caught, "That code didn't work. Try the newest one from your app."));
    } finally {
      setPending(null);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("reset");
    setError("");
    try {
      await sendPasswordResetEmail(getFirebaseClientAuth(), email.trim());
      setNotice(`If an account uses ${email.trim()}, a link to reset its password is on its way. Check your inbox and spam folder.`);
    } catch (caught) {
      const code = authErrorCode(caught);
      if (code === "user-not-found") {
        setNotice(`If an account uses ${email.trim()}, a link to reset its password is on its way. Check your inbox and spam folder.`);
      } else {
        setError(readableAuthError(caught));
      }
    } finally {
      setPending(null);
    }
  }

  async function checkVerified() {
    if (!verifyingUser) return;
    setPending("verified");
    setError("");
    try {
      await verifyingUser.reload();
      if (!verifyingUser.emailVerified) {
        setError("We haven't seen the confirmation yet. Open the link in the email, then try again.");
        return;
      }
      await startSession(verifyingUser);
      done();
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setPending(null);
    }
  }

  async function resendVerification() {
    if (!verifyingUser) return;
    setPending("resend");
    setError("");
    try {
      await sendEmailVerification(verifyingUser);
      setNotice(`We sent another link to ${verifyingUser.email}.`);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;
  const title = {
    signup: `Create your ${productName} account`,
    signin: `Sign in to ${productName}`,
    reset: "Reset your password",
    verify: "Check your email",
    totp: "Two-step verification",
  }[mode];
  const subtitle = {
    signup: description,
    signin: description,
    reset: "Enter the email you sign in with and we'll send you a link to choose a new password.",
    verify: undefined,
    totp: "Enter the six-digit code from your authenticator app.",
  }[mode];

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader className="gap-2">
        {mark ? <div className="mb-2 flex items-center">{mark}</div> : null}
        <CardTitle className="text-xl">{title}</CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {mode === "signup" || mode === "signin" ? (
          <>
            <Tabs value={mode} onValueChange={(value) => { setMode(value as Mode); setError(""); setNotice(""); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signup">Create account</TabsTrigger>
                <TabsTrigger value="signin">Sign in</TabsTrigger>
              </TabsList>
            </Tabs>

            {pendingLink ? (
              <Alert>
                <ShieldCheck />
                <AlertTitle>You already have an account{pendingLink.email ? ` for ${pendingLink.email}` : ""}</AlertTitle>
                <AlertDescription>
                  Sign in the way you did before. We&apos;ll then connect {PROVIDER_LABELS[pendingLink.provider]} so you can use either.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-2">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => continueWith(provider)}
                  disabled={busy || pendingLink?.provider === provider}
                >
                  {pending === provider ? <LoaderCircle className="animate-spin" /> : <ProviderIcon provider={provider} />}
                  Continue with {PROVIDER_LABELS[provider]}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or use your email
              <span className="h-px flex-1 bg-border" />
            </div>

            <form className="grid gap-3" onSubmit={submitEmail}>
              {mode === "signup" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${product}-auth-name`}>Full name</Label>
                  <Input id={`${product}-auth-name`} name="name" autoComplete="name" minLength={2} maxLength={80} required />
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor={`${product}-auth-email`}>Email</Label>
                <Input
                  id={`${product}-auth-email`}
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${product}-auth-password`}>Password</Label>
                  {mode === "signin" ? (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto px-0"
                      onClick={() => { setMode("reset"); setError(""); setNotice(""); }}
                    >
                      Forgot password?
                    </Button>
                  ) : null}
                </div>
                <Input
                  id={`${product}-auth-password`}
                  name="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                />
                {mode === "signup" ? <p className="text-xs text-muted-foreground">At least eight characters.</p> : null}
              </div>
              <Button type="submit" size="lg" disabled={busy}>
                {pending === "email" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
                {mode === "signup" ? "Create account" : "Sign in"}
              </Button>
            </form>
          </>
        ) : null}

        {mode === "reset" ? (
          <form className="grid gap-3" onSubmit={submitReset}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${product}-reset-email`}>Email</Label>
              <Input
                id={`${product}-reset-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <Button type="submit" size="lg" disabled={busy}>
              {pending === "reset" ? <LoaderCircle className="animate-spin" /> : <MailCheck />}
              Send reset link
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>
              <ArrowLeft /> Back to sign in
            </Button>
          </form>
        ) : null}

        {mode === "verify" ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium text-foreground">{verifyingUser?.email}</span>.
              Confirming it lets teammates&apos; invitations to that address find you.
            </p>
            <Button type="button" size="lg" onClick={checkVerified} disabled={busy}>
              {pending === "verified" ? <LoaderCircle className="animate-spin" /> : <MailCheck />}
              I&apos;ve confirmed my email
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={resendVerification} disabled={busy}>
                {pending === "resend" ? <LoaderCircle className="animate-spin" /> : null}
                Send the link again
              </Button>
              <Button type="button" variant="ghost" onClick={done} disabled={busy}>
                Continue for now <ArrowRight />
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "totp" ? (
          <form className="grid gap-3" onSubmit={submitTotp}>
            <div className="grid gap-1.5">
              <Label htmlFor={`${product}-auth-totp`}>{challenge?.displayName ?? "Authenticator app"} code</Label>
              <TotpCodeInput id={`${product}-auth-totp`} value={code} onValueChange={setCode} autoFocus required />
            </div>
            <Button type="submit" size="lg" disabled={busy || code.length !== 6}>
              {pending === "totp" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
              Verify and sign in
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setChallenge(null); setMode("signin"); setError(""); }}>
              <ArrowLeft /> Use a different account
            </Button>
          </form>
        ) : null}

        {notice ? (
          <Alert>
            <MailCheck />
            <AlertDescription aria-live="polite">{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t continue</AlertTitle>
            <AlertDescription aria-live="polite">{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
