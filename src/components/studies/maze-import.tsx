"use client";

import { useState, type ChangeEvent } from "react";
import { FileUp, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { MazeMapping } from "@/lib/studies/maze";
import { BLOCK_TYPE_LABELS, blockTitle, type Block, type StudyRecord } from "@/lib/studies/model";

type Preview = { committed: false; blocks: Block[]; report: MazeMapping["report"]; sample: MazeMapping["responses"] };

const MAPPING_STYLE: Record<string, string> = {
  block: "bg-accent text-accent-foreground",
  timing: "bg-secondary text-secondary-foreground",
  metadata: "bg-secondary text-secondary-foreground",
  dropped: "bg-muted text-muted-foreground",
};

/** Two steps: map + preview the report (nothing written), then import as a closed read-only study. */
export function MazeImportDialog({
  open,
  onOpenChange,
  tenantId,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onImported: (study: StudyRecord) => void;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setCsv("");
    setFileName("");
    setTitle("");
    setPreview(null);
    setError("");
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(null);
    setError("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("The file is larger than 5 MB.");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    if (!title) setTitle(`${file.name.replace(/\.csv$/i, "")} (Maze import)`.slice(0, 200));
  }

  async function send(commit: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/studies/tenants/${tenantId}/imports/maze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, fileName, title, commit }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `Import failed (${response.status}).`);
      if (commit) {
        onImported(payload.study as StudyRecord);
        reset();
        onOpenChange(false);
      } else setPreview(payload as Preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a Maze study</DialogTitle>
          <DialogDescription>
            Upload the results CSV from Maze. You will see exactly how each column maps before anything is saved. Imported studies are closed and
            read-only; emails, names and device data are never imported.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="maze-file">Maze results CSV</Label>
            <Input id="maze-file" type="file" accept=".csv,text/csv" onChange={readFile} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="maze-title">Study title</Label>
            <Input id="maze-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {preview ? (
          <div className="grid gap-3">
            <p className="text-sm">
              <strong>{preview.report.imported}</strong> of {preview.report.rows} rows will be imported as sessions into{" "}
              <strong>{preview.blocks.length}</strong> blocks.
              {preview.report.skipped.length ? ` ${preview.report.skipped.length} rows are skipped (no answers).` : ""}
            </p>
            {preview.report.warnings.length ? (
              <ul className="grid gap-1 rounded-lg border border-border bg-accent text-accent-foreground p-3 text-sm">
                {preview.report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Maze column</TableHead>
                    <TableHead>Becomes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.report.columns.map((column, index) => (
                    <TableRow key={`${column.header}-${index}`}>
                      <TableCell className="max-w-64 break-words">{column.header}</TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge className={`${MAPPING_STYLE[column.mapping]}`}>{column.mapping}</Badge>
                          <span className="text-sm">{column.detail}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ol className="grid gap-1 text-sm">
              {preview.blocks.map((block, index) => (
                <li key={block.id}>
                  {index + 1}. {blockTitle(block)} <Badge variant="outline">{BLOCK_TYPE_LABELS[block.type]}</Badge>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button disabled={busy || !title.trim()} onClick={() => send(true)}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
              Import {preview.report.imported} sessions
            </Button>
          ) : (
            <Button disabled={busy || !csv || !title.trim()} onClick={() => send(false)}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null} Preview mapping
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
