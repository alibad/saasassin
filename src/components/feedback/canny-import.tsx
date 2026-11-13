"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CannyMapResult } from "@/lib/feedback/canny";

import { SettingsSection } from "./settings-section";
import { apiJson, STATUS_DISPLAY } from "./shared";

type ImportResult = { created: number; skippedExisting: number; createdBoards: number; createdTags: number };

/** Canny posts CSV → preview of every mapped row and problem → idempotent import. */
export function CannyImport({ tenantId, isAdmin, onImported }: { tenantId: string; isAdmin: boolean; onImported: () => Promise<void> }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CannyMapResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const url = `/api/feedback/tenants/${tenantId}/imports`;

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
    setResult(null);
  }

  async function run(commit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = await apiJson<{ preview: CannyMapResult; result?: ImportResult }>(url, { method: "POST", body: JSON.stringify({ csv, commit }) });
      setPreview(body.preview);
      if (body.result) {
        setResult(body.result);
        await onImported();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection
      title="Bring your Canny board"
      description="Export your posts from Canny as CSV and preview exactly how each row maps before anything is written. Importing the same file twice is safe. Imported boards and tags start private."
    >
      {!isAdmin ? <p className="text-sm text-muted-foreground">Owners and admins can import.</p> : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileInput} id="fb-canny-file" type="file" accept=".csv,text/csv" onChange={readFile} className="sr-only" />
            <Button variant="outline" onClick={() => fileInput.current?.click()}><FileUp /> Choose CSV file</Button>
            <span className="text-sm text-muted-foreground">{fileName || "or paste the CSV below"}</span>
          </div>
          <Textarea value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); setResult(null); }} rows={4} placeholder="Board,Title,Details,Status,…" aria-label="Canny CSV" className="font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !csv.trim()} onClick={() => void run(false)}>{busy && !preview ? <LoaderCircle className="animate-spin" /> : null} Preview import</Button>
            <Button disabled={busy || !preview || preview.posts.length === 0 || Boolean(result)} onClick={() => void run(true)}>
              {busy && preview ? <LoaderCircle className="animate-spin" /> : null} Import {preview?.posts.length ?? 0} posts
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {result ? (
            <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground" role="status">
              <CheckCircle2 className="size-4" /> Imported {result.created} posts ({result.skippedExisting} were already here), with {result.createdBoards} new boards and {result.createdTags} tags.
            </p>
          ) : null}
          {preview ? (
            <div className="grid gap-3">
              <p className="text-sm">
                <strong>{preview.posts.length} posts</strong> across {preview.boards.length} boards · {preview.problems.length} to check
                {preview.unmappedHeaders.length ? ` · columns not imported: ${preview.unmappedHeaders.join(", ")}` : ""}
              </p>
              {preview.problems.length ? (
                <ul className="grid gap-1 rounded-lg bg-destructive/5 p-3 text-xs text-destructive">
                  {preview.problems.slice(0, 50).map((problem, index) => (
                    <li key={index} className="flex gap-1.5"><TriangleAlert className="mt-px size-3.5 shrink-0" /> Line {problem.line}: {problem.message}</li>
                  ))}
                </ul>
              ) : null}
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Board</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Votes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.posts.slice(0, 100).map((post) => (
                      <TableRow key={post.sourceKey}>
                        <TableCell className="tabular-nums text-muted-foreground">{post.line}</TableCell>
                        <TableCell>{post.board}</TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal font-medium">{post.title}</TableCell>
                        <TableCell className="text-muted-foreground">{post.cannyStatus} → {STATUS_DISPLAY[post.status]}</TableCell>
                        <TableCell className="text-right tabular-nums">{post.voteCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">Canny&apos;s CSV has vote totals but not who voted, so totals arrive as imported votes. Comments aren&apos;t in the CSV.</p>
            </div>
          ) : null}
        </div>
      )}
    </SettingsSection>
  );
}
