"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ExternalLink, FilePlus2, FileText, Link2, Search, Trash2 } from "lucide-react";

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
import { cn } from "@/lib/utils";

import {
  ControlPicker,
  displayName,
  EmptyState,
  Field,
  formatDate,
  FreshnessBadge,
  MemberSelect,
  PageHeader,
  panel,
  PersonCell,
  Pill,
  ReviewBadge,
  SimpleSelect,
  StatusBadge,
} from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Control = TrustSnapshot["controls"][number];

export function ControlsSection({ snapshot, act, busy, canEdit }: SectionProps) {
  const [framework, setFramework] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [owner, setOwner] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Control | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.controls.filter(
      (control) =>
        (framework === "all" || control.frameworkId === framework) &&
        (status === "all" || control.status === status) &&
        (owner === "all" || (owner === "none" ? !control.ownerEmail : control.ownerEmail.toLowerCase() === owner)) &&
        (!needle || `${control.requirementRefs.join(" ")} ${control.title} ${control.category} ${control.ownerEmail}`.toLowerCase().includes(needle)),
    );
  }, [snapshot.controls, framework, status, owner, query]);

  const frameworkOptions = [
    { value: "all", label: "All frameworks" },
    ...snapshot.frameworks.filter((entry) => snapshot.settings.frameworkIds.includes(entry.id)).map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  const statusOptions = [{ value: "all", label: "Any status" }, ...CONTROL_STATUSES.map((value) => ({ value, label: CONTROL_STATUS_LABELS[value] }))];
  const ownerOptions = [
    { value: "all", label: "Any owner" },
    { value: "none", label: "No owner" },
    ...snapshot.members.map((member) => ({ value: member.email.toLowerCase(), label: member.name || member.email })),
  ];
  const implemented = snapshot.controls.filter((control) => control.status === "implemented").length;

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Controls"
        description="Each control has an owner, a status and the evidence behind it. Implemented controls without current evidence show Needs evidence automatically."
        meta={<Pill tone="positive">{implemented} of {snapshot.controls.length} implemented</Pill>}
      />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_200px_180px_200px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search controls, e.g. CC6.1 or encryption" className="pl-8" aria-label="Search controls" />
        </div>
        <SimpleSelect value={framework} onChange={setFramework} options={frameworkOptions} ariaLabel="Framework" />
        <SimpleSelect value={status} onChange={setStatus} options={statusOptions} ariaLabel="Status" />
        <SimpleSelect value={owner} onChange={setOwner} options={ownerOptions} ariaLabel="Owner" />
      </div>
      <section className={cn(panel, "overflow-hidden")}>
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No controls match these filters">Clear a filter to see the rest of your program.</EmptyState></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-28 pl-4 sm:pl-5">Ref</TableHead>
                <TableHead>Control</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Evidence</TableHead>
                <TableHead className="w-10"><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((control) => (
                <TableRow key={control.id} className="cursor-pointer" onClick={() => setEditing(control)}>
                  <TableCell className="pl-4 align-top font-mono text-xs font-medium sm:pl-5">{control.requirementRefs.join(", ")}</TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <button type="button" className="text-left font-medium hover:underline" onClick={(event) => { event.stopPropagation(); setEditing(control); }}>{control.title}</button>
                    <p className="text-xs text-muted-foreground">{control.category}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><PersonCell snapshot={snapshot} email={control.ownerEmail} /></TableCell>
                  <TableCell><StatusBadge status={control.status} /></TableCell>
                  <TableCell className="hidden text-right font-mono text-xs tabular-nums sm:table-cell">
                    <span className={control.currentEvidenceCount ? "" : "text-muted-foreground"}>{control.currentEvidenceCount}</span>
                    <span className="text-muted-foreground">/{control.evidenceCount} current</span>
                  </TableCell>
                  <TableCell><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      {editing ? (
        <ControlDialog key={editing.id} control={editing} snapshot={snapshot} act={act} busy={busy} canEdit={canEdit} onClose={() => setEditing(null)} />
      ) : null}
    </div>
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
  const [addingEvidence, setAddingEvidence] = useState(false);
  const linkedEvidence = snapshot.evidence.filter((item) => item.controlIds.includes(control.id));
  const naInvalid = status === "not_applicable" && naJustification.trim().length < 10;

  async function save() {
    const ok = await act({ action: "updateControl", controlId: control.id, ownerEmail, status, naJustification, notes });
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium text-muted-foreground">{control.requirementRefs.join(", ")} · {control.category}</span>
            <StatusBadge status={control.status} />
          </div>
          <DialogTitle className="text-lg">{control.title}</DialogTitle>
          <DialogDescription>{control.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="rounded-md bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">What auditors usually ask for:</span> {control.suggestedEvidence}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Owner" htmlFor="control-owner">
              <MemberSelect id="control-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} />
            </Field>
            <Field label="Status" htmlFor="control-status" hint="Needs evidence also applies automatically when evidence is missing or expired.">
              <SimpleSelect
                id="control-status"
                value={status}
                onChange={setStatus}
                disabled={!canEdit}
                options={CONTROL_STATUSES.map((value) => ({ value, label: CONTROL_STATUS_LABELS[value] }))}
              />
            </Field>
          </div>
          {status === "not_applicable" ? (
            <Field label="Why doesn't this apply?" htmlFor="control-na" hint="Required, at least 10 characters. Your auditor will read it.">
              <Textarea id="control-na" value={naJustification} onChange={(event) => setNaJustification(event.target.value)} disabled={!canEdit} />
            </Field>
          ) : null}
          <Field label="How it's implemented" htmlFor="control-notes">
            <Textarea id="control-notes" value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canEdit} placeholder="Where it's configured, who checks it, and how often." />
          </Field>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Evidence <span className="font-mono text-muted-foreground">{linkedEvidence.length}</span></p>
              {canEdit ? (
                <Button size="sm" variant="outline" onClick={() => setAddingEvidence(true)}><FilePlus2 /> Add evidence</Button>
              ) : null}
            </div>
            {linkedEvidence.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No evidence yet. Link the document or paste the setting that proves this control works.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {linkedEvidence.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    {item.kind === "link" ? <Link2 className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">expires {formatDate(item.expiry)}</span>
                    <FreshnessBadge freshness={item.freshness} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{canEdit ? "Cancel" : "Close"}</Button>
          {canEdit ? (
            <Button onClick={save} disabled={busy || naInvalid}>Save control</Button>
          ) : null}
        </DialogFooter>
        {addingEvidence ? (
          <EvidenceDialog snapshot={snapshot} act={act} busy={busy} initialControlIds={[control.id]} onClose={() => setAddingEvidence(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EvidenceSection({ snapshot, act, busy, canEdit, isAdmin }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TrustSnapshot["evidence"][number] | null>(null);
  const [rejecting, setRejecting] = useState<TrustSnapshot["evidence"][number] | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "pending">("all");
  const controlRefs = new Map(snapshot.controls.map((control) => [control.id, control.requirementRefs.join(", ")]));
  const controlTitles = new Map(snapshot.controls.map((control) => [control.id, control.title]));
  const items = snapshot.evidence.filter((item) =>
    filter === "all" ||
    (filter === "attention" && (item.freshness === "expired" || item.freshness === "expiring_soon")) ||
    (filter === "pending" && (item.reviewStatus ?? "pending") === "pending"));
  const attention = snapshot.evidence.filter((item) => item.freshness === "expired" || item.freshness === "expiring_soon").length;
  const pending = snapshot.evidence.filter((item) => (item.reviewStatus ?? "pending") === "pending").length;

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Evidence"
        description="Proof that controls work: a link to the document or system, or pasted text, with the date it was collected and how long it stays valid."
        action={canEdit ? <Button onClick={() => setAdding(true)} disabled={snapshot.controls.length === 0}><FilePlus2 /> Add evidence</Button> : null}
      />
      <div className="flex flex-wrap items-center gap-2">
        {([["all", `All ${snapshot.evidence.length}`], ["attention", `Expiring or expired ${attention}`], ["pending", `Awaiting review ${pending}`]] as const).map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</Button>
        ))}
        <p className="ml-auto text-xs text-muted-foreground">File uploads aren&apos;t connected yet: link to the file where it lives, or paste the relevant text.</p>
      </div>
      {items.length === 0 ? (
        <EmptyState title={snapshot.evidence.length ? "Nothing here right now" : "Start with one strong piece of evidence"} icon={<FileText />}>
          {snapshot.evidence.length ? "Every item in this view is current and reviewed." : "Your MFA enforcement setting or last quarter's access review is a good first item. It counts toward every control you link it to."}
        </EmptyState>
      ) : (
        <section className={cn(panel, "divide-y divide-border")}>
          {items.map((item) => (
            <article key={item.id} className="grid gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {item.kind === "link" ? <Link2 className="size-4" /> : <FileText className="size-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{item.title}</p>
                    {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewBadge status={item.reviewStatus ?? "pending"} />
                  <FreshnessBadge freshness={item.freshness} />
                  {isAdmin ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${item.title}`} onClick={() => setRemoving(item)}><Trash2 /></Button>
                  ) : null}
                </div>
              </div>
              <div className="grid gap-2 pl-12 text-sm">
                {item.kind === "link" ? (
                  <a className="inline-flex w-fit items-center gap-1 break-all text-sm font-medium underline-offset-4 hover:underline" href={item.url} target="_blank" rel="noreferrer noopener">
                    {item.url} <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted/70 p-3 font-mono text-xs">{item.text}</pre>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {item.controlIds.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-[4px] border border-border px-1.5 py-0.5 text-xs">
                      <span className="font-mono font-medium">{controlRefs.get(id) ?? id}</span>
                      <span className="max-w-48 truncate text-muted-foreground">{controlTitles.get(id)}</span>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <PersonCell snapshot={snapshot} email={item.createdBy} size="xs" detail={undefined} />
                  <span className="font-mono">Collected {formatDate(item.collectedAt)}</span>
                  <span>{CADENCE_LABELS[item.cadence]}</span>
                  <span className="font-mono">Expires {formatDate(item.expiry)}</span>
                </div>
                {item.reviewedBy ? (
                  <p className="text-xs text-muted-foreground">
                    {item.reviewStatus === "rejected" ? "Rejected" : "Accepted"} by {displayName(snapshot, item.reviewedBy)} on {formatDate(item.reviewedAt)}
                    {item.reviewedBy === item.createdBy ? " (their own evidence)" : ""}
                    {item.reviewNote ? `: ${item.reviewNote}` : ""}
                  </p>
                ) : null}
                {isAdmin && (item.reviewStatus ?? "pending") === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => act({ action: "reviewEvidence", evidenceId: item.id, decision: "accepted" })}>Accept</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(item)}>Reject…</Button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </section>
      )}
      {adding ? <EvidenceDialog snapshot={snapshot} act={act} busy={busy} onClose={() => setAdding(false)} /> : null}
      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject &ldquo;{rejecting?.title}&rdquo;?</DialogTitle>
            <DialogDescription>Rejected evidence stops supporting its controls. Tell its owner what&apos;s missing.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="The screenshot doesn't show which users the MFA policy covers." aria-label="Reason for rejection" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || rejectNote.trim().length < 5}
              onClick={async () => {
                if (rejecting && (await act({ action: "reviewEvidence", evidenceId: rejecting.id, decision: "rejected", note: rejectNote }))) {
                  setRejecting(null);
                  setRejectNote("");
                }
              }}
            >
              Reject evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this evidence?</DialogTitle>
            <DialogDescription>&ldquo;{removing?.title}&rdquo; will be unlinked from every control it supports. The removal is kept in the activity log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
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
    </div>
  );
}

function EvidenceDialog({
  snapshot,
  act,
  busy,
  onClose,
  initialControlIds = [],
}: {
  snapshot: TrustSnapshot;
  act: SectionProps["act"];
  busy: boolean;
  onClose: () => void;
  initialControlIds?: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"link" | "text">("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [controlIds, setControlIds] = useState<string[]>(initialControlIds);
  const [collectedAt, setCollectedAt] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [cadence, setCadence] = useState<ReviewCadence>("annual");
  const [expiresAt, setExpiresAt] = useState("");

  async function save() {
    const ok = await act({ action: "addEvidence", title, description, kind, url, text, controlIds, collectedAt, cadence, expiresAt });
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add evidence</DialogTitle>
          <DialogDescription>What you collected, when, and how long it stays valid.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Title" htmlFor="evidence-title">
            <Input id="evidence-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Q4 production access review" />
          </Field>
          <Field label="Description" htmlFor="evidence-description">
            <Textarea id="evidence-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <Field label="Type" htmlFor="evidence-kind">
            <SimpleSelect id="evidence-kind" value={kind} onChange={setKind} options={[{ value: "link", label: "Link to a document or system" }, { value: "text", label: "Pasted text" }]} />
          </Field>
          {kind === "link" ? (
            <Field label="Link" htmlFor="evidence-url">
              <Input id="evidence-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
            </Field>
          ) : (
            <Field label="Evidence text" htmlFor="evidence-text">
              <Textarea id="evidence-text" value={text} onChange={(event) => setText(event.target.value)} rows={6} className="font-mono text-xs" />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Collected on" htmlFor="evidence-collected">
              <Input id="evidence-collected" type="date" value={collectedAt} onChange={(event) => setCollectedAt(event.target.value)} />
            </Field>
            <Field label="Review cadence" htmlFor="evidence-cadence">
              <SimpleSelect id="evidence-cadence" value={cadence} onChange={setCadence} options={REVIEW_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }))} />
            </Field>
          </div>
          <Field label="Expires on (optional)" htmlFor="evidence-expires" hint="Overrides the cadence, for example a certificate's own expiry date.">
            <Input id="evidence-expires" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </Field>
          <Field label="Controls this evidence supports">
            <ControlPicker controls={snapshot.controls} selected={controlIds} onChange={setControlIds} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !title.trim() || controlIds.length === 0}>Save evidence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
