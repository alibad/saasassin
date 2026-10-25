"use client";

import { useState } from "react";
import { BadgeCheck, FileText, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  acknowledgementCoverage,
  CADENCE_LABELS,
  currentApprovedVersion,
  latestPolicyVersion,
  REVIEW_CADENCES,
  type ReviewCadence,
} from "@/lib/trust/model";

import { EmptyState, Field, formatDate, MemberSelect, panel, SimpleSelect } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Policy = TrustSnapshot["policies"][number];

const STATUS_LABEL: Record<Policy["status"], [string, string]> = {
  draft: ["Draft", "bg-white"],
  approved: ["Approved", "bg-[#e8ff59]"],
  revision_pending: ["Revision pending", "bg-[#fff1b8]"],
};

export function PoliciesSection(props: SectionProps) {
  const { snapshot, canEdit } = props;
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = snapshot.policies.find((policy) => policy.id === openId) ?? null;
  const memberEmails = snapshot.members.map((member) => member.email);

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Policies</h2>
          <p className="text-sm text-[#6d6c64]">Start from a template, edit into new versions, approve, and track who has acknowledged the approved version.</p>
        </div>
        {canEdit ? (
          <Button className="rounded-none" onClick={() => setCreating(true)}><Plus /> New policy</Button>
        ) : null}
      </div>
      {snapshot.policies.length === 0 ? (
        <EmptyState title="No policies yet.">Templates are starting points written by SaaSassin, not legal advice. Adapt them before approval.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {snapshot.policies.map((policy) => {
            const [label, style] = STATUS_LABEL[policy.status];
            const latest = latestPolicyVersion(policy);
            const approved = currentApprovedVersion(policy);
            const coverage = acknowledgementCoverage(policy, memberEmails);
            const mine = approved && policy.acknowledgements.some((entry) => entry.email === snapshot.me.email.toLowerCase() && entry.version === approved.version);
            return (
              <button
                type="button"
                key={policy.id}
                onClick={() => setOpenId(policy.id)}
                className="border border-[#171715] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#171715]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold"><FileText className="mr-1 inline size-4" />{policy.title}</p>
                  <Badge variant="outline" className={`rounded-none border-[#171715] text-[#171715] ${style}`}>{label}</Badge>
                </div>
                <p className="mt-2 text-xs text-[#6d6c64]">
                  Latest v{latest?.version ?? 0} · Approved {approved ? `v${approved.version}` : "none"} · Review {formatDate(policy.reviewDue)}
                </p>
                <p className="mt-1 text-xs">
                  Acknowledged {coverage.acknowledged}/{coverage.total}
                  {approved && !mine ? <strong className="ml-2 text-[#a33a1f]">Your acknowledgement is pending</strong> : null}
                </p>
              </button>
            );
          })}
        </div>
      )}
      {creating ? <CreatePolicyDialog snapshot={snapshot} act={props.act} busy={props.busy} onClose={() => setCreating(false)} /> : null}
      {open ? <PolicyDialog key={`${open.id}:${open.versions.length}`} policy={open} {...props} onClose={() => setOpenId(null)} /> : null}
    </section>
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
      <DialogContent className="rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>New policy</DialogTitle>
          <DialogDescription>Version 1 is created as a draft from the template you pick.</DialogDescription>
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
            <Input id="policy-title" value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Owner" htmlFor="policy-owner">
            <MemberSelect id="policy-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} />
          </Field>
          <Field label="Review cadence" htmlFor="policy-cadence">
            <SimpleSelect id="policy-cadence" value={reviewCadence} onChange={setReviewCadence} options={REVIEW_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button
            className="rounded-none"
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
  const coverage = acknowledgementCoverage(policy, snapshot.members.map((member) => member.email));
  const mine = approved && policy.acknowledgements.some((entry) => entry.email === snapshot.me.email.toLowerCase() && entry.version === approved.version);
  const shown = policy.versions.find((entry) => entry.version === viewVersion) ?? latest;
  const editingLatest = shown?.version === latest?.version;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-none border-2 border-[#171715] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{policy.title}</DialogTitle>
          <DialogDescription>
            Owner {policy.ownerEmail || "unassigned"} · {CADENCE_LABELS[policy.reviewCadence]} review · Approved versions are never edited in place; saving creates a new version.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Version</span>
            <div className="w-40">
              <SimpleSelect
                value={String(viewVersion)}
                onChange={(value) => setViewVersion(Number(value))}
                options={[...policy.versions].reverse().map((entry) => ({
                  value: String(entry.version),
                  label: `v${entry.version}${entry.approvedAt ? " · approved" : " · draft"}`,
                }))}
              />
            </div>
            {shown?.approvedAt ? (
              <span className="text-xs text-[#6d6c64]">Approved {formatDate(shown.approvedAt)} by {shown.approvedBy}</span>
            ) : (
              <span className="text-xs text-[#6d6c64]">Drafted {formatDate(shown?.createdAt)} by {shown?.createdBy}</span>
            )}
          </div>
          {editingLatest && canEdit ? (
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={16} className="rounded-none border-[#171715] font-mono text-xs" aria-label="Policy text" />
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-[#171715] bg-white p-3 text-xs">{shown?.body}</pre>
          )}
          <div className="border border-[#171715] bg-white p-3 text-sm">
            <p className="font-semibold">Acknowledgements for {approved ? `v${approved.version}` : "—"}: {coverage.acknowledged}/{coverage.total}</p>
            {approved && coverage.pending.length > 0 ? <p className="text-xs text-[#6d6c64]">Pending: {coverage.pending.join(", ")}</p> : null}
            {!approved ? <p className="text-xs text-[#6d6c64]">Acknowledgements open once a version is approved.</p> : null}
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" className="rounded-none" onClick={onClose}>Close</Button>
          {approved && !mine ? (
            <Button variant="outline" className="rounded-none border-[#171715]" disabled={busy} onClick={() => act({ action: "acknowledgePolicy", policyId: policy.id })}>
              <BadgeCheck /> I have read v{approved.version}
            </Button>
          ) : null}
          {canEdit && editingLatest ? (
            <Button
              variant="outline"
              className="rounded-none border-[#171715]"
              disabled={busy || body.trim() === latest?.body.trim()}
              onClick={() => act({ action: "revisePolicy", policyId: policy.id, body })}
            >
              Save as v{(latest?.version ?? 0) + 1}
            </Button>
          ) : null}
          {isAdmin && latest && !latest.approvedAt ? (
            <Button className="rounded-none" disabled={busy || body.trim() !== latest.body.trim()} onClick={() => act({ action: "approvePolicy", policyId: policy.id, version: latest.version })}>
              Approve v{latest.version}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
