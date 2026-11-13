"use client";

import { useState } from "react";
import { BadgeCheck, Check, FileText, Plus } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgementCoverage,
  CADENCE_LABELS,
  currentApprovedVersion,
  latestPolicyVersion,
  REVIEW_CADENCES,
  type ReviewCadence,
} from "@/lib/trust/model";
import { cn } from "@/lib/utils";

import { displayName, EmailAvatar, EmptyState, Field, formatDate, MemberSelect, memberByEmail, PageHeader, panel, PersonCell, Pill, SimpleSelect } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Policy = TrustSnapshot["policies"][number];

const STATUS: Record<Policy["status"], [string, "neutral" | "positive" | "warning"]> = {
  draft: ["Draft", "neutral"],
  approved: ["Approved", "positive"],
  revision_pending: ["Revision awaiting approval", "warning"],
};

export function PoliciesSection(props: SectionProps) {
  const { snapshot, canEdit } = props;
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = snapshot.policies.find((policy) => policy.id === openId) ?? null;
  const myEmail = snapshot.me.email.toLowerCase();

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Policies"
        description="Start from a template, revise into new versions, approve, and see exactly who has read the approved version."
        action={canEdit ? <Button onClick={() => setCreating(true)}><Plus /> New policy</Button> : null}
      />
      {snapshot.policies.length === 0 ? (
        <EmptyState title="Write your first policy from a template" icon={<FileText />} action={canEdit ? <Button onClick={() => setCreating(true)}>New policy</Button> : null}>
          Eight templates cover what SOC 2 and ISO 27001 auditors usually expect. They&apos;re starting points, not legal advice, so adapt them before you approve.
        </EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.policies.map((policy) => {
            const [label, tone] = STATUS[policy.status];
            const latest = latestPolicyVersion(policy);
            const approved = currentApprovedVersion(policy);
            const coverage = acknowledgementCoverage(policy, snapshot.people);
            const acknowledged = approved ? policy.acknowledgements.filter((entry) => entry.version === approved.version) : [];
            const mine = approved && acknowledged.some((entry) => entry.email.toLowerCase() === myEmail);
            const percent = coverage.total ? Math.round((coverage.acknowledged / coverage.total) * 100) : 0;
            return (
              <button
                type="button"
                key={policy.id}
                onClick={() => setOpenId(policy.id)}
                className={cn(panel, "flex flex-col gap-4 p-4 text-left transition-colors hover:border-foreground/25")}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium leading-snug">{policy.title}</span>
                  </span>
                  <Pill tone={tone}>{label}</Pill>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <PersonCell snapshot={snapshot} email={policy.ownerEmail} size="xs" />
                  <span className="font-mono">v{latest?.version ?? 0}{approved ? ` · approved v${approved.version}` : ""}</span>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{approved ? "Acknowledged" : "Acknowledgements open after approval"}</span>
                    {approved ? <span className="font-mono tabular-nums">{coverage.acknowledged}/{coverage.total}</span> : null}
                  </div>
                  <Progress value={percent} className="h-1.5" aria-label={`${policy.title}: ${percent}% acknowledged`} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex -space-x-1.5">
                      {acknowledged.slice(0, 6).map((entry) => <EmailAvatar key={entry.email} snapshot={snapshot} email={entry.email} size="xs" className="ring-2 ring-card" />)}
                    </span>
                    {approved && !mine ? <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Waiting for you</span> : <span className="font-mono text-xs text-muted-foreground">Review {formatDate(policy.reviewDue)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {creating ? <CreatePolicyDialog snapshot={snapshot} act={props.act} busy={props.busy} onClose={() => setCreating(false)} /> : null}
      {open ? <PolicyDialog key={`${open.id}:${open.versions.length}`} policy={open} {...props} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function CreatePolicyDialog({ snapshot, act, busy, onClose }: { snapshot: TrustSnapshot; act: SectionProps["act"]; busy: boolean; onClose: () => void }) {
  const first = snapshot.policyTemplates[0];
  const [templateId, setTemplateId] = useState(first?.id ?? "blank");
  const [title, setTitle] = useState(first?.title ?? "");
  const [ownerEmail, setOwnerEmail] = useState(snapshot.me.email);
  const [reviewCadence, setReviewCadence] = useState<ReviewCadence>("annual");
  const template = snapshot.policyTemplates.find((entry) => entry.id === templateId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New policy</DialogTitle>
          <DialogDescription>Version 1 starts as a draft from the template you pick.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Template" htmlFor="policy-template" hint={template?.summary}>
            <SimpleSelect
              id="policy-template"
              value={templateId}
              onChange={(value) => {
                setTemplateId(value);
                const next = snapshot.policyTemplates.find((entry) => entry.id === value);
                setTitle(next?.title ?? "");
              }}
              options={[...snapshot.policyTemplates.map((entry) => ({ value: entry.id, label: entry.title })), { value: "blank", label: "Blank policy" }]}
            />
          </Field>
          <Field label="Title" htmlFor="policy-title">
            <Input id="policy-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Owner" htmlFor="policy-owner">
            <MemberSelect id="policy-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} />
          </Field>
          <Field label="Review cadence" htmlFor="policy-cadence">
            <SimpleSelect id="policy-cadence" value={reviewCadence} onChange={setReviewCadence} options={REVIEW_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || title.trim().length < 2}
            onClick={async () => {
              if (await act({ action: "createPolicy", templateId, title, ownerEmail, reviewCadence })) onClose();
            }}
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyDialog({ policy, snapshot, act, busy, canEdit, isAdmin, onClose }: SectionProps & { policy: Policy; onClose: () => void }) {
  const latest = latestPolicyVersion(policy);
  const approved = currentApprovedVersion(policy);
  const [body, setBody] = useState(latest?.body ?? "");
  const [viewVersion, setViewVersion] = useState<number>(latest?.version ?? 1);
  const coverage = acknowledgementCoverage(policy, snapshot.people);
  const myEmail = snapshot.me.email.toLowerCase();
  const acknowledged = approved ? policy.acknowledgements.filter((entry) => entry.version === approved.version) : [];
  const mine = approved && acknowledged.some((entry) => entry.email.toLowerCase() === myEmail);
  const shown = policy.versions.find((entry) => entry.version === viewVersion) ?? latest;
  const editingLatest = shown?.version === latest?.version;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg">{policy.title}</DialogTitle>
          <DialogDescription>
            Owned by {displayName(snapshot, policy.ownerEmail)} · reviewed {CADENCE_LABELS[policy.reviewCadence].toLowerCase()}. Approved text is never edited in place: saving creates a new version.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <SimpleSelect
                  value={String(viewVersion)}
                  onChange={(value) => setViewVersion(Number(value))}
                  ariaLabel="Version"
                  options={[...policy.versions].reverse().map((entry) => ({
                    value: String(entry.version),
                    label: `Version ${entry.version}${entry.approvedAt ? " · approved" : " · draft"}`,
                  }))}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {shown?.approvedAt
                  ? `Approved ${formatDate(shown.approvedAt)} by ${displayName(snapshot, shown.approvedBy)}`
                  : `Drafted ${formatDate(shown?.createdAt)} by ${displayName(snapshot, shown?.createdBy)}`}
              </span>
            </div>
            {editingLatest && canEdit ? (
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={18} className="font-mono text-xs leading-5" aria-label="Policy text" />
            ) : (
              <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 font-sans text-sm leading-6">{shown?.body}</pre>
            )}
          </div>
          <aside className="grid content-start gap-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">
              {approved ? <>Acknowledged v{approved.version} <span className="font-mono text-muted-foreground">{coverage.acknowledged}/{coverage.total}</span></> : "Acknowledgements"}
            </p>
            {!approved ? <p className="text-xs text-muted-foreground">Open once a version is approved.</p> : null}
            <ul className="grid gap-2">
              {acknowledged.map((entry) => {
                const member = memberByEmail(snapshot, entry.email);
                return (
                  <li key={entry.email} className="flex items-center gap-2 text-sm">
                    <UserAvatar person={{ uid: member?.uid ?? entry.email, name: member?.name || null, email: entry.email, photoURL: member?.photoURL ?? null }} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{member?.name || entry.email}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">{formatDate(entry.acknowledgedAt)}{entry.recordedBy ? ` · recorded by ${displayName(snapshot, entry.recordedBy)}` : ""}</span>
                    </span>
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Acknowledged" />
                  </li>
                );
              })}
              {approved ? coverage.pending.map((email) => (
                <li key={email} className="flex items-center gap-2 text-sm">
                  <EmailAvatar snapshot={snapshot} email={email} size="sm" className="opacity-70" />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{displayName(snapshot, email)}</span>
                  {isAdmin ? (
                    <Button size="xs" variant="outline" disabled={busy} onClick={() => act({ action: "recordAcknowledgement", policyId: policy.id, email })}>Record</Button>
                  ) : <Pill tone="neutral" dot={false}>Pending</Pill>}
                </li>
              )) : null}
            </ul>
            {isAdmin && approved && coverage.pending.length ? <p className="text-[11px] text-muted-foreground">Record a signed paper or e-signature acknowledgement. The record keeps who entered it.</p> : null}
          </aside>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {approved && !mine ? (
            <Button variant="outline" disabled={busy} onClick={() => act({ action: "acknowledgePolicy", policyId: policy.id })}>
              <BadgeCheck /> I&apos;ve read version {approved.version}
            </Button>
          ) : null}
          {canEdit && editingLatest ? (
            <Button
              variant="outline"
              disabled={busy || body.trim() === latest?.body.trim()}
              onClick={() => act({ action: "revisePolicy", policyId: policy.id, body })}
            >
              Save as version {(latest?.version ?? 0) + 1}
            </Button>
          ) : null}
          {isAdmin && latest && !latest.approvedAt ? (
            <Button disabled={busy || body.trim() !== latest.body.trim()} onClick={() => act({ action: "approvePolicy", policyId: policy.id, version: latest.version })}>
              Approve version {latest.version}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
