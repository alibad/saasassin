"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  type User,
  updateProfile,
} from "firebase/auth";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

function readableAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("email-already-in-use")) return "An account already exists for this email. Sign in instead.";
  if (code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("weak-password")) return "Use at least eight characters for your password.";
  if (code.includes("invalid-email")) return "Enter a valid work email.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  if (code.includes("popup-closed-by-user")) return "Google sign-in was closed before it finished.";
  if (code.includes("popup-blocked")) return "Your browser blocked the Google sign-in window. Allow pop-ups and try again.";
  if (code.includes("account-exists-with-different-credential")) return "This email already uses another sign-in method. Sign in that way first.";
  if (code.includes("operation-not-allowed")) return "Google sign-in is not available right now. Use email and password instead.";
  return error instanceof Error ? error.message : "Authentication failed. Try again.";
}

type FleetAuthFormProps = {
  product: string;
  productName: string;
  description: string;
  /** Where to land after the session is created, e.g. "/apps/research". */
  next: string;
};

export function FleetAuthForm({ product, productName, description, next }: FleetAuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");

  async function startSecureSession(user: User) {
    const idToken = await user.getIdToken(true);
    const response = await fetch(`/api/fleet/${product}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not start a secure session.");
    router.push(next);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("email");
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();

    try {
      const auth = getFirebaseClientAuth();
      const credential = mode === "signup"
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      if (mode === "signup" && name) {
        await updateProfile(credential.user, { displayName: name });
      }
      await startSecureSession(credential.user);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setPending(null);
    }
  }

  async function continueWithGoogle() {
    setPending("google");
    setError("");

    try {
      const auth = getFirebaseClientAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      await startSecureSession(credential.user);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="lattice-auth-card">
      <CardHeader>
        <div className="lattice-auth-brand" aria-label={`SaaSassin ${productName}`}>
          <span className="lattice-auth-mark">
            <Image src="/brand/saasassin-mark.png" alt="" width={46} height={46} priority />
          </span>
          <span className="lattice-auth-wordmark">
            <strong>SaaSassin</strong>
            <span>{productName}</span>
          </span>
        </div>
        <CardTitle>{mode === "signup" ? `Create your ${productName} account` : `Welcome back to ${productName}`}</CardTitle>
        <CardDescription>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signup">Create account</TabsTrigger>
            <TabsTrigger value="signin">Sign in</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          className="google-auth-button"
          type="button"
          variant="outline"
          size="lg"
          onClick={continueWithGoogle}
          disabled={pending !== null}
        >
          {pending === "google" ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Image
              src="https://developers.google.com/static/identity/images/g-logo.png"
              alt=""
              width={18}
              height={18}
            />
          )}
          {mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
        </Button>

        <div className="lattice-auth-divider" aria-hidden="true">
          <span />
          <strong>or continue with email</strong>
          <span />
        </div>

        <form className="lattice-form-stack" onSubmit={submit}>
          {mode === "signup" ? (
            <div className="grid gap-2">
              <Label htmlFor="fleet-name">Full name</Label>
              <Input id="fleet-name" name="name" autoComplete="name" minLength={2} required />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="fleet-email">Work email</Label>
            <Input id="fleet-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="fleet-password">Password</Label>
            <Input
              id="fleet-password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={8}
              required
            />
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not continue</AlertTitle>
              <AlertDescription aria-live="polite">{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" size="lg" disabled={pending !== null}>
            {pending === "email" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
