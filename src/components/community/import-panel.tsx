"use client";

import { useState } from "react";
import { FileUp, LoaderCircle, UserPlus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { runCircleImport } from "@/lib/community/data";

import { api, formatWhen, paperCard, type Workspace } from "./api";

type ImportResult = Awaited<ReturnType<typeof runCircleImport>>;

/** Owners and admins preview a Circle export, read the mapping report, then import. Nothing is written until they confirm. */
export function CircleImportCard({ tenantId, workspace, onDone }: { tenantId: string; workspace: Workspace; onDone: (message: string) => Promise<void> }) {
  const [files, setFiles] = useState<{ membersCsv: string; postsCsv: string; names: { members?: string; posts?: string } }>({ membersCsv: "", postsCsv: "", names: {} });
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const migration = workspace.migration;

  async function readFile(kind: "members" | "posts", file: File | undefined) {
    setPreview(null);
    setError(null);
    if (!file) return;
    if (file.size > 2_000_000) {
      setError(`${file.name} is larger than 2 MB. Split the export and import it in parts.`);
      return;
    }
    const text = await file.text();
    setFiles((current) => ({ ...current, [kind === "members" ? "membersCsv" : "postsCsv"]: text, names: { ...current.names, [kind]: file.name } }));
  }

  async function run(commit: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api<ImportResult>(`/api/community/tenants/${tenantId}/import/circle`, {
        method: "POST",
        body: JSON.stringify({ membersCsv: files.membersCsv, postsCsv: files.postsCsv, commit }),
      });
      if (commit) {
        setPreview(null);
        setFiles({ membersCsv: "", postsCsv: "", names: {} });
        await onDone(`Imported ${result.report.members.toInvite} pending invites and ${result.report.posts.toImport} posts from Circle.`);
      } else setPreview(result);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The import could not be read.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const report = preview?.report;
  const nothingNew = report ? report.members.toInvite === 0 && report.posts.toImport === 0 : true;

  return (
    <section className={`${paperCard} flex flex-col gap-3 p-4 lg:col-span-2`}>
      <h3 className="flex items-center gap-2 font-black"><FileUp size={18} /> Import from Circle</h3>
      <p className="text-sm text-[var(--muted)]">
        Upload Circle&apos;s members and/or posts CSV exports. You get a preview and mapping report first; nothing is written until you confirm. Members become pending invites: no accounts are created and nobody is emailed. When someone joins with the same email, their profile and imported posts are linked to them.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="circle-members">Members CSV</Label>
          <Input id="circle-members" type="file" accept=".csv,text/csv" onChange={(event) => void readFile("members", event.target.files?.[0])} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="circle-posts">Posts CSV</Label>
          <Input id="circle-posts" type="file" accept=".csv,text/csv" onChange={(event) => void readFile("posts", event.target.files?.[0])} />
        </div>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex gap-2">
        <Button variant="outline" disabled={busy || (!files.membersCsv && !files.postsCsv)} onClick={() => void run(false)}>
          {busy && !confirming ? <LoaderCircle className="animate-spin" /> : null} Preview import
        </Button>
        {report ? <Button disabled={busy || nothingNew} onClick={() => setConfirming(true)}>Import</Button> : null}
      </div>

      {report ? (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow><TableHead>What</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Will import</TableHead><TableHead className="text-right">Already here</TableHead><TableHead className="text-right">Skipped</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Members → pending invites</TableCell>
                <TableCell className="text-right">{report.members.total}</TableCell>
                <TableCell className="text-right font-bold">{report.members.toInvite}</TableCell>
                <TableCell className="text-right">{report.members.alreadyMembers + report.members.alreadyInvited}</TableCell>
                <TableCell className="text-right">{report.members.skipped.length}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Posts</TableCell>
                <TableCell className="text-right">{report.posts.total}</TableCell>
                <TableCell className="text-right font-bold">{report.posts.toImport}</TableCell>
                <TableCell className="text-right">{report.posts.alreadyImported}</TableCell>
                <TableCell className="text-right">{report.posts.skipped.length}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="text-sm">
            Spaces: {report.spaces.matched.length ? `${report.spaces.matched.map((space) => space.name).join(", ")} matched` : "none matched"}
            {report.spaces.toCreate.length ? `; ${report.spaces.toCreate.length} new (${report.spaces.toCreate.join(", ")})` : ""}.
            {" "}Authors: {report.authors.members} existing members, {report.authors.invitees} invitees, {report.authors.unknown} unknown.
          </p>
          {report.warnings.map((warning) => <p key={warning} className="text-sm text-[var(--muted)]">⚠ {warning}</p>)}
          {[...report.members.skipped.map((entry) => ({ ...entry, file: "members" })), ...report.posts.skipped.map((entry) => ({ ...entry, file: "posts" }))].length ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Skipped rows</summary>
              <ul className="mt-1 max-h-40 overflow-y-auto">
                {[...report.members.skipped.map((entry) => ({ ...entry, file: "members" })), ...report.posts.skipped.map((entry) => ({ ...entry, file: "posts" }))].map((entry) => (
                  <li key={`${entry.file}-${entry.row}`}>{entry.file} row {entry.row}: {entry.reason}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {preview?.sample.posts.length ? (
            <div className="text-sm">
              <p className="font-semibold">First posts</p>
              <ul className="list-disc pl-5">
                {preview.sample.posts.map((post) => <li key={`${post.title}-${post.createdAt}`}>{post.title} · {post.spaceName} · {post.authorName} · {formatWhen(post.createdAt)}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {migration && (migration.pendingInvites.length || migration.imports.length) ? (
        <div className="flex flex-col gap-2 border-t-2 border-[var(--ink)] pt-3">
          <h4 className="flex items-center gap-2 font-bold"><UserPlus size={16} /> Pending invites <Badge variant="secondary">{migration.pendingInvites.length}</Badge></h4>
          <p className="text-xs text-[var(--muted)]">Share the invite link with them. These emails are visible to owners and admins only.</p>
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
            {migration.pendingInvites.map((invite) => <li key={invite.id}>{invite.name || "No name"} · <span className="text-[var(--muted)]">{invite.email}</span></li>)}
          </ul>
          {migration.imports.length ? (
            <p className="text-xs text-[var(--muted)]">
              Last import {formatWhen(migration.imports[0].createdAt)}: {migration.imports[0].counts.invites} invites, {migration.imports[0].counts.posts} posts, {migration.imports[0].counts.spacesCreated} new spaces.
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import from Circle?</DialogTitle>
            <DialogDescription>
              {report ? `${report.members.toInvite} pending invites and ${report.posts.toImport} posts will be added${report.spaces.toCreate.length ? `, plus ${report.spaces.toCreate.length} new private spaces` : ""}. ` : ""}
              Re-running the same files later imports nothing twice. The import is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => void run(true)}>{busy ? <LoaderCircle className="animate-spin" /> : null} Import now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
