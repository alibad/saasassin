"use client";

import { useEffect, useState } from "react";
import { Lightbulb, Pencil, Plus, Quote, Trash2, X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { describeAnswer } from "@/lib/studies/analysis";
import type { SessionSummary } from "@/lib/studies/data";
import {
  FINDING_SEVERITIES,
  FINDING_STATUS_LABELS,
  FINDING_STATUSES,
  SEVERITY_LABELS,
  type EvidenceInput,
  type Finding,
  type FindingInput,
  type FindingSeverity,
  type FindingStatus,
} from "@/lib/studies/findings";
import { blockTitle, type Block } from "@/lib/studies/model";

import { Byline } from "./people";
import { panel } from "./results-view";
import type { EvidenceDraft } from "./sessions-panel";

export type FindingView = Finding & { excludedEvidence: number };

const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  critical: "bg-destructive text-white",
  high: "bg-accent text-accent-foreground",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
};

/** Read-only list (workspace and the shared results link). */
export function FindingsList({ findings, onEdit, onDelete, showAuthor = false }: { findings: FindingView[]; onEdit?: (finding: FindingView) => void; onDelete?: (finding: FindingView) => void; showAuthor?: boolean }) {
  if (!findings.length) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        No findings yet. Cite the sessions or answers that show a problem, and the finding travels with its evidence.
      </p>
    );
  }
  return (
    <ul className="grid gap-3">
      {findings.map((finding) => (
        <li key={finding.id} className={`${panel} grid gap-3 p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${SEVERITY_STYLE[finding.severity]}`}>{SEVERITY_LABELS[finding.severity]}</Badge>
                <Badge variant="outline">{FINDING_STATUS_LABELS[finding.status]}</Badge>
              </div>
              <h3 className="brand-heading text-lg leading-snug break-words">{finding.title}</h3>
              {showAuthor && finding.createdBy?.email ? <Byline uid={finding.createdBy.uid} email={finding.createdBy.email} at={finding.updatedAt ?? finding.createdAt} /> : null}
            </div>
            {onEdit || onDelete ? (
              <div className="flex gap-1">
                {onEdit ? (
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${finding.title}`} onClick={() => onEdit(finding)}>
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${finding.title}`} onClick={() => onDelete(finding)}>
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {finding.summary ? <p className="whitespace-pre-wrap break-words text-sm">{finding.summary}</p> : null}
          <div className="grid gap-1">
            <p className="text-xs font-semibold text-muted-foreground">Evidence · {finding.evidence.length}</p>
            <ul className="grid gap-1">
              {finding.evidence.map((item, index) => (
                <li key={index} className="grid gap-0.5 rounded-r-md border-l-[3px] border-brand-accent bg-brand-subtle px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">
                    {item.kind === "response" ? `Session ${item.responseId.slice(0, 8)} · ` : "All answers · "}
                    {item.blockTitle} · v{item.version}
                  </span>
                  {item.excerpt ? <span className="whitespace-pre-wrap break-words">“{item.excerpt}”</span> : null}
                  {item.note ? <span className="text-xs">{item.note}</span> : null}
                </li>
              ))}
            </ul>
            {finding.excludedEvidence > 0 ? (
              <p className="text-xs text-destructive">
                {finding.excludedEvidence} cited session{finding.excludedEvidence === 1 ? " has" : "s have"} since been excluded for quality.
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

type FormState = { title: string; summary: string; severity: FindingSeverity; status: FindingStatus; evidence: (EvidenceInput & { label: string })[] };
const EMPTY: FormState = { title: "", summary: "", severity: "medium", status: "open", evidence: [] };
const WHOLE_BLOCK = "__block";

function toEvidenceInput(item: EvidenceInput): EvidenceInput {
  return item.kind === "response"
    ? { kind: "response", responseId: item.responseId, blockId: item.blockId, note: item.note }
    : { kind: "block", blockId: item.blockId, note: item.note };
}

export function FindingsPanel({
  findings,
  blocks,
  sessions,
  canEdit,
  pending,
  onPendingHandled,
  onSave,
  onDelete,
}: {
  findings: FindingView[];
  blocks: Block[];
  sessions: SessionSummary[];
  canEdit: boolean;
  pending: EvidenceDraft | null;
  onPendingHandled: () => void;
  onSave: (input: FindingInput, findingId?: string) => Promise<void>;
  onDelete: (findingId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pickBlock, setPickBlock] = useState("");
  const [pickSession, setPickSession] = useState(WHOLE_BLOCK);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<FindingView | null>(null);
  const questionBlocks = blocks.filter((block) => block.type !== "welcome");

  const labelFor = (item: EvidenceInput) => {
    const block = blocks.find((candidate) => candidate.id === item.blockId);
    const title = block ? blockTitle(block) : item.blockId;
    if (item.kind === "block") return `All answers · ${title}`;
    const session = sessions.find((candidate) => candidate.id === item.responseId);
    const excerpt = block && session ? describeAnswer(block, session.answers[item.blockId]) : "";
    return `Session ${item.responseId.slice(0, 8)} · ${title}${excerpt ? ` — “${excerpt.slice(0, 120)}”` : ""}`;
  };

  useEffect(() => {
    if (!pending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open the composer with evidence cited from a session
    setEditing(null);
    setForm({ ...EMPTY, evidence: [{ ...pending, note: "", label: labelFor(pending) }] });
    setOpen(true);
    onPendingHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labelFor reads the latest props
  }, [pending, onPendingHandled]);

  function startNew() {
    setEditing(null);
    setForm(EMPTY);
    setError("");
    setOpen(true);
  }

  function startEdit(finding: FindingView) {
    setEditing(finding.id);
    setForm({
      title: finding.title,
      summary: finding.summary,
      severity: finding.severity,
      status: finding.status,
      evidence: finding.evidence.map((item) => {
        const input: EvidenceInput =
          item.kind === "response" ? { kind: "response", responseId: item.responseId, blockId: item.blockId, note: item.note } : { kind: "block", blockId: item.blockId, note: item.note };
        return { ...input, label: item.kind === "response" ? `Session ${item.responseId.slice(0, 8)} · ${item.blockTitle} — “${item.excerpt.slice(0, 120)}”` : `All answers · ${item.blockTitle}` };
      }),
    });
    setError("");
    setOpen(true);
  }

  function addEvidence() {
    if (!pickBlock) return;
    const item: EvidenceInput =
      pickSession === WHOLE_BLOCK ? { kind: "block", blockId: pickBlock, note } : { kind: "response", responseId: pickSession, blockId: pickBlock, note };
    setForm((previous) => ({ ...previous, evidence: [...previous.evidence, { ...item, label: labelFor(item) }] }));
    setPickSession(WHOLE_BLOCK);
    setNote("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(
        { title: form.title, summary: form.summary, severity: form.severity, status: form.status, evidence: form.evidence.map(toEvidenceInput) },
        editing ?? undefined,
      );
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the finding.");
    } finally {
      setBusy(false);
    }
  }

  const answering = sessions.filter((session) => pickBlock && session.answers[pickBlock] !== undefined);

  return (
    <section className="grid gap-3" aria-labelledby="findings-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="findings-title" className="brand-heading flex items-center gap-2 text-xl">
          <Lightbulb className="size-5 text-brand-accent" aria-hidden="true" /> Findings
        </h3>
        {canEdit ? (
          <Button size="sm" onClick={startNew}>
            <Plus className="size-4" aria-hidden="true" /> New finding
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">Every finding cites the answers or blocks it rests on. Findings appear on the read-only results link and in every export.</p>
      <FindingsList findings={findings} onEdit={canEdit ? startEdit : undefined} onDelete={canEdit ? setDeleting : undefined} showAuthor />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit finding" : "New finding"}</DialogTitle>
            <DialogDescription>Cite at least one participant answer or block result as evidence.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="finding-title">Title</Label>
              <Input id="finding-title" maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="finding-summary">Summary</Label>
              <Textarea id="finding-summary" rows={3} maxLength={4000} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="finding-severity">Severity</Label>
                <Select value={form.severity} onValueChange={(value) => setForm({ ...form, severity: value as FindingSeverity })}>
                  <SelectTrigger id="finding-severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINDING_SEVERITIES.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {SEVERITY_LABELS[severity]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="finding-status">Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as FindingStatus })}>
                  <SelectTrigger id="finding-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINDING_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {FINDING_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="grid gap-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-semibold">Evidence</legend>
              {form.evidence.length === 0 ? <p className="text-sm text-destructive">No evidence yet — add at least one.</p> : null}
              <ul className="grid gap-1">
                {form.evidence.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-md bg-muted p-2 text-sm">
                    <Quote className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 break-words">
                      {item.label}
                      {item.note ? <span className="block text-xs text-muted-foreground">{item.note}</span> : null}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Remove evidence"
                      onClick={() => setForm({ ...form, evidence: form.evidence.filter((_, i) => i !== index) })}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={pickBlock}
                  onValueChange={(value) => {
                    setPickBlock(value);
                    setPickSession(WHOLE_BLOCK);
                  }}
                >
                  <SelectTrigger aria-label="Block" className="w-full">
                    <SelectValue placeholder="Choose a block" />
                  </SelectTrigger>
                  <SelectContent>
                    {questionBlocks.map((block) => (
                      <SelectItem key={block.id} value={block.id}>
                        {blockTitle(block).slice(0, 60)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={pickSession} onValueChange={setPickSession} disabled={!pickBlock}>
                  <SelectTrigger aria-label="Session" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WHOLE_BLOCK}>All answers to this block</SelectItem>
                    {answering.slice(0, 200).map((session) => {
                      const block = blocks.find((candidate) => candidate.id === pickBlock);
                      return (
                        <SelectItem key={session.id} value={session.id}>
                          {session.id.slice(0, 8)} — {block ? describeAnswer(block, session.answers[pickBlock]).slice(0, 60) : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input aria-label="Evidence note" placeholder="Note (optional)" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="min-w-48 flex-1" />
                <Button type="button" variant="outline" disabled={!pickBlock} onClick={addEvidence}>
                  <Plus className="size-4" aria-hidden="true" /> Add evidence
                </Button>
              </div>
            </fieldset>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !form.title.trim() || form.evidence.length === 0} onClick={save}>
              {editing ? "Save finding" : "Create finding"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(value) => !value && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this finding?</DialogTitle>
            <DialogDescription>“{deleting?.title}” is removed from results, the shared link and future exports. The audit log keeps a record.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!deleting) return;
                try {
                  await onDelete(deleting.id);
                } finally {
                  setDeleting(null);
                }
              }}
            >
              Delete finding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
