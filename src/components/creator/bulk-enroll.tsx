"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, UserPlus } from "lucide-react";

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
      setError(caught instanceof Error ? caught.message : "Could not enroll those people.");
    } finally {
      setPending(false);
    }
  }

  const groups: Array<[string, string[]]> = result
    ? [["Enrolled now", result.enrolled], ["Already enrolled", result.alreadyEnrolled], ["No SaaSassin account yet — ask them to sign up, then try again", result.noAccount], ["Not valid email addresses", result.invalid]]
    : [];

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Enroll learners by email</CardTitle>
        <CardDescription>Grants free access to people who already have a SaaSassin account. No accounts are created and no email is sent; anyone without an account is listed so you can follow up.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor={`bulk-${courseId}`}>Email addresses (comma, space or one per line, up to 200)</Label>
          <Textarea id={`bulk-${courseId}`} rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"ana@example.com\nbo@example.com"} />
          <div><Button type="submit" disabled={pending || !emails.trim()}><UserPlus aria-hidden="true" /> {pending ? "Enrolling…" : "Enroll"}</Button></div>
        </form>
        {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Not enrolled</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
          <div key={label} className="text-sm">
            <p className="font-semibold">{label} ({list.length})</p>
            <p className="break-words text-neutral-700">{list.join(", ")}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
