"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Mail } from "lucide-react";

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
};

export function EnrollPanel({ tenantId, courseSlug, priceLabel, paid, signedIn, enrolled }: Props) {
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
      setError(caught instanceof Error ? caught.message : "Could not enroll.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-3xl font-bold">{priceLabel}</p>
      {enrolled ? (
        <Button asChild size="lg" className="w-full"><Link href={`${base}/learn`}>Continue learning <ArrowRight aria-hidden="true" /></Link></Button>
      ) : paid ? (
        <Alert>
          <CircleAlert />
          <AlertTitle>Payments not connected</AlertTitle>
          <AlertDescription>This school has not connected a payment provider yet, so this course cannot be purchased. Leave your email below to hear when it opens.</AlertDescription>
        </Alert>
      ) : signedIn ? (
        <Button size="lg" className="w-full" onClick={enroll} disabled={pending}>{pending ? "Enrolling…" : "Enroll for free"} <ArrowRight aria-hidden="true" /></Button>
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link href={`/apps/creator/sign-in?next=${encodeURIComponent(base)}`}>Sign in to enroll for free <ArrowRight aria-hidden="true" /></Link>
        </Button>
      )}
      {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Not enrolled</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
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
      setError(caught instanceof Error ? caught.message : "Could not save your email.");
      setState("idle");
    }
  }

  if (state === "done") return <p className="text-sm text-emerald-700" role="status">Thanks — you are on the list for this course.</p>;

  return (
    <form onSubmit={submit} className="grid gap-2">
      <Label htmlFor="lead-email" className="flex items-center gap-2"><Mail className="size-4" aria-hidden="true" /> Get updates about this course</Label>
      <Input id="lead-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <label className="flex items-start gap-2 text-xs text-neutral-700">
        <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} aria-label="Consent to emails" />
        <span>I agree that this school may email me about this course. I can ask to be removed at any time.</span>
      </label>
      <Button type="submit" variant="outline" disabled={state === "pending" || !consent}>{state === "pending" ? "Saving…" : "Join the list"}</Button>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </form>
  );
}
