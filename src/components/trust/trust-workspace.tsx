"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, Plus, RefreshCw, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ControlsSection, EvidenceSection } from "./controls-evidence";
import { PoliciesSection } from "./policies";
import { OverviewSection, TeamSection, TrustCenterSection } from "./program";
import { RisksSection, VendorsSection } from "./risks-vendors";
import { panel, SimpleSelect } from "./shared";
import type { TrustSnapshot } from "./types";

type Tenant = { id: string; name: string; role: string };

const STORAGE_KEY = "saasassin-trust-tenant";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
  return body as T;
}

export function TrustWorkspace({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tenantId, setTenantId] = useState<string>("");
  const [snapshot, setSnapshot] = useState<TrustSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [tab, setTab] = useState("overview");

  const loadTenants = useCallback(async () => {
    try {
      const { tenants: list } = await request<{ tenants: Tenant[] }>("/api/fleet/trust/tenants");
      setTenants(list);
      let remembered = "";
      try {
        remembered = window.localStorage.getItem(STORAGE_KEY) ?? "";
      } catch {
        remembered = "";
      }
      setTenantId((current) => current || (list.some((entry) => entry.id === remembered) ? remembered : list[0]?.id ?? ""));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load workspaces.");
      setTenants([]);
    }
  }, []);

  const loadSnapshot = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setSnapshot(await request<TrustSnapshot>(`/api/trust/tenants/${id}`));
      setError(null);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Could not load the workspace.");
    }
  }, []);

  useEffect(() => {
    // Initial data fetch from the server; state updates happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (!tenantId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, tenantId);
    } catch {
      // Remembering the workspace is a convenience only.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSnapshot(tenantId);
  }, [tenantId, loadSnapshot]);

  const act = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!tenantId) return false;
      setBusy(true);
      setError(null);
      try {
        await request(`/api/trust/tenants/${tenantId}`, { method: "POST", body: JSON.stringify(payload) });
        await loadSnapshot(tenantId);
        setNotice("Saved.");
        window.setTimeout(() => setNotice(null), 2500);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The change could not be saved.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [tenantId, loadSnapshot],
  );

  async function createWorkspace() {
    setBusy(true);
    setError(null);
    try {
      const { tenant } = await request<{ tenant: Tenant }>("/api/fleet/trust/tenants", { method: "POST", body: JSON.stringify({ name: newName }) });
      setTenants((list) => [...(list ?? []), tenant]);
      setSnapshot(null);
      setTenantId(tenant.id);
      setCreating(false);
      setNewName("");
      setTab("overview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the workspace.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/fleet/trust/session", { method: "DELETE" }).catch(() => null);
    router.push("/apps/trust/sign-in");
    router.refresh();
  }

  const role = snapshot?.role ?? "viewer";
  const isAdmin = role === "owner" || role === "admin";
  const canEdit = isAdmin || role === "member";
  const sectionProps = snapshot ? { snapshot, act, busy, canEdit, isAdmin } : null;

  return (
    <main className="fleet-app min-h-screen bg-[#f5f2e9] text-[#171715] [background-image:linear-gradient(rgba(16,16,15,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(16,16,15,0.055)_1px,transparent_1px)] [background-size:72px_72px]">
      <header className="border-b-2 border-[#171715] bg-[#fffdf7]">
        <div className="mx-auto flex w-[min(1180px,calc(100%-32px))] flex-wrap items-center justify-between gap-3 py-3">
          <Link href="/apps/trust" className="flex items-center gap-2 font-black">
            <span className="flex size-8 items-center justify-center border-2 border-[#171715] bg-[#e8ff59]"><ShieldCheck className="size-4" /></span>
            SaaSassin Trust
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {tenants && tenants.length > 0 ? (
              <div className="w-48 sm:w-56">
                <SimpleSelect
                  value={tenantId}
                  onChange={(value) => {
                    setSnapshot(null);
                    setTenantId(value);
                  }}
                  options={tenants.map((entry) => ({ value: entry.id, label: entry.name }))}
                />
              </div>
            ) : null}
            <Button variant="outline" size="sm" className="rounded-none border-[#171715]" onClick={() => setCreating(true)}><Plus /> Workspace</Button>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out"><LogOut /> <span className="hidden sm:inline">{userEmail}</span></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-[min(1180px,calc(100%-32px))] grid-cols-[minmax(0,1fr)] gap-4 py-6">
        {error ? (
          <Alert variant="destructive" className="rounded-none border-2">
            <AlertTitle>Something needs attention</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              {error}
              {tenantId ? <Button size="sm" variant="outline" className="rounded-none" onClick={() => loadSnapshot(tenantId)}><RefreshCw /> Retry</Button> : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {notice ? <p role="status" className="w-fit border-2 border-[#171715] bg-[#e8ff59] px-3 py-1 text-sm font-semibold">{notice}</p> : null}

        {tenants === null ? (
          <div className="grid gap-3"><Skeleton className="h-24 rounded-none" /><Skeleton className="h-64 rounded-none" /></div>
        ) : tenants.length === 0 ? (
          <section className={`${panel} mx-auto max-w-xl p-6`}>
            <h1 className="text-2xl font-black">Create your compliance workspace</h1>
            <p className="mt-2 text-sm text-[#6d6c64]">One workspace per company or program. You become its owner and can invite teammates and auditors.</p>
            <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void createWorkspace(); }}>
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Acme Inc." aria-label="Workspace name" className="min-w-48 flex-1 rounded-none border-[#171715]" />
              <Button type="submit" className="rounded-none" disabled={busy || newName.trim().length < 2}>{busy ? <LoaderCircle className="animate-spin" /> : null} Create workspace</Button>
            </form>
          </section>
        ) : !snapshot ? (
          error ? null : <div className="grid gap-3"><Skeleton className="h-24 rounded-none" /><Skeleton className="h-64 rounded-none" /></div>
        ) : snapshot.settings.frameworkIds.length === 0 ? (
          <FrameworkOnboarding snapshot={snapshot} busy={busy} isAdmin={isAdmin} act={act} />
        ) : sectionProps ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6d6c64]">Workspace · {role}</p>
                <h1 className="text-2xl font-black sm:text-3xl">{snapshot.tenant.name}</h1>
              </div>
              <p className="text-xs text-[#6d6c64]">Readiness and evidence tracking. Not a certification or legal advice.</p>
            </div>
            <Tabs value={tab} onValueChange={setTab} className="gap-4">
              <div className="overflow-x-auto pb-1">
                <TabsList className="h-auto w-max rounded-none border-2 border-[#171715] bg-[#fffdf7] p-1">
                  {[
                    ["overview", "Overview"],
                    ["controls", "Controls"],
                    ["evidence", "Evidence"],
                    ["policies", "Policies"],
                    ["risks", "Risks"],
                    ["vendors", "Vendors"],
                    ["trust-center", "Trust center"],
                    ["team", "Team & activity"],
                  ].map(([value, label]) => (
                    <TabsTrigger key={value} value={value} className="flex-none rounded-none data-active:bg-[#e8ff59] data-[state=active]:bg-[#e8ff59]">{label}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
              <TabsContent value="overview"><OverviewSection {...sectionProps} onNavigate={setTab} /></TabsContent>
              <TabsContent value="controls"><ControlsSection {...sectionProps} /></TabsContent>
              <TabsContent value="evidence"><EvidenceSection {...sectionProps} /></TabsContent>
              <TabsContent value="policies"><PoliciesSection {...sectionProps} /></TabsContent>
              <TabsContent value="risks"><RisksSection {...sectionProps} /></TabsContent>
              <TabsContent value="vendors"><VendorsSection {...sectionProps} /></TabsContent>
              <TabsContent value="trust-center"><TrustCenterSection key={snapshot.settings.trustCenter.updatedAt} {...sectionProps} /></TabsContent>
              <TabsContent value="team"><TeamSection {...sectionProps} /></TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-none border-2 border-[#171715]">
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>Workspaces are fully isolated: controls, evidence and members never cross between them.</DialogDescription>
          </DialogHeader>
          <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Workspace name" aria-label="Workspace name" className="rounded-none border-[#171715]" />
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setCreating(false)}>Cancel</Button>
            <Button className="rounded-none" disabled={busy || newName.trim().length < 2} onClick={createWorkspace}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FrameworkOnboarding({ snapshot, busy, isAdmin, act }: { snapshot: TrustSnapshot; busy: boolean; isAdmin: boolean; act: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const [selected, setSelected] = useState<string[]>(["soc2"]);
  return (
    <section className={`${panel} mx-auto max-w-3xl p-6`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6d6c64]">{snapshot.tenant.name} · Step 1</p>
      <h1 className="text-2xl font-black">Choose the frameworks to track readiness against</h1>
      <p className="mt-2 text-sm text-[#6d6c64]">Controls come from the built-in library version {snapshot.libraryVersion}. You can add or remove frameworks later.</p>
      <div className="mt-4 grid gap-3">
        {snapshot.frameworks.map((framework) => (
          <label key={framework.id} className="flex cursor-pointer gap-3 border-2 border-[#171715] bg-white p-4">
            <Checkbox
              checked={selected.includes(framework.id)}
              disabled={!isAdmin}
              onCheckedChange={(value) => setSelected(value ? [...selected, framework.id] : selected.filter((id) => id !== framework.id))}
            />
            <span>
              <span className="block font-bold">{framework.name}</span>
              <span className="block text-sm">{framework.summary} {framework.controlCount} controls.</span>
              <span className="mt-1 block text-xs italic text-[#6d6c64]">{framework.disclaimer}</span>
            </span>
          </label>
        ))}
      </div>
      {isAdmin ? (
        <Button className="mt-4 rounded-none" disabled={busy || selected.length === 0} onClick={() => act({ action: "setFrameworks", frameworkIds: selected })}>
          Start program
        </Button>
      ) : (
        <p className="mt-4 text-sm">An owner or admin needs to choose frameworks first.</p>
      )}
    </section>
  );
}
