"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, Globe, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CONTROL_STATUS_LABELS, CONTROL_STATUSES } from "@/lib/trust/model";

import { EmptyState, Field, formatDate, panel, SimpleSelect } from "./shared";
import type { SectionProps } from "./types";

const STATUS_BAR: Record<string, string> = {
  implemented: "bg-[#e8ff59]",
  in_progress: "bg-[#9fb0ff]",
  needs_evidence: "bg-[#ff7458]",
  not_started: "bg-white",
  not_applicable: "bg-[#c9c7bf]",
};

function Metric({ label, value, detail, percent }: { label: string; value: string; detail: string; percent?: number }) {
  return (
    <div className="border-2 border-[#171715] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6d6c64]">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      {percent !== undefined ? <Progress value={percent} className="mt-2 h-2 rounded-none" aria-label={label} /> : null}
      <p className="mt-2 text-xs text-[#6d6c64]">{detail}</p>
    </div>
  );
}

export function OverviewSection({ snapshot, act, busy, isAdmin, onNavigate }: SectionProps & { onNavigate: (tab: string) => void }) {
  const { readiness, tasks } = snapshot;
  const [frameworkIds, setFrameworkIds] = useState<string[]>(snapshot.settings.frameworkIds);
  const changed = frameworkIds.slice().sort().join() !== snapshot.settings.frameworkIds.slice().sort().join();
  const tabFor = { control: "controls", evidence: "evidence", policy: "policies", risk: "risks", vendor: "vendors" } as const;

  return (
    <div className="grid gap-6">
      <section className={`${panel} p-4 sm:p-6`}>
        <div className="mb-4">
          <h2 className="text-xl font-bold">Readiness</h2>
          <p className="text-sm text-[#6d6c64]">Computed live from this workspace&rsquo;s records. Readiness tracking is not a certification or audit opinion.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Control coverage" value={`${readiness.controls.coveragePercent}%`} percent={readiness.controls.coveragePercent} detail={`${readiness.controls.implemented} of ${readiness.controls.applicable} applicable controls implemented with current evidence.`} />
          <Metric label="Evidence freshness" value={`${readiness.evidence.freshnessPercent}%`} percent={readiness.evidence.freshnessPercent} detail={`${readiness.evidence.total} items · ${readiness.evidence.expiringSoon} expiring within 14 days · ${readiness.evidence.expired} expired.`} />
          <Metric label="Open risks" value={String(readiness.risks.open)} detail={`${readiness.risks.highOrCritical} high or critical (score ≥ 10) · ${readiness.risks.unowned} without an owner.`} />
          <Metric label="Policies approved" value={`${readiness.policies.approved}/${readiness.policies.total}`} percent={readiness.policies.acknowledgementPercent} detail={`${readiness.policies.acknowledgementPercent}% of expected acknowledgements collected · ${readiness.vendors.overdue} vendor reviews overdue.`} />
        </div>
        {readiness.controls.total > 0 ? (
          <div className="mt-5">
            <div className="flex h-5 w-full overflow-hidden border-2 border-[#171715]" role="img" aria-label="Controls by status">
              {CONTROL_STATUSES.map((status) => {
                const count = readiness.controls.byStatus[status];
                return count ? <span key={status} className={`${STATUS_BAR[status]} border-r border-[#171715] last:border-r-0`} style={{ width: `${(count / readiness.controls.total) * 100}%` }} /> : null;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {CONTROL_STATUSES.map((status) => (
                <span key={status} className="inline-flex items-center gap-1">
                  <span className={`inline-block size-3 border border-[#171715] ${STATUS_BAR[status]}`} />
                  {CONTROL_STATUS_LABELS[status]} {readiness.controls.byStatus[status]}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">Tasks from gaps</h2>
            <p className="text-sm text-[#6d6c64]">Generated from missing owners, missing or expiring evidence, unapproved policies, untreated risks, and overdue vendor reviews.</p>
          </div>
          <Badge variant="outline" className="rounded-none border-[#171715]">{tasks.length} open</Badge>
        </div>
        {tasks.length === 0 ? (
          <EmptyState title="No gaps detected right now." />
        ) : (
          <ul className="grid gap-2">
            {tasks.slice(0, 20).map((task) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 border border-[#171715] bg-white p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="text-xs text-[#6d6c64]">{task.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`rounded-none border-[#171715] capitalize ${task.priority === "high" ? "bg-[#ffd8cf]" : task.priority === "medium" ? "bg-[#fff1b8]" : "bg-white"}`}>{task.priority}</Badge>
                  <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => onNavigate(tabFor[task.area])}>Open</Button>
                </div>
              </li>
            ))}
            {tasks.length > 20 ? <li className="text-xs text-[#6d6c64]">Showing 20 of {tasks.length} tasks, highest priority first.</li> : null}
          </ul>
        )}
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <h2 className="text-xl font-bold">Frameworks</h2>
        <p className="mb-4 text-sm text-[#6d6c64]">Control library version {snapshot.libraryVersion}. Removing a framework keeps its stored control records; they reappear if you add it back.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {snapshot.frameworks.map((framework) => (
            <label key={framework.id} className="flex cursor-pointer gap-3 border border-[#171715] bg-white p-3">
              <Checkbox
                checked={frameworkIds.includes(framework.id)}
                disabled={!isAdmin}
                onCheckedChange={(value) => setFrameworkIds(value ? [...frameworkIds, framework.id] : frameworkIds.filter((id) => id !== framework.id))}
              />
              <span>
                <span className="block font-semibold">{framework.name}</span>
                <span className="block text-xs text-[#6d6c64]">{framework.controlCount} controls · {framework.summary}</span>
                <span className="mt-1 block text-xs italic text-[#6d6c64]">{framework.disclaimer}</span>
              </span>
            </label>
          ))}
        </div>
        {isAdmin ? (
          <Button className="mt-4 rounded-none" disabled={busy || !changed || frameworkIds.length === 0} onClick={() => act({ action: "setFrameworks", frameworkIds })}>
            Save frameworks
          </Button>
        ) : null}
      </section>
    </div>
  );
}

export function TrustCenterSection({ snapshot, act, busy, isAdmin }: SectionProps) {
  const current = snapshot.settings.trustCenter;
  const [published, setPublished] = useState(current.published);
  const [displayName, setDisplayName] = useState(current.displayName || snapshot.tenant.name);
  const [headline, setHeadline] = useState(current.headline);
  const [contactEmail, setContactEmail] = useState(current.contactEmail);
  const [showFrameworks, setShowFrameworks] = useState(current.showFrameworks);
  const [showReadiness, setShowReadiness] = useState(current.showReadiness);
  const [showControlCategories, setShowControlCategories] = useState(current.showControlCategories);
  const [publishedPolicyIds, setPublishedPolicyIds] = useState<string[]>(current.publishedPolicyIds);
  const approvedPolicies = snapshot.policies.filter((policy) => policy.status !== "draft");
  const publicHref = `/apps/trust/t/${snapshot.tenant.id}`;

  const toggles: Array<[string, string, boolean, (value: boolean) => void]> = [
    ["tc-frameworks", "Show which frameworks you are tracking readiness against", showFrameworks, setShowFrameworks],
    ["tc-readiness", "Show control coverage and evidence freshness percentages", showReadiness, setShowReadiness],
    ["tc-categories", "Show implemented controls per category", showControlCategories, setShowControlCategories],
  ];

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Public trust center</h2>
          <p className="text-sm text-[#6d6c64]">Nothing is public until you publish, and only the items selected here are shown. Evidence, owners, risks and vendors are never published.</p>
        </div>
        {current.published ? (
          <Button asChild variant="outline" className="rounded-none border-[#171715]">
            <Link href={publicHref} target="_blank"><Globe /> View public page <ExternalLink /></Link>
          </Button>
        ) : null}
      </div>
      {!isAdmin ? (
        <Alert className="mb-4 rounded-none border-[#171715]"><AlertTitle>Read only</AlertTitle><AlertDescription>Only owners and admins can change what is published.</AlertDescription></Alert>
      ) : null}
      <fieldset disabled={!isAdmin} className="grid gap-4">
        <label className="flex items-center gap-3 border-2 border-[#171715] bg-white p-3">
          <Switch checked={published} onCheckedChange={setPublished} disabled={!isAdmin} aria-label="Publish trust center" />
          <span className="font-semibold">{published ? "Published" : "Not published"}</span>
          <span className="text-xs text-[#6d6c64]">{publicHref}</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" htmlFor="tc-name"><Input id="tc-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Security contact email" htmlFor="tc-contact"><Input id="tc-contact" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} className="rounded-none border-[#171715]" /></Field>
        </div>
        <Field label="Headline" htmlFor="tc-headline" hint="Describe your program honestly. Do not claim certification you do not hold.">
          <Textarea id="tc-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} className="rounded-none border-[#171715]" />
        </Field>
        <div className="grid gap-2">
          {toggles.map(([id, label, value, setter]) => (
            <label key={id} htmlFor={id} className="flex items-center gap-3 text-sm">
              <Switch id={id} checked={value} onCheckedChange={setter} disabled={!isAdmin} /> {label}
            </label>
          ))}
        </div>
        <Field label="Policies to list publicly" hint="Only approved policies can be listed. The public page shows the title, version and approval date, not the text.">
          {approvedPolicies.length === 0 ? (
            <p className="text-sm text-[#6d6c64]">Approve a policy first.</p>
          ) : (
            <div className="grid gap-1">
              {approvedPolicies.map((policy) => (
                <label key={policy.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={publishedPolicyIds.includes(policy.id)}
                    disabled={!isAdmin}
                    onCheckedChange={(value) => setPublishedPolicyIds(value ? [...publishedPolicyIds, policy.id] : publishedPolicyIds.filter((id) => id !== policy.id))}
                  />
                  {policy.title}
                </label>
              ))}
            </div>
          )}
        </Field>
      </fieldset>
      {isAdmin ? (
        <Button
          className="mt-4 rounded-none"
          disabled={busy}
          onClick={() => act({ action: "saveTrustCenter", published, displayName, headline, contactEmail, showFrameworks, showReadiness, showControlCategories, publishedPolicyIds })}
        >
          Save trust center
        </Button>
      ) : null}
    </section>
  );
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin — manage everything" },
  { value: "member", label: "Member — controls, evidence, risks" },
  { value: "viewer", label: "Viewer / auditor — read only" },
] as const;

export function TeamSection({ snapshot, act, busy, isAdmin }: SectionProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [people, setPeople] = useState(snapshot.settings.employeeEmails.join("\n"));
  const enabledFrameworks = snapshot.frameworks.filter((framework) => snapshot.settings.frameworkIds.includes(framework.id));
  const exportBase = `/api/trust/tenants/${snapshot.tenant.id}/export`;

  return (
    <div className="grid gap-6">
      <section className={`${panel} p-4 sm:p-6`}>
        <h2 className="text-xl font-bold">Members</h2>
        <p className="mb-4 text-sm text-[#6d6c64]">Invite people who already have a SaaSassin account. Viewers are read-only and suit auditors.</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
            <TableBody>
              {snapshot.members.map((member) => (
                <TableRow key={member.uid}><TableCell>{member.email}{member.name ? ` · ${member.name}` : ""}</TableCell><TableCell className="capitalize">{member.role}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {isAdmin ? (
          <form
            className="mt-4 grid gap-2 sm:grid-cols-[1fr_16rem_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await act({ action: "inviteMember", email, role })) setEmail("");
            }}
          >
            <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" aria-label="Invite email" className="rounded-none border-[#171715]" />
            <SimpleSelect value={role} onChange={setRole} options={[...ROLE_OPTIONS]} />
            <Button type="submit" className="rounded-none" disabled={busy}><UserPlus /> Invite</Button>
          </form>
        ) : null}
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <h2 className="text-xl font-bold">People in scope for policies</h2>
        <p className="mb-3 text-sm text-[#6d6c64]">
          Employees and contractors who must acknowledge approved policies but do not need workspace access. Workspace members are always included. One email per line.
        </p>
        <Textarea
          value={people}
          onChange={(event) => setPeople(event.target.value)}
          rows={5}
          disabled={!isAdmin}
          aria-label="People in scope, one email per line"
          placeholder={"alex@company.com\nsam@company.com"}
          className="rounded-none border-[#171715] font-mono text-xs"
        />
        <p className="mt-1 text-xs text-[#6d6c64]">{snapshot.people.length} people currently expected to acknowledge each approved policy.</p>
        {isAdmin ? (
          <Button
            className="mt-3 rounded-none"
            disabled={busy}
            onClick={() => act({ action: "setEmployees", emails: people.split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean) })}
          >
            Save people in scope
          </Button>
        ) : null}
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <h2 className="text-xl font-bold">Export</h2>
        <p className="mb-4 text-sm text-[#6d6c64]">Your program is yours. Exports are versioned JSON (schema net.saasassin.trust.*@1.0.0).</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="rounded-none"><a href={exportBase} download><Download /> Full workspace export</a></Button>
          {enabledFrameworks.map((framework) => (
            <Button key={framework.id} asChild variant="outline" className="rounded-none border-[#171715]">
              <a href={`${exportBase}?package=${framework.id}`} download><Download /> {framework.id === "soc2" ? "SOC 2" : "ISO 27001"} evidence package</a>
            </Button>
          ))}
        </div>
      </section>

      <section className={`${panel} p-4 sm:p-6`}>
        <h2 className="text-xl font-bold">Activity</h2>
        <p className="mb-4 text-sm text-[#6d6c64]">Append-only log of every change in this workspace (latest 100).</p>
        {snapshot.audit.length === 0 ? (
          <EmptyState title="No activity yet." />
        ) : (
          <ol className="grid gap-1 text-sm">
            {snapshot.audit.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-x-3 border-b border-dashed border-[#d7d3c8] py-1.5">
                <span className="font-mono text-xs text-[#6d6c64]">{formatDate(event.occurredAt)}</span>
                <span className="font-semibold">{event.action}</span>
                <span className="text-[#6d6c64]">{event.actor?.email}</span>
                <span className="text-xs text-[#6d6c64]">{event.target.type}:{event.target.id}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
