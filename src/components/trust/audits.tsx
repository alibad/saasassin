"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Plus, ShieldOff, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIT_PERIOD_STATUSES,
  FINDING_SEVERITIES,
  FINDING_STATUS_LABELS,
  FINDING_STATUSES,
  type AuditPeriodStatus,
  type FindingSeverity,
  type FindingStatus,
} from "@/lib/trust/model";

import { ControlPicker, EmptyState, Field, formatDate, MemberSelect, panel, SimpleSelect } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Period = TrustSnapshot["auditPeriods"][number];
type Finding = TrustSnapshot["findings"][number];

const localDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA");
const capital = (value: string) => value[0].toUpperCase() + value.slice(1);

export function AuditsSection(props: SectionProps) {
  const { snapshot, isAdmin, canEdit } = props;
  const [editingPeriod, setEditingPeriod] = useState<Period | "new" | null>(null);
  const [granting, setGranting] = useState<Period | null>(null);
  const [editingFinding, setEditingFinding] = useState<Finding | "new" | null>(null);
  const today = localDay();
  const periodName = new Map(snapshot.auditPeriods.map((period) => [period.id, period.name]));

  return (
    <div className="grid gap-6">
      <section className={`${panel} p-4 sm:p-6`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Audit periods</h2>
            <p className="text-sm text-[#6d6c64]">
              Plan an audit window and give your auditor time-boxed, read-only access. After the expiry date the server refuses their access.
            </p>
          </div>
          {isAdmin ? <Button className="rounded-none" onClick={() => setEditingPeriod("new")}><Plus /> New audit period</Button> : null}
        </div>
        {snapshot.auditPeriods.length === 0 ? (
          <EmptyState title="No audit periods yet.">Create one when an auditor engagement is scheduled.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {snapshot.auditPeriods.map((period) => (
              <article key={period.id} className="border border-[#171715] bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{period.name}</p>
                    <p className="text-xs text-[#6d6c64]">
                      {period.frameworkId === "soc2" ? "SOC 2" : "ISO 27001"} · {formatDate(period.startDate)} – {formatDate(period.endDate)}
                      {period.auditorFirm ? ` · ${period.auditorFirm}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-none border-[#171715] capitalize">{period.status}</Badge>
                    {isAdmin ? (
                      <>
                        <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditingPeriod(period)}><Pencil /> Edit</Button>
                        <Button size="sm" className="rounded-none" onClick={() => setGranting(period)}><UserCheck /> Auditor access</Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {period.auditors.length > 0 ? (
                  <ul className="mt-2 grid gap-1 text-sm">
                    {period.auditors.map((grant) => {
                      const active = grant.expiresAt >= today;
                      return (
                        <li key={grant.email} className="flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[#d7d3c8] pt-1">
                          <span>
                            <CalendarClock className="mr-1 inline size-3.5" />
                            {grant.email} · {active ? `access until ${formatDate(grant.expiresAt)}` : `access ended ${formatDate(grant.expiresAt)}`}
                          </span>
                          {isAdmin && active ? (
                            <Button size="sm" variant="ghost" className="h-7 rounded-none" disabled={props.busy} onClick={() => props.act({ action: "revokeAuditorAccess", auditPeriodId: period.id, email: grant.email })}>
                              <ShieldOff /> Revoke now
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[#6d6c64]">No auditor access granted for this period.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Findings</h2>
            <p className="text-sm text-[#6d6c64]">Issues raised in audits or internal reviews, linked to controls, with remediation owner, status and due date.</p>
          </div>
          {canEdit ? <Button className="rounded-none" onClick={() => setEditingFinding("new")}><Plus /> Log finding</Button> : null}
        </div>
        {snapshot.findings.length === 0 ? (
          <EmptyState title="No findings logged." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.findings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell className="min-w-40 whitespace-normal">
                      <p className="font-semibold">{finding.title}</p>
                      <p className="text-xs text-[#6d6c64]">
                        <span className="capitalize">{finding.severity}</span> severity · {finding.controlIds.length} controls
                        {finding.auditPeriodId ? ` · ${periodName.get(finding.auditPeriodId) ?? "audit period"}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`rounded-none border-[#171715] ${finding.overdue ? "bg-[#ffd8cf] text-[#7a1b06]" : "bg-white"}`}>
                        {finding.overdue ? "Overdue" : FINDING_STATUS_LABELS[finding.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">{formatDate(finding.dueDate)}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{finding.ownerEmail || <span className="text-[#a33a1f]">Unassigned</span>}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditingFinding(finding)}>
                        <Pencil /> {canEdit ? "Edit" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {editingPeriod ? <PeriodDialog key={editingPeriod === "new" ? "new" : editingPeriod.id} period={editingPeriod === "new" ? null : editingPeriod} {...props} onClose={() => setEditingPeriod(null)} /> : null}
      {granting ? <GrantDialog period={granting} {...props} onClose={() => setGranting(null)} /> : null}
      {editingFinding ? <FindingDialog key={editingFinding === "new" ? "new" : editingFinding.id} finding={editingFinding === "new" ? null : editingFinding} {...props} onClose={() => setEditingFinding(null)} /> : null}
    </div>
  );
}

function PeriodDialog({ period, snapshot, act, busy, onClose }: SectionProps & { period: Period | null; onClose: () => void }) {
  const frameworks = snapshot.frameworks.filter((framework) => snapshot.settings.frameworkIds.includes(framework.id));
  const [name, setName] = useState(period?.name ?? "");
  const [frameworkId, setFrameworkId] = useState<string>(period?.frameworkId ?? frameworks[0]?.id ?? "soc2");
  const [startDate, setStartDate] = useState(period?.startDate ?? localDay());
  const [endDate, setEndDate] = useState(period?.endDate ?? localDay(90));
  const [auditorFirm, setAuditorFirm] = useState(period?.auditorFirm ?? "");
  const [status, setStatus] = useState<AuditPeriodStatus>(period?.status ?? "planned");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>{period ? "Edit audit period" : "New audit period"}</DialogTitle>
          <DialogDescription>The window your auditor will test. Readiness tracking does not replace the auditor&rsquo;s own work.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="period-name"><Input id="period-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="SOC 2 Type II 2027" className="rounded-none border-[#171715]" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Framework" htmlFor="period-framework"><SimpleSelect id="period-framework" value={frameworkId} onChange={setFrameworkId} options={frameworks.map((framework) => ({ value: framework.id, label: framework.name }))} /></Field>
            <Field label="Status" htmlFor="period-status"><SimpleSelect id="period-status" value={status} onChange={setStatus} options={AUDIT_PERIOD_STATUSES.map((value) => ({ value, label: capital(value) }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="period-start"><Input id="period-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-none border-[#171715]" /></Field>
            <Field label="Ends" htmlFor="period-end"><Input id="period-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          </div>
          <Field label="Audit firm (optional)" htmlFor="period-firm"><Input id="period-firm" value={auditorFirm} onChange={(event) => setAuditorFirm(event.target.value)} className="rounded-none border-[#171715]" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button className="rounded-none" disabled={busy || name.trim().length < 2} onClick={async () => {
            if (await act({ action: "saveAuditPeriod", ...(period ? { auditPeriodId: period.id } : {}), name, frameworkId, startDate, endDate, auditorFirm, status })) onClose();
          }}>Save period</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GrantDialog({ period, act, busy, onClose }: SectionProps & { period: Period; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState(period.endDate >= localDay() ? period.endDate : localDay(30));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>Auditor access · {period.name}</DialogTitle>
          <DialogDescription>
            Invite the auditor as a <strong>Viewer</strong> in Team &amp; activity, then set when their access ends here. Viewers are read-only, and after this date the server refuses all access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Auditor email" htmlFor="grant-email"><Input id="grant-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Access ends after" htmlFor="grant-expiry"><Input id="grant-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="rounded-none border-[#171715]" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button className="rounded-none" disabled={busy || !email.includes("@") || !expiresAt} onClick={async () => {
            if (await act({ action: "grantAuditorAccess", auditPeriodId: period.id, email, expiresAt })) onClose();
          }}>Grant access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FindingDialog({ finding, snapshot, act, busy, canEdit, onClose }: SectionProps & { finding: Finding | null; onClose: () => void }) {
  const NONE = "__none";
  const [title, setTitle] = useState(finding?.title ?? "");
  const [description, setDescription] = useState(finding?.description ?? "");
  const [severity, setSeverity] = useState<FindingSeverity>(finding?.severity ?? "medium");
  const [status, setStatus] = useState<FindingStatus>(finding?.status ?? "open");
  const [controlIds, setControlIds] = useState<string[]>(finding?.controlIds ?? []);
  const [auditPeriodId, setAuditPeriodId] = useState(finding?.auditPeriodId || NONE);
  const [ownerEmail, setOwnerEmail] = useState(finding?.ownerEmail ?? "");
  const [dueDate, setDueDate] = useState(finding?.dueDate ?? localDay(30));
  const [remediation, setRemediation] = useState(finding?.remediation ?? "");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{finding ? "Finding" : "Log finding"}</DialogTitle>
          <DialogDescription>Track the issue until it is remediated or its risk is formally accepted.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <Field label="Title" htmlFor="finding-title"><Input id="finding-title" value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Description" htmlFor="finding-description"><Textarea id="finding-description" value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Severity" htmlFor="finding-severity"><SimpleSelect id="finding-severity" value={severity} onChange={setSeverity} disabled={!canEdit} options={FINDING_SEVERITIES.map((value) => ({ value, label: capital(value) }))} /></Field>
            <Field label="Remediation status" htmlFor="finding-status"><SimpleSelect id="finding-status" value={status} onChange={setStatus} disabled={!canEdit} options={FINDING_STATUSES.map((value) => ({ value, label: FINDING_STATUS_LABELS[value] }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due date" htmlFor="finding-due"><Input id="finding-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="rounded-none border-[#171715]" /></Field>
            <Field label="Owner" htmlFor="finding-owner"><MemberSelect id="finding-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} /></Field>
          </div>
          <Field label="Audit period" htmlFor="finding-period">
            <SimpleSelect id="finding-period" value={auditPeriodId} onChange={setAuditPeriodId} disabled={!canEdit} options={[{ value: NONE, label: "Not tied to an audit" }, ...snapshot.auditPeriods.map((period) => ({ value: period.id, label: period.name }))]} />
          </Field>
          <Field label="Remediation notes" htmlFor="finding-remediation" hint={status === "risk_accepted" ? "Required: why the risk is accepted and who accepted it." : undefined}>
            <Textarea id="finding-remediation" value={remediation} onChange={(event) => setRemediation(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Affected controls"><ControlPicker controls={snapshot.controls} selected={controlIds} onChange={setControlIds} /></Field>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button className="rounded-none" disabled={busy || title.trim().length < 2} onClick={async () => {
              const ok = await act({
                action: "saveFinding",
                ...(finding ? { findingId: finding.id } : {}),
                title,
                description,
                severity,
                status,
                controlIds,
                auditPeriodId: auditPeriodId === NONE ? "" : auditPeriodId,
                ownerEmail,
                dueDate,
                remediation,
              });
              if (ok) onClose();
            }}>Save finding</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
