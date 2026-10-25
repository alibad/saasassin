"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { ArrowRight, LoaderCircle, LogOut, Plus, Users } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

import { api, paperCard } from "./api";
import { CommunityWorkspace } from "./community-workspace";

type TenantSummary = { id: string; name: string; role: string };

export function CommunityApp({ userEmail, initialTenantId }: { userEmail: string; initialTenantId: string | null }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialTenantId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { tenants: list } = await api<{ tenants: TenantSummary[] }>("/api/fleet/community/tenants");
      setTenants(list);
      setActiveId((current) => {
        if (current && list.some((tenant) => tenant.id === current)) return current;
        let remembered: string | null = null;
        try { remembered = window.localStorage.getItem("community:lastTenant"); } catch { /* storage unavailable */ }
        if (remembered && list.some((tenant) => tenant.id === remembered)) return remembered;
        return list.length === 1 ? list[0].id : null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your communities.");
      setTenants([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the signed-in user's communities
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeId) return;
    try { window.localStorage.setItem("community:lastTenant", activeId); } catch { /* storage unavailable */ }
  }, [activeId]);

  async function createCommunity(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { tenant } = await api<{ tenant: TenantSummary }>("/api/fleet/community/tenants", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      await load();
      setActiveId(tenant.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the community.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/fleet/community/session", { method: "DELETE" });
    try { await signOut(getFirebaseClientAuth()); } catch { /* server session is already cleared */ }
    router.refresh();
  }

  const active = tenants?.find((tenant) => tenant.id === activeId) ?? null;

  if (active) {
    return (
      <CommunityWorkspace
        key={active.id}
        tenantId={active.id}
        userEmail={userEmail}
        otherCommunities={(tenants ?? []).length > 1}
        onSwitch={() => setActiveId(null)}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <main className="fleet-app min-h-screen bg-[var(--paper)] px-4 py-8 text-[var(--ink)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">SaaSassin Community</p>
            <h1 className="text-3xl font-black">Your communities</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-[var(--muted)] sm:inline">{userEmail}</span>
            <Button variant="outline" onClick={handleSignOut}><LogOut /> Sign out</Button>
          </div>
        </header>

        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        {tenants === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="animate-spin" size={16} /> Loading communities</div>
        ) : tenants.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {tenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => setActiveId(tenant.id)}
                className={`${paperCard} flex items-center justify-between gap-3 p-4 text-left transition-transform hover:-translate-y-0.5`}
              >
                <span className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border-2 border-[var(--ink)] bg-[#a855f7] text-white"><Users size={18} /></span>
                  <span>
                    <strong className="block">{tenant.name}</strong>
                    <Badge variant="secondary" className="mt-1 capitalize">{tenant.role}</Badge>
                  </span>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">You are not in a community yet. Create one below, or open an invite link someone shared with you.</p>
        )}

        <Card className={paperCard}>
          <CardHeader>
            <CardTitle>Create a community</CardTitle>
            <CardDescription>You become its owner. Add spaces, share an invite link, and moderate from one place.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={createCommunity}>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="community-name">Community name</Label>
                <Input id="community-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Indie Makers Club" minLength={2} maxLength={80} required />
              </div>
              <Button type="submit" disabled={busy || name.trim().length < 2}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Create
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
