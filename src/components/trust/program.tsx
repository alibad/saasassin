"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Download, ExternalLink, Globe, ShieldOff } from "lucide-react";

import { TeamPanel } from "@/components/account/team-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ActivityFeed } from "./activity";
import { EmailAvatar, Field, formatDate, memberByEmail, PageHeader, panel, PanelHeader, PersonCell, Pill } from "./shared";
import type { SectionProps } from "./types";

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

  const toggles: Array<[string, string, string, boolean, (value: boolean) => void]> = [
    ["tc-frameworks", "Frameworks", "Which frameworks you track readiness against.", showFrameworks, setShowFrameworks],
    ["tc-readiness", "Readiness figures", "Control coverage and evidence freshness, labelled as self-reported.", showReadiness, setShowReadiness],
    ["tc-categories", "Controls by area", "How many controls are implemented in each area.", showControlCategories, setShowControlCategories],
  ];

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Trust center"
        description="A public page for customers' security reviews. Nothing is public until you publish, and only what you choose here is shown. Evidence, owners, risks and vendors never are."
        meta={<Pill tone={current.published ? "positive" : "neutral"}>{current.published ? "Published" : "Not published"}</Pill>}
        action={current.published ? (
          <Button asChild variant="outline">
            <Link href={publicHref} target="_blank" rel="noopener"><Globe /> View public page <ExternalLink /></Link>
          </Button>
        ) : null}
      />
      {!isAdmin ? (
        <Alert><AlertTitle>Read only</AlertTitle><AlertDescription>Owners and admins decide what&apos;s published.</AlertDescription></Alert>
      ) : null}
      <fieldset disabled={!isAdmin} className="grid gap-5">
        <section className={cn(panel, "flex flex-wrap items-center gap-4 p-4 sm:p-5")}>
          <Switch checked={published} onCheckedChange={setPublished} disabled={!isAdmin} aria-label="Publish the trust center" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{published ? "Public" : "Private"}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{publicHref}</p>
          </div>
        </section>
        <section className={panel}>
          <PanelHeader title="Page" description="Describe your program honestly; never claim a certification you don't hold." />
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="tc-name"><Input id="tc-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field>
              <Field label="Security contact" htmlFor="tc-contact"><Input id="tc-contact" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="security@yourcompany.com" /></Field>
            </div>
            <Field label="Introduction" htmlFor="tc-headline">
              <Textarea id="tc-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} rows={3} placeholder="How you protect customer data, and where you are on the road to SOC 2." />
            </Field>
          </div>
        </section>
        <section className={panel}>
          <PanelHeader title="What to show" />
          <div className="divide-y divide-border">
            {toggles.map(([id, label, hint, value, setter]) => (
              <label key={id} htmlFor={id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
                <Switch id={id} checked={value} onCheckedChange={setter} disabled={!isAdmin} />
              </label>
            ))}
          </div>
        </section>
        <section className={panel}>
          <PanelHeader title="Policies to list" description="Only approved policies. The page shows the title, version and approval date; customers request the text from your security contact." />
          {approvedPolicies.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">Approve a policy first.</p>
          ) : (
            <div className="grid gap-0.5 p-2 sm:grid-cols-2">
              {approvedPolicies.map((policy) => (
                <label key={policy.id} className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-muted/60">
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
        </section>
      </fieldset>
      {isAdmin ? (
        <div className="flex justify-end">
          <Button
            disabled={busy}
            onClick={() => act({ action: "saveTrustCenter", published, displayName, headline, contactEmail, showFrameworks, showReadiness, showControlCategories, publishedPolicyIds })}
          >
            {published ? "Save and publish" : "Save"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The team, the auditors' time-boxed access, and everyone else who must acknowledge policies. */
export function PeopleSection({ snapshot, act, busy, isAdmin, onLeft }: SectionProps & { onLeft: () => void }) {
  const [people, setPeople] = useState(snapshot.settings.employeeEmails.join("\n"));
  const today = new Date().toISOString().slice(0, 10);
  const grants = snapshot.auditPeriods.flatMap((period) => period.auditors.map((grant) => ({ ...grant, period })));

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="People"
        description="Who works on your program, the auditors who can read it until a set date, and everyone who must acknowledge your policies."
      />
      <TeamPanel product="trust" productName="Trust" tenantId={snapshot.tenant.id} onLeft={onLeft} />

      <section className={panel} aria-label="Auditor access">
        <PanelHeader
          title="Auditor access"
          description="Auditors join as Viewers: they can read every control, piece of evidence and policy, change nothing, and lose access when their date passes."
          action={<Pill tone="neutral" dot={false}>{grants.filter((grant) => grant.expiresAt >= today).length} active</Pill>}
        />
        {grants.length === 0 ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">No auditors yet. Invite your auditor above as a Viewer, then set when their access ends from an audit in Audits.</p>
        ) : (
          <ul className="divide-y divide-border">
            {grants.map((grant) => {
              const member = memberByEmail(snapshot, grant.email);
              const active = grant.expiresAt >= today;
              return (
                <li key={`${grant.period.id}:${grant.email}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <PersonCell
                    snapshot={snapshot}
                    email={grant.email}
                    size="md"
                    detail={<>{grant.period.name}{member ? "" : " · hasn't joined yet"}</>}
                  />
                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <Pill tone={active ? "positive" : "muted"}><CalendarClock className="size-3" /> {active ? `Until ${formatDate(grant.expiresAt)}` : `Ended ${formatDate(grant.expiresAt)}`}</Pill>
                    {isAdmin && active ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: "revokeAuditorAccess", auditPeriodId: grant.period.id, email: grant.email })}>
                        <ShieldOff /> End now
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={panel} aria-label="People in scope">
        <PanelHeader
          title="Everyone who acknowledges policies"
          description="Workspace members are always included. Add employees and contractors who don't need access to Trust, one email per line."
          action={<Pill tone="neutral" dot={false}>{snapshot.people.length} people</Pill>}
        />
        <div className="grid gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-1.5">
            {snapshot.people.slice(0, 24).map((email) => <EmailAvatar key={email} snapshot={snapshot} email={email} size="sm" />)}
            {snapshot.people.length > 24 ? <span className="self-center text-xs text-muted-foreground">+{snapshot.people.length - 24}</span> : null}
          </div>
          <Textarea
            value={people}
            onChange={(event) => setPeople(event.target.value)}
            rows={5}
            disabled={!isAdmin}
            aria-label="People in scope, one email per line"
            placeholder={"alex@yourcompany.com\nsam@yourcompany.com"}
            className="font-mono text-xs"
          />
          {isAdmin ? (
            <Button
              className="justify-self-end"
              variant="outline"
              disabled={busy}
              onClick={() => act({ action: "setEmployees", emails: people.split(/[\s,;]+/).map((entry) => entry.trim()).filter(Boolean) })}
            >
              Save list
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function ActivitySection({ snapshot }: SectionProps) {
  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Activity" description="Every change in this workspace, newest first. The log is append-only: entries can't be edited or deleted, and the full log is in your export." />
      <section className={panel}><ActivityFeed snapshot={snapshot} /></section>
    </div>
  );
}

export function SettingsSection({ snapshot, act, busy, isAdmin }: SectionProps) {
  const [frameworkIds, setFrameworkIds] = useState<string[]>(snapshot.settings.frameworkIds);
  const changed = frameworkIds.slice().sort().join() !== snapshot.settings.frameworkIds.slice().sort().join();
  const enabled = snapshot.frameworks.filter((framework) => snapshot.settings.frameworkIds.includes(framework.id));
  const exportBase = `/api/trust/tenants/${snapshot.tenant.id}/export`;
  const migration = snapshot.libraryMigration;

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title="Settings" description="Frameworks, the control library your program is pinned to, and exports of everything you've recorded." />

      <section className={panel}>
        <PanelHeader title="Frameworks" description={<>Controls come from the built-in library, version <span className="font-mono">{snapshot.libraryVersion}</span>. Removing a framework keeps its records; they return if you add it back.</>} />
        <div className="grid gap-2 p-4 sm:p-5 md:grid-cols-2">
          {snapshot.frameworks.map((framework) => (
            <label key={framework.id} className={cn("flex cursor-pointer gap-3 rounded-md border p-3", frameworkIds.includes(framework.id) ? "border-foreground/30 bg-muted/40" : "border-border")}>
              <Checkbox
                checked={frameworkIds.includes(framework.id)}
                disabled={!isAdmin}
                onCheckedChange={(value) => setFrameworkIds(value ? [...frameworkIds, framework.id] : frameworkIds.filter((id) => id !== framework.id))}
              />
              <span>
                <span className="block text-sm font-medium">{framework.name}</span>
                <span className="block text-xs text-muted-foreground"><span className="font-mono">{framework.controlCount}</span> controls · {framework.summary}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{framework.disclaimer}</span>
              </span>
            </label>
          ))}
        </div>
        {isAdmin ? (
          <div className="flex justify-end border-t border-border px-4 py-3 sm:px-5">
            <Button disabled={busy || !changed || frameworkIds.length === 0} onClick={() => act({ action: "setFrameworks", frameworkIds })}>Save frameworks</Button>
          </div>
        ) : null}
      </section>

      <section className={panel}>
        <PanelHeader
          title="Control library"
          description="Your program stays on the controls it adopted until an admin reviews and applies an update. Updates never delete stored records or evidence."
          action={<Pill tone={migration.upToDate ? "positive" : "warning"}>{migration.upToDate ? "Up to date" : "Update available"}</Pill>}
        />
        <div className="grid gap-2 p-4 text-sm sm:p-5">
          <p className="font-mono text-xs text-muted-foreground">Pinned at {migration.fromVersion} · latest {migration.toVersion}</p>
          {!migration.upToDate ? (
            <>
              {!migration.baselineRecorded ? <p>No baseline was recorded for this program yet. Applying records the current library as its baseline.</p> : null}
              <p>{migration.unchanged} controls unchanged · {migration.added.length} added · {migration.removed.length} retired</p>
              {migration.added.length > 0 ? (
                <ul className="grid gap-1 text-xs">{migration.added.map((control) => <li key={control.id}>+ <span className="font-mono font-medium">{control.ref}</span> {control.title}</li>)}</ul>
              ) : null}
              {migration.removed.length > 0 ? (
                <ul className="grid gap-1 text-xs">
                  {migration.removed.map((control) => <li key={control.id}>− <span className="font-mono">{control.id}</span>{control.hasRecords ? " (has records, kept in exports)" : ""}</li>)}
                </ul>
              ) : null}
              {isAdmin ? (
                <Button className="w-fit" disabled={busy} onClick={() => act({ action: "applyLibraryMigration", toVersion: migration.toVersion })}>
                  Apply update to {migration.toVersion}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className={panel}>
        <PanelHeader title="Export" description={<>Your program is yours. Exports are versioned JSON (<span className="font-mono">net.saasassin.trust.*@1.0.0</span>), and an evidence package maps each requirement to its controls and evidence for your auditor.</>} />
        <div className="flex flex-wrap gap-2 p-4 sm:p-5">
          <Button asChild><a href={exportBase} download><Download /> Full workspace</a></Button>
          {enabled.map((framework) => (
            <Button key={framework.id} asChild variant="outline">
              <a href={`${exportBase}?package=${framework.id}`} download><Download /> {framework.id === "soc2" ? "SOC 2" : "ISO 27001"} evidence package</a>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}
