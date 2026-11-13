"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Plus, ShieldOff, UserCheck } from "lucide-react";

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

import { ControlPicker, EmptyState, Field, formatDate, MemberSelect, memberByEmail, PageHeader, panel, PanelHeader, PersonCell, Pill, SimpleSelect } from "./shared";
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
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Audits"
        description="Plan each audit window, give your auditor read-only access that ends on a date you choose, and track findings until they're resolved."
        action={isAdmin ? <Button onClick={() => setEditingPeriod("new")}><Plus /> Plan an audit</Button> : null}
      />
      <section aria-label="Audit periods" className="grid gap-4">
        {snapshot.auditPeriods.length === 0 ? (
          <EmptyState title="Plan your first audit window" icon={<CalendarClock />}>When your auditor engagement is booked, add its dates here. You can then give the auditor read-only access that ends with it.</EmptyState>
        ) : snapshot.auditPeriods.map((period) => (
          <article key={period.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{period.name}</p>
                  <Pill tone={period.status === "fieldwork" ? "progress" : period.status === "closed" ? "positive" : "neutral"} className="capitalize">{period.status}</Pill>
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {period.frameworkId === "soc2" ? "SOC 2" : "ISO 27001"} · {formatDate(period.startDate)} → {formatDate(period.endDate)}
                  {period.auditorFirm ? ` · ${period.auditorFirm}` : ""}
                </p>
              </div>
              {isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingPeriod(period)}><Pencil /> Edit</Button>
                  <Button size="sm" onClick={() => setGranting(period)}><UserCheck /> Give auditor access</Button>
                </div>
              ) : null}
            </div>
            {period.auditors.length > 0 ? (
              <ul className="divide-y divide-border">
                {period.auditors.map((grant) => {
                  const active = grant.expiresAt >= today;
                  const member = memberByEmail(snapshot, grant.email);
                  return (
                    <li key={grant.email} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                      <PersonCell snapshot={snapshot} email={grant.email} detail={member ? (member.title || "Auditor · read-only") : "Invited · read-only once they join"} />
                      <span className="ml-auto flex items-center gap-2">
                        <Pill tone={active ? "positive" : "muted"}><CalendarClock className="size-3" /> {active ? `Access until ${formatDate(grant.expiresAt)}` : `Access ended ${formatDate(grant.expiresAt)}`}</Pill>
                        {isAdmin && active ? (
                          <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.act({ action: "revokeAuditorAccess", auditPeriodId: period.id, email: grant.email })}>
                            <ShieldOff /> End now
                          </Button>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">No auditor has access to this period yet.</p>
            )}
          </article>
        ))}
      </section>

      <section className={panel} aria-label="Findings">
        <PanelHeader
          title="Findings"
          description="Issues from audits or internal reviews, linked to the controls they affect, with an owner and a due date."
          action={canEdit ? <Button size="sm" onClick={() => setEditingFinding("new")}><Plus /> Log finding</Button> : null}
        />
        {snapshot.findings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No findings. When an auditor or your own review raises one, log it here and track it to resolution.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4 sm:pl-5">Finding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Due</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.findings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell className="min-w-48 whitespace-normal pl-4 sm:pl-5">
                      <p className="font-medium">{finding.title}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="capitalize">{finding.severity}</span> severity · {finding.controlIds.length} controls
                        {finding.auditPeriodId ? ` · ${periodName.get(finding.auditPeriodId) ?? "audit period"}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Pill tone={finding.overdue ? "critical" : finding.status === "resolved" ? "positive" : finding.status === "in_remediation" ? "progress" : "neutral"}>
                        {finding.overdue ? "Overdue" : FINDING_STATUS_LABELS[finding.status]}
                      </Pill>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">{formatDate(finding.dueDate)}</TableCell>
                    <TableCell className="hidden md:table-cell"><PersonCell snapshot={snapshot} email={finding.ownerEmail} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditingFinding(finding)}>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{period ? "Edit audit period" : "New audit period"}</DialogTitle>
          <DialogDescription>The window your auditor will test. Readiness tracking does not replace the auditor&rsquo;s own work.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="period-name"><Input id="period-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="SOC 2 Type II 2027" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Framework" htmlFor="period-framework"><SimpleSelect id="period-framework" value={frameworkId} onChange={setFrameworkId} options={frameworks.map((framework) => ({ value: framework.id, label: framework.name }))} /></Field>
            <Field label="Status" htmlFor="period-status"><SimpleSelect id="period-status" value={status} onChange={setStatus} options={AUDIT_PERIOD_STATUSES.map((value) => ({ value, label: capital(value) }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor="period-start"><Input id="period-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
            <Field label="Ends" htmlFor="period-end"><Input id="period-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>
          </div>
          <Field label="Audit firm (optional)" htmlFor="period-firm"><Input id="period-firm" value={auditorFirm} onChange={(event) => setAuditorFirm(event.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || name.trim().length < 2} onClick={async () => {
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auditor access · {period.name}</DialogTitle>
          <DialogDescription>
            Invite the auditor as a <strong>Viewer</strong> from People (they can accept before they have an account), then choose when their access ends. Viewers can&apos;t change anything, and after this date Trust refuses their access entirely.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Auditor email" htmlFor="grant-email"><Input id="grant-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="Access ends after" htmlFor="grant-expiry"><Input id="grant-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !email.includes("@") || !expiresAt} onClick={async () => {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{finding ? "Finding" : "Log finding"}</DialogTitle>
          <DialogDescription>Track the issue until it is remediated or its risk is formally accepted.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <Field label="Title" htmlFor="finding-title"><Input id="finding-title" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <Field label="Description" htmlFor="finding-description"><Textarea id="finding-description" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Severity" htmlFor="finding-severity"><SimpleSelect id="finding-severity" value={severity} onChange={setSeverity} disabled={!canEdit} options={FINDING_SEVERITIES.map((value) => ({ value, label: capital(value) }))} /></Field>
            <Field label="Remediation status" htmlFor="finding-status"><SimpleSelect id="finding-status" value={status} onChange={setStatus} disabled={!canEdit} options={FINDING_STATUSES.map((value) => ({ value, label: FINDING_STATUS_LABELS[value] }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due date" htmlFor="finding-due"><Input id="finding-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
            <Field label="Owner" htmlFor="finding-owner"><MemberSelect id="finding-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} /></Field>
          </div>
          <Field label="Audit period" htmlFor="finding-period">
            <SimpleSelect id="finding-period" value={auditPeriodId} onChange={setAuditPeriodId} disabled={!canEdit} options={[{ value: NONE, label: "Not tied to an audit" }, ...snapshot.auditPeriods.map((period) => ({ value: period.id, label: period.name }))]} />
          </Field>
          <Field label="Remediation notes" htmlFor="finding-remediation" hint={status === "risk_accepted" ? "Required: why the risk is accepted and who accepted it." : undefined}>
            <Textarea id="finding-remediation" value={remediation} onChange={(event) => setRemediation(event.target.value)} />
          </Field>
          <Field label="Affected controls"><ControlPicker controls={snapshot.controls} selected={controlIds} onChange={setControlIds} /></Field>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button disabled={busy || title.trim().length < 2} onClick={async () => {
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
