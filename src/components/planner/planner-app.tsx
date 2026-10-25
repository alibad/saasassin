"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LoaderCircle, LogOut, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

import { apiJson } from "./format";
import { PlannerWorkspace } from "./planner-workspace";
import styles from "./planner.module.css";

type Tenant = { id: string; name: string; role: string };
const STORAGE_KEY = "planner:last-tenant";

function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function recall() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function PlannerApp({ email, accent }: { email: string; accent: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadTenants = useCallback(async () => {
    try {
      const body = await apiJson<{ tenants: Tenant[] }>("/api/fleet/planner/tenants");
      setTenants(body.tenants);
      const last = recall();
      setSelected((current) => current ?? (body.tenants.find((tenant) => tenant.id === last)?.id ?? body.tenants[0]?.id ?? null));
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      if (status === 401) router.push("/apps/planner/sign-in");
      setError((caught as Error).message);
      setTenants([]);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void loadTenants();
  }, [loadTenants]);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const body = await apiJson<{ tenant: Tenant }>("/api/fleet/planner/tenants", { method: "POST", body: JSON.stringify({ name }) });
      setName("");
      setSelected(body.tenant.id);
      remember(body.tenant.id);
      await loadTenants();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/fleet/planner/session", { method: "DELETE" });
    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      /* the server session is already cleared */
    }
    router.push("/apps/planner/sign-in");
    router.refresh();
  }

  const onForbidden = useCallback(() => {
    remember(null);
    setSelected(null);
  }, []);

  return (
    <main className={`fleet-app ${styles.app}`} style={{ "--planner-accent": accent } as CSSProperties}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="/apps/planner">
            <span className={styles.mark}><Image src="/brand/saasassin-mark.png" alt="" width={34} height={34} priority /></span>
            <span><strong>SaaSassin</strong><small>Planner</small></span>
          </a>
          <div className={styles.headerTools}>
            {tenants && tenants.length > 0 && (
              <Select
                value={selected ?? undefined}
                onValueChange={(value) => {
                  setSelected(value);
                  remember(value);
                }}
              >
                <SelectTrigger className={styles.tenantSelect} aria-label="Workspace"><SelectValue placeholder="Choose workspace" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <span className={styles.who}>{email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut /> <span className="hidden sm:inline">Sign out</span></Button>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
        {tenants === null ? (
          <div className="grid gap-3"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64 w-full" /></div>
        ) : selected ? (
          <PlannerWorkspace key={selected} tenantId={selected} onForbidden={onForbidden} />
        ) : null}

        {tenants !== null && (
          <Card className={`${styles.panel} ${selected ? "mt-8" : ""}`}>
            <CardHeader>
              <CardTitle>{tenants.length === 0 ? "Create your first workspace" : "New workspace"}</CardTitle>
              <CardDescription>A workspace holds your tasks, meetings, working hours, team and every plan version.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-2 sm:flex-row" onSubmit={createWorkspace}>
                <Label htmlFor="ws-name" className="sr-only">Workspace name</Label>
                <Input id="ws-name" placeholder="e.g. Launch team" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required />
                <Button type="submit" disabled={creating}>{creating ? <LoaderCircle className="animate-spin" /> : <Plus />} Create workspace</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
