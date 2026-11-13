"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, LoaderCircle, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { apiJson, panelClass } from "./client";

type Result = { enrolled: string[]; alreadyEnrolled: string[]; noAccount: string[]; invalid: string[] };

export function BulkEnrollCard({ tenantId, courseId }: { tenantId: string; courseId: string }) {
  const [emails, setEmails] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);
    try {
      setResult(await apiJson<Result>(`/api/creator/tenants/${tenantId}/courses/${courseId}/enrollments`, { method: "POST", body: JSON.stringify({ emails }) }));
      setEmails("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Those people couldn't be enrolled.");
    } finally {
      setPending(false);
    }
  }

  const groups: Array<[string, string[]]> = result
    ? [["Enrolled now", result.enrolled], ["Already enrolled", result.alreadyEnrolled], ["No Creator account yet. Send them the course page to sign up, then try again", result.noAccount], ["Not valid email addresses", result.invalid]]
    : [];

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle className="brand-heading text-xl">Enroll people yourself</CardTitle>
        <CardDescription>Give free access to people who already have a Creator account. Nobody is emailed; anyone without an account is listed so you can follow up.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor={`bulk-${courseId}`}>Email addresses</Label>
          <Textarea id={`bulk-${courseId}`} rows={3} value={emails} onChange={(event) => setEmails(event.target.value)} placeholder={"ana@example.com\nbo@example.com"} />
          <p className="text-xs text-muted-foreground">Separate with commas, spaces or new lines. Up to 200 at once.</p>
          <div><Button type="submit" className="rounded-xl" disabled={pending || !emails.trim()}>{pending ? <LoaderCircle className="animate-spin" /> : <UserPlus aria-hidden="true" />} Enroll</Button></div>
        </form>
        {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Nobody was enrolled</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
          <div key={label} className="rounded-xl bg-muted px-3 py-2 text-sm">
            <p className="font-medium">{label} ({list.length})</p>
            <p className="break-words text-muted-foreground">{list.join(", ")}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
