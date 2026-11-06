"use client";

import { useState, type FormEvent } from "react";
import { FileUp, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_ICS_CHARS, type PlannerSnapshot } from "@/lib/planner/model";

import { apiJson } from "./format";
import styles from "./planner.module.css";

const EVERYONE = "__everyone";

type ImportSummary = {
  fileName: string;
  eventCount: number;
  instances: number;
  created: number;
  updated: number;
  unchanged: number;
  removed: number;
  skipped: Array<{ uid: string; title: string; reason: string }>;
  warnings: string[];
};

export function IcsImportCard({ snapshot, base, onImported }: { snapshot: PlannerSnapshot; base: string; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [memberId, setMemberId] = useState(EVERYONE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSummary(null);
    if (!file) return setError("Choose an .ics file exported from your calendar.");
    if (file.size > MAX_ICS_CHARS) return setError("That calendar file is larger than 2 MB. Export a shorter date range.");
    setLoading(true);
    try {
      const ics = await file.text();
      const result = await apiJson<ImportSummary>(`${base}/events/import`, {
        method: "POST",
        body: JSON.stringify({ ics, fileName: file.name, memberId: memberId === EVERYONE ? null : memberId }),
      });
      setSummary(result);
      await onImported();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={styles.panel}>
      <CardHeader>
        <CardTitle>Import an .ics calendar file</CardTitle>
        <CardDescription>
          Export from Google Calendar, Outlook or Apple Calendar and upload it. Meetings in the next 60 days become busy time; repeating meetings,
          time zones, all-day events and exceptions are handled. Importing the same file again updates it instead of duplicating.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={submit}>
          <div className="grid gap-1">
            <Label htmlFor="ics-file">Calendar file</Label>
            <Input id="ics-file" type="file" accept=".ics,text/calendar" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-1">
            <Label>Who is busy</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full" aria-label="Who is busy"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={EVERYONE}>Everyone</SelectItem>
                {snapshot.members.map((member) => <SelectItem key={member.uid} value={member.uid}>{member.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <FileUp />} Import</Button>
        </form>
        {error && <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert>}
        {summary && (
          <Alert className="mt-3">
            <FileUp />
            <AlertTitle>Imported {summary.fileName}</AlertTitle>
            <AlertDescription>
              <p>
                {summary.eventCount} event{summary.eventCount === 1 ? "" : "s"} read · {summary.instances} busy block{summary.instances === 1 ? "" : "s"} in the window:{" "}
                {summary.created} new, {summary.updated} updated, {summary.unchanged} unchanged, {summary.removed} removed. Re-run the scheduler to plan around them.
              </p>
              {summary.skipped.length > 0 && (
                <p>Skipped {summary.skipped.length}: {summary.skipped.slice(0, 5).map((entry) => `${entry.title} (${entry.reason.toLowerCase()})`).join("; ")}{summary.skipped.length > 5 ? "…" : ""}</p>
              )}
              {summary.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
