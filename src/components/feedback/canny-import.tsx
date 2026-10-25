"use client";

import { useState, type ChangeEvent } from "react";
import { FileUp, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CannyMapResult } from "@/lib/feedback/canny";
import { STATUS_LABELS } from "@/lib/feedback/model";

import styles from "./feedback.module.css";
import { apiJson } from "./shared";

type ImportResult = { created: number; skippedExisting: number; createdBoards: number; createdTags: number };

export function CannyImport({ tenantId, isAdmin, onImported }: { tenantId: string; isAdmin: boolean; onImported: () => Promise<void> }) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<CannyMapResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/feedback/tenants/${tenantId}/imports`;

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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
    <section className={styles.panel}>
      <h2 className="text-lg font-bold">Import from Canny</h2>
      <p className={`${styles.muted} mt-1 text-sm`}>
        Use Canny&apos;s posts CSV export. Preview first: every row is mapped (board, title, details, status, author, votes, tags, date, link)
        and problems are listed before anything is written. Re-importing the same file is safe; rows already imported are skipped.
        Imported boards and tags start private. Canny&apos;s CSV has vote totals but not voter identities, so totals are kept as imported votes.
      </p>
      {!isAdmin ? <p className={`${styles.muted} mt-2 text-sm`}>Only owners and admins can import.</p> : (
        <div className={`${styles.stack} mt-3`}>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-canny-file"><FileUp className="mr-1 inline size-4" />Choose CSV</Label>
            <input id="fb-canny-file" type="file" accept=".csv,text/csv" onChange={readFile} className="text-sm" />
          </div>
          <Textarea value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); setResult(null); }} rows={4} placeholder="…or paste CSV here" aria-label="Canny CSV" className="font-mono text-xs" />
          <div className={styles.row}>
            <Button variant="outline" disabled={busy || !csv.trim()} onClick={() => void run(false)}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Preview mapping</Button>
            <Button disabled={busy || !preview || preview.posts.length === 0 || Boolean(result)} onClick={() => void run(true)}>Import {preview?.posts.length ?? 0} posts</Button>
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {result ? (
            <p className="text-sm text-emerald-700" role="status">
              Imported {result.created} posts ({result.skippedExisting} already present), created {result.createdBoards} boards and {result.createdTags} tags.
            </p>
          ) : null}
          {preview ? (
            <div className={styles.stack}>
              <p className="text-sm">
                {preview.posts.length} posts across {preview.boards.length} boards · {preview.problems.length} problems
                {preview.unmappedHeaders.length ? ` · ignored columns: ${preview.unmappedHeaders.join(", ")}` : ""}
              </p>
              {preview.problems.length ? (
                <ul className="grid gap-1 text-xs">
                  {preview.problems.slice(0, 50).map((problem, index) => <li key={index} className={styles.error}>Line {problem.line}: {problem.message}</li>)}
                </ul>
              ) : null}
              <div className={styles.tableWrap}>
                <Table>
                  <TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Board</TableHead><TableHead>Title</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Votes</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {preview.posts.slice(0, 100).map((post) => (
                      <TableRow key={post.sourceKey}>
                        <TableCell className={styles.mono}>{post.line}</TableCell>
                        <TableCell>{post.board}</TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal">{post.title}</TableCell>
                        <TableCell>{post.cannyStatus} → {STATUS_LABELS[post.status]}</TableCell>
                        <TableCell className="text-right font-mono">{post.voteCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
