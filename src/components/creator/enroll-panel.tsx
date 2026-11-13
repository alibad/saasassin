"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, CircleAlert, LoaderCircle, Mail } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { apiJson } from "./client";

type Props = {
  tenantId: string;
  courseSlug: string;
  priceLabel: string;
  paid: boolean;
  signedIn: boolean;
  enrolled: boolean;
  revoked: boolean;
};

const INCLUDED = ["Learn at your own pace", "Progress saved as you go", "Discuss every lesson", "Certificate when you finish"];

export function EnrollPanel({ tenantId, courseSlug, priceLabel, paid, signedIn, enrolled, revoked }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const base = `/apps/creator/c/${tenantId}/${courseSlug}`;

  async function enroll() {
    setPending(true);
    setError("");
    try {
      await apiJson(`/api/creator/public/${tenantId}/${courseSlug}/enroll`, { method: "POST" });
      router.push(`${base}/learn`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "You couldn't be enrolled.");
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="brand-heading text-4xl">{priceLabel}</p>
      {revoked ? (
        <Alert className="rounded-xl">
          <CircleAlert />
          <AlertTitle>Your access was removed</AlertTitle>
          <AlertDescription>The school has removed your access to this course. If that seems wrong, get in touch with them.</AlertDescription>
        </Alert>
      ) : enrolled ? (
        <Button asChild size="lg" className="h-12 w-full rounded-xl text-base"><Link href={`${base}/learn`}>Continue learning <ArrowRight aria-hidden="true" /></Link></Button>
      ) : paid ? (
        <Alert className="rounded-xl border-0 bg-accent text-accent-foreground">
          <CircleAlert />
          <AlertTitle>Enrollment opens soon</AlertTitle>
          <AlertDescription className="text-accent-foreground/85">This school isn&apos;t taking payments yet, so the course can&apos;t be bought today. Leave your email below and they&apos;ll let you know.</AlertDescription>
        </Alert>
      ) : signedIn ? (
        <Button size="lg" className="h-12 w-full rounded-xl text-base" onClick={enroll} disabled={pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : null} Enroll for free <ArrowRight aria-hidden="true" />
        </Button>
      ) : (
        <Button asChild size="lg" className="h-12 w-full rounded-xl text-base">
          <Link href={`/apps/creator/sign-in?next=${encodeURIComponent(base)}`}>Sign up to enroll for free <ArrowRight aria-hidden="true" /></Link>
        </Button>
      )}
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>You weren&apos;t enrolled</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <ul className="grid gap-2 text-sm">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-full bg-secondary text-secondary-foreground"><Check className="size-3" aria-hidden="true" /></span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeadForm({ tenantId, courseSlug }: { tenantId: string; courseSlug: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("pending");
    setError("");
    try {
      await apiJson(`/api/creator/public/${tenantId}/${courseSlug}/leads`, { method: "POST", body: JSON.stringify({ email, consent }) });
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your email couldn't be saved.");
      setState("idle");
    }
  }

  if (state === "done") {
    return <p className="flex items-center gap-2 text-sm font-medium text-primary" role="status"><Check className="size-4" aria-hidden="true" /> You&apos;re on the list for this course.</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <Label htmlFor="lead-email" className="flex items-center gap-2 font-semibold"><Mail className="size-4 text-primary" aria-hidden="true" /> Not ready yet? Get updates</Label>
      <Input id="lead-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="h-10 rounded-xl bg-card" />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} aria-label="Agree to receive emails" className="mt-0.5" />
        <span>I agree that this school may email me about this course. I can ask to be removed at any time.</span>
      </label>
      <Button type="submit" variant="outline" className="rounded-xl bg-card" disabled={state === "pending" || !consent}>
        {state === "pending" ? <LoaderCircle className="animate-spin" /> : null} Keep me posted
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </form>
  );
}
