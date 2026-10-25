"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FilePlus2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CADENCE_LABELS,
  CONTROL_STATUS_LABELS,
  CONTROL_STATUSES,
  REVIEW_CADENCES,
  type ControlStatus,
  type ReviewCadence,
} from "@/lib/trust/model";

import {
  ControlPicker,
  EmptyState,
  Field,
  formatDate,
  FreshnessBadge,
  MemberSelect,
  panel,
  SimpleSelect,
  StatusBadge,
} from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Control = TrustSnapshot["controls"][number];

export function ControlsSection({ snapshot, act, busy, canEdit }: SectionProps) {
  const [framework, setFramework] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Control | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.controls.filter(
      (control) =>
        (framework === "all" || control.frameworkId === framework) &&
        (status === "all" || control.status === status) &&
        (!needle || `${control.requirementRefs.join(" ")} ${control.title} ${control.category} ${control.ownerEmail}`.toLowerCase().includes(needle)),
    );
  }, [snapshot.controls, framework, status, query]);

  const frameworkOptions = [
    { value: "all", label: "All frameworks" },
    ...snapshot.frameworks.filter((entry) => snapshot.settings.frameworkIds.includes(entry.id)).map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  const statusOptions = [{ value: "all", label: "All statuses" }, ...CONTROL_STATUSES.map((value) => ({ value, label: CONTROL_STATUS_LABELS[value] }))];

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Controls</h2>
          <p className="text-sm text-[#6d6c64]">Assign owners and track status. Implemented controls without current evidence show &ldquo;Needs evidence&rdquo; automatically.</p>
        </div>
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <SimpleSelect value={framework} onChange={setFramework} options={frameworkOptions} />
        <SimpleSelect value={status} onChange={setStatus} options={statusOptions} />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search controls or owners" className="rounded-none border-[#171715]" aria-label="Search controls" />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No controls match these filters." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Control</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Evidence</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((control) => (
                <TableRow key={control.id}>
                  <TableCell className="font-mono text-xs font-semibold">{control.requirementRefs.join(", ")}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">
                    <p className="font-semibold">{control.title}</p>
                    <p className="text-xs text-[#6d6c64]">{control.category}</p>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{control.ownerEmail || <span className="text-[#a33a1f]">Unassigned</span>}</TableCell>
                  <TableCell><StatusBadge status={control.status} /></TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{control.currentEvidenceCount}/{control.evidenceCount} current</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditing(control)}>
                      <Pencil /> {canEdit ? "Edit" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing ? (
        <ControlDialog key={editing.id} control={editing} snapshot={snapshot} act={act} busy={busy} canEdit={canEdit} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

function ControlDialog({
  control,
  snapshot,
  act,
  busy,
  canEdit,
  onClose,
}: {
  control: Control;
  snapshot: TrustSnapshot;
  act: SectionProps["act"];
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState(control.ownerEmail);
  const [status, setStatus] = useState<ControlStatus>(control.storedStatus);
  const [naJustification, setNaJustification] = useState(control.naJustification);
  const [notes, setNotes] = useState(control.notes);
  const linkedEvidence = snapshot.evidence.filter((item) => item.controlIds.includes(control.id));
  const naInvalid = status === "not_applicable" && naJustification.trim().length < 10;

  async function save() {
    const ok = await act({ action: "updateControl", controlId: control.id, ownerEmail, status, naJustification, notes });
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{control.requirementRefs.join(", ")} · {control.title}</DialogTitle>
          <DialogDescription>{control.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm"><strong>Suggested evidence:</strong> {control.suggestedEvidence}</p>
          <div className="flex items-center gap-2 text-sm">Effective status: <StatusBadge status={control.status} /></div>
          <Field label="Owner" htmlFor="control-owner">
            <MemberSelect id="control-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} />
          </Field>
          <Field label="Status" htmlFor="control-status" hint="Needs evidence is also applied automatically when evidence is missing or expired.">
            <SimpleSelect
              id="control-status"
              value={status}
              onChange={setStatus}
              disabled={!canEdit}
              options={CONTROL_STATUSES.map((value) => ({ value, label: CONTROL_STATUS_LABELS[value] }))}
            />
          </Field>
          {status === "not_applicable" ? (
            <Field label="Why is this not applicable?" htmlFor="control-na" hint="Required, at least 10 characters. Auditors will ask.">
              <Textarea id="control-na" value={naJustification} onChange={(event) => setNaJustification(event.target.value)} disabled={!canEdit} className="rounded-none border-[#171715]" />
            </Field>
          ) : null}
          <Field label="Implementation notes" htmlFor="control-notes">
            <Textarea id="control-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canEdit} className="rounded-none border-[#171715]" />
          </Field>
          <div>
            <p className="mb-2 text-sm font-semibold">Linked evidence ({linkedEvidence.length})</p>
            {linkedEvidence.length === 0 ? (
              <p className="text-sm text-[#6d6c64]">No evidence linked yet. Add it from the Evidence tab.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {linkedEvidence.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2">
                    <FreshnessBadge freshness={item.freshness} /> {item.title} <span className="text-[#6d6c64]">expires {formatDate(item.expiry)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button className="rounded-none" onClick={save} disabled={busy || naInvalid}>Save control</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EvidenceSection({ snapshot, act, busy, canEdit, isAdmin }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TrustSnapshot["evidence"][number] | null>(null);
  const controlTitles = new Map(snapshot.controls.map((control) => [control.id, `${control.requirementRefs.join(", ")} ${control.title}`]));

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Evidence</h2>
          <p className="text-sm text-[#6d6c64]">Links or pasted text with a collection date and review cadence. Expired evidence flips its controls to &ldquo;Needs evidence&rdquo;.</p>
        </div>
        {canEdit ? (
          <Button className="rounded-none" onClick={() => setAdding(true)} disabled={snapshot.controls.length === 0}>
            <FilePlus2 /> Add evidence
          </Button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-[#6d6c64]">File uploads are not configured in this deployment; link to the file in your own storage or paste the relevant text.</p>
      {snapshot.evidence.length === 0 ? (
        <EmptyState title="No evidence yet.">Start with a high-signal item such as your MFA enforcement setting or a recent access review.</EmptyState>
      ) : (
        <div className="grid gap-3">
          {snapshot.evidence.map((item) => (
            <article key={item.id} className="border border-[#171715] bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{item.title}</p>
                  {item.description ? <p className="text-sm text-[#6d6c64]">{item.description}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <FreshnessBadge freshness={item.freshness} />
                  {isAdmin ? (
                    <Button size="icon" variant="ghost" aria-label={`Remove ${item.title}`} onClick={() => setRemoving(item)}><Trash2 /></Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 grid gap-1 text-sm">
                {item.kind === "link" ? (
                  <a className="inline-flex items-center gap-1 break-all underline" href={item.url} target="_blank" rel="noreferrer noopener">
                    {item.url} <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap bg-[#f4f1e8] p-2 text-xs">{item.text}</pre>
                )}
                <p className="text-xs text-[#6d6c64]">
                  Collected {formatDate(item.collectedAt)} · {CADENCE_LABELS[item.cadence]} · Expires {formatDate(item.expiry)} · Added by {item.createdBy}
                </p>
                <p className="text-xs">Controls: {item.controlIds.map((id) => controlTitles.get(id) ?? id).join(" · ")}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {adding ? <EvidenceDialog snapshot={snapshot} act={act} busy={busy} onClose={() => setAdding(false)} /> : null}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="rounded-none border-2 border-[#171715]">
          <DialogHeader>
            <DialogTitle>Remove this evidence?</DialogTitle>
            <DialogDescription>&ldquo;{removing?.title}&rdquo; will be removed from every linked control. The removal is recorded in the activity log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="rounded-none"
              disabled={busy}
              onClick={async () => {
                if (removing && (await act({ action: "deleteEvidence", evidenceId: removing.id }))) setRemoving(null);
              }}
            >
              Remove evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EvidenceDialog({ snapshot, act, busy, onClose }: { snapshot: TrustSnapshot; act: SectionProps["act"]; busy: boolean; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"link" | "text">("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [controlIds, setControlIds] = useState<string[]>([]);
  const [collectedAt, setCollectedAt] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [cadence, setCadence] = useState<ReviewCadence>("annual");
  const [expiresAt, setExpiresAt] = useState("");

  async function save() {
    const ok = await act({ action: "addEvidence", title, description, kind, url, text, controlIds, collectedAt, cadence, expiresAt });
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add evidence</DialogTitle>
          <DialogDescription>Record what you collected, when, and how long it stays valid.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Title" htmlFor="evidence-title">
            <Input id="evidence-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Q4 access review" className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Description" htmlFor="evidence-description">
            <Textarea id="evidence-description" value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Type" htmlFor="evidence-kind">
            <SimpleSelect id="evidence-kind" value={kind} onChange={setKind} options={[{ value: "link", label: "Link to a document or system" }, { value: "text", label: "Pasted text" }]} />
          </Field>
          {kind === "link" ? (
            <Field label="Link" htmlFor="evidence-url">
              <Input id="evidence-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" className="rounded-none border-[#171715]" />
            </Field>
          ) : (
            <Field label="Evidence text" htmlFor="evidence-text">
              <Textarea id="evidence-text" value={text} onChange={(event) => setText(event.target.value)} rows={6} className="rounded-none border-[#171715]" />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Collected on" htmlFor="evidence-collected">
              <Input id="evidence-collected" type="date" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} className="rounded-none border-[#171715]" />
            </Field>
            <Field label="Review cadence" htmlFor="evidence-cadence">
              <SimpleSelect id="evidence-cadence" value={cadence} onChange={setCadence} options={REVIEW_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }))} />
            </Field>
          </div>
          <Field label="Explicit expiry (optional)" htmlFor="evidence-expires" hint="Overrides the cadence, e.g. a certificate's own expiry date.">
            <Input id="evidence-expires" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Controls this evidence supports">
            <ControlPicker controls={snapshot.controls} selected={controlIds} onChange={setControlIds} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button className="rounded-none" onClick={save} disabled={busy || !title.trim() || controlIds.length === 0}>Save evidence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
