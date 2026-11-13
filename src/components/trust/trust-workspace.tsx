"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle, Plus, RefreshCw, ShieldCheck } from "lucide-react";

import { TrustMark } from "@/brands/trust/mark";
import { refreshAccount, useAccount } from "@/components/account/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { AccessReviewsSection } from "./access-reviews";
import { TRUST_SECTIONS, TrustShell, type TrustSection } from "./app-shell";
import { AuditsSection } from "./audits";
import { ControlsSection, EvidenceSection } from "./controls-evidence";
import { OverviewSection } from "./overview";
import { PoliciesSection } from "./policies";
import { ActivitySection, PeopleSection, SettingsSection, TrustCenterSection } from "./program";
import { RisksSection, VendorsSection } from "./risks-vendors";
import { panel } from "./shared";
import type { TrustSnapshot } from "./types";

export const TRUST_WORKSPACE_KEY = "trust.workspace";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new Error("You appear to be offline. Check your connection and try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Something went wrong. Try again.");
  return body as T;
}

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const section = params.get("section");
  return {
    workspace: params.get("workspace"),
    section: (TRUST_SECTIONS as readonly string[]).includes(section ?? "") ? (section as TrustSection) : "overview",
  };
}

function remembered() {
  try {
    return window.localStorage.getItem(TRUST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

/** The signed-in Trust app: choose the workspace, load its program, and show the chosen section. */
export function TrustWorkspace() {
  const account = useAccount("trust");
  const workspaces = account.data?.workspaces ?? null;
  const [requested, setRequested] = useState<{ workspace: string | null; section: TrustSection } | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [section, setSection] = useState<TrustSection>("overview");
  const [snapshot, setSnapshot] = useState<TrustSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = readUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    setRequested(url);
    setSection(url.section);
  }, []);

  useEffect(() => {
    if (!requested || !workspaces || tenantId) return;
    const ids = workspaces.map((workspace) => workspace.id);
    const next = [requested.workspace, remembered()].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selection depends on the loaded account
    if (next) setTenantId(next);
  }, [requested, workspaces, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      window.localStorage.setItem(TRUST_WORKSPACE_KEY, tenantId);
    } catch {
      // Remembering the workspace is a convenience only.
    }
    window.history.replaceState(null, "", section === "overview" ? window.location.pathname : `${window.location.pathname}?section=${section}`);
  }, [tenantId, section]);

  const loadSnapshot = useCallback(async (id: string) => {
    try {
      setSnapshot(await request<TrustSnapshot>(`/api/trust/tenants/${id}`));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't load this workspace.");
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    request<TrustSnapshot>(`/api/trust/tenants/${tenantId}`)
      .then((result) => { if (active) { setSnapshot(result); setError(null); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [tenantId]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!tenantId) return false;
      setBusy(true);
      try {
        await request(`/api/trust/tenants/${tenantId}`, { method: "POST", body: JSON.stringify(payload) });
        await loadSnapshot(tenantId);
        toast({ title: "Saved" });
        return true;
      } catch (cause) {
        toast({ title: "That wasn't saved", description: cause instanceof Error ? cause.message : "Try again.", variant: "destructive" });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [tenantId, loadSnapshot],
  );

  const switchWorkspace = useCallback((id: string) => {
    setSnapshot(null);
    setTenantId(id);
  }, []);

  const navigate = useCallback((next: TrustSection) => {
    setSection(next);
    window.scrollTo({ top: 0 });
  }, []);

  if (workspaces && workspaces.length === 0) return <FirstWorkspace onCreated={switchWorkspace} />;

  const current = snapshot && snapshot.tenant.id === tenantId ? snapshot : null;
  const role = current?.role ?? "viewer";
  const isAdmin = role === "owner" || role === "admin";
  const canEdit = isAdmin || role === "member";
  const props = current ? { snapshot: current, act, busy, canEdit, isAdmin } : null;
  const counts: Partial<Record<TrustSection, number>> = current ? {
    controls: current.controls.filter((control) => control.status === "needs_evidence").length,
    evidence: current.evidence.filter((item) => item.freshness === "expired" || item.freshness === "expiring_soon").length,
    policies: current.policies.filter((policy) => policy.status !== "approved").length,
    risks: current.risks.filter((risk) => risk.status === "open" && (risk.level === "high" || risk.level === "critical")).length,
    vendors: current.vendors.filter((vendor) => vendor.overdue).length,
    access: current.systems.filter((system) => system.reviewDue).length,
    audits: current.findings.filter((finding) => finding.overdue).length,
  } : {};

  return (
    <TrustShell tenantId={tenantId} onSwitchWorkspace={switchWorkspace} active={section} onNavigate={navigate} counts={counts}>
      {error ? (
        <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-8">
          <Alert variant="destructive">
            <AlertTitle>We couldn&apos;t load this workspace</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {error}
              {tenantId ? <Button size="sm" variant="outline" onClick={() => void loadSnapshot(tenantId)}><RefreshCw /> Try again</Button> : null}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {!current && !error ? (
        <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-4 px-4 py-8 sm:px-8" aria-busy="true" aria-label="Loading your program">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
          <div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24" />)}</div>
          <Skeleton className="h-72" />
        </div>
      ) : null}
      {current && props ? (
        current.settings.frameworkIds.length === 0 ? (
          <FrameworkOnboarding snapshot={current} busy={busy} isAdmin={isAdmin} act={act} />
        ) : (
          <>
            {section === "overview" ? <OverviewSection snapshot={current} onNavigate={navigate} /> : null}
            {section === "controls" ? <ControlsSection {...props} /> : null}
            {section === "evidence" ? <EvidenceSection {...props} /> : null}
            {section === "policies" ? <PoliciesSection {...props} /> : null}
            {section === "risks" ? <RisksSection {...props} /> : null}
            {section === "vendors" ? <VendorsSection {...props} /> : null}
            {section === "access" ? <AccessReviewsSection {...props} /> : null}
            {section === "audits" ? <AuditsSection {...props} /> : null}
            {section === "trust-center" ? <TrustCenterSection key={current.settings.trustCenter.updatedAt} {...props} /> : null}
            {section === "people" ? (
              <PeopleSection
                key={current.settings.employeeEmails.join(",")}
                {...props}
                onLeft={() => {
                  setSnapshot(null);
                  setTenantId(null);
                  setSection("overview");
                  void refreshAccount("trust");
                }}
              />
            ) : null}
            {section === "activity" ? <ActivitySection {...props} /> : null}
            {section === "settings" ? <SettingsSection {...props} /> : null}
          </>
        )
      ) : null}
    </TrustShell>
  );
}

function FrameworkOnboarding({ snapshot, busy, isAdmin, act }: { snapshot: TrustSnapshot; busy: boolean; isAdmin: boolean; act: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [selected, setSelected] = useState<string[]>(["soc2"]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
      <p className="text-sm text-muted-foreground">{snapshot.tenant.name}</p>
      <h1 className="brand-heading mt-1 text-2xl">Which frameworks are you working toward?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Trust sets up the controls for each one from its built-in library (version <span className="font-mono">{snapshot.libraryVersion}</span>). You can add or remove frameworks later without losing work.
      </p>
      <div className="mt-6 grid gap-3">
        {snapshot.frameworks.map((framework) => {
          const on = selected.includes(framework.id);
          return (
            <label key={framework.id} className={cn(panel, "flex cursor-pointer gap-4 p-4 transition-colors", on && "border-foreground/40")}>
              <Checkbox
                checked={on}
                disabled={!isAdmin}
                onCheckedChange={(value) => setSelected(value ? [...selected, framework.id] : selected.filter((id) => id !== framework.id))}
              />
              <span>
                <span className="block font-medium">{framework.name}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{framework.summary} <span className="font-mono">{framework.controlCount}</span> controls.</span>
                <span className="mt-1 block text-xs text-muted-foreground">{framework.disclaimer}</span>
              </span>
            </label>
          );
        })}
      </div>
      {isAdmin ? (
        <Button className="mt-6" size="lg" disabled={busy || selected.length === 0} onClick={() => act({ action: "setFrameworks", frameworkIds: selected })}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Check />} Set up my program
        </Button>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">An owner or admin chooses the frameworks. You&apos;ll see the program as soon as they do.</p>
      )}
    </div>
  );
}

function FirstWorkspace({ onCreated }: { onCreated: (tenantId: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { tenant } = await request<{ tenant: { id: string } }>("/api/fleet/trust/tenants", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await refreshAccount("trust");
      onCreated(tenant.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't create the workspace.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2">
          <TrustMark size={30} />
          <span className="brand-heading text-xl">Trust</span>
        </div>
        <form onSubmit={create} className={cn(panel, "grid gap-5 p-7")}>
          <span className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground"><ShieldCheck className="size-5" /></span>
          <div>
            <h1 className="brand-heading text-xl">Set up your compliance program</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">One workspace per company. You&apos;ll be its owner, and can invite your team and, later, your auditor.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trust-first-workspace">Company name</Label>
            <Input id="trust-first-workspace" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Inc." minLength={2} maxLength={80} required autoFocus />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Create workspace</Button>
        </form>
      </div>
    </main>
  );
}
