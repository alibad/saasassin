"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, MessagesSquare, Plus, RefreshCw } from "lucide-react";

import { useAccount, refreshAccount } from "@/components/account/client";
import { TeamPanel } from "@/components/account/team-panel";
import { FeedbackMark } from "@/brands/feedback/mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { loadAdminSnapshot } from "@/lib/feedback/data";

import { FEEDBACK_VIEWS, FeedbackShell, type FeedbackView } from "./app-shell";
import { InboxView } from "./inbox";
import { PageHeader } from "./settings-section";
import { apiJson } from "./shared";
import { BoardsView, ChangelogView, RoadmapView, SettingsView } from "./workspace-views";

export type AdminData = Awaited<ReturnType<typeof loadAdminSnapshot>> & {
  tenant: { id: string; name: string };
  role: string;
  me: { uid: string; email: string };
};

export const WORKSPACE_STORAGE_KEY = "feedback.workspace";

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return {
    workspace: params.get("workspace"),
    view: (FEEDBACK_VIEWS as readonly string[]).includes(view ?? "") ? (view as FeedbackView) : "inbox",
    post: params.get("post"),
  };
}

function rememberedWorkspace() {
  try {
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The signed-in Feedback app: picks the workspace, loads it, and shows the chosen section. */
export function FeedbackWorkspace() {
  const account = useAccount("feedback");
  const workspaces = account.data?.workspaces ?? null;
  const [requested, setRequested] = useState<{ workspace: string | null; view: FeedbackView; post: string | null } | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [view, setView] = useState<FeedbackView>("inbox");
  const [postId, setPostId] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingBoard, setCreatingBoard] = useState(false);

  // Read the address once on the client: ?workspace= arrives after accepting an invitation.
  useEffect(() => {
    const url = readUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only readable in the browser
    setRequested(url);
    setView(url.view);
    setPostId(url.post);
  }, []);

  // Choose the workspace once the list arrives: the invited one, the last one used, or the first.
  useEffect(() => {
    if (!requested || !workspaces || tenantId) return;
    const ids = workspaces.map((workspace) => workspace.id);
    const next = [requested.workspace, rememberedWorkspace()].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selection depends on the loaded account
    if (next) setTenantId(next);
  }, [requested, workspaces, tenantId]);

  // Keep the address in step, so a refresh or a shared link opens the same place.
  useEffect(() => {
    if (!tenantId) return;
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, tenantId);
    } catch {
      // Remembering the workspace is a convenience only.
    }
    const params = new URLSearchParams();
    if (view !== "inbox") params.set("view", view);
    if (view === "inbox" && postId) params.set("post", postId);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [tenantId, view, postId]);

  const load = useCallback(async (id: string) => {
    try {
      const next = await apiJson<AdminData>(`/api/feedback/tenants/${id}`);
      setData(next);
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    apiJson<AdminData>(`/api/feedback/tenants/${tenantId}`)
      .then((result) => { if (active) { setData(result); setError(null); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [tenantId]);

  const switchWorkspace = useCallback((id: string) => {
    setData(null);
    setPostId(null);
    setTenantId(id);
  }, []);

  const navigate = useCallback((next: FeedbackView) => {
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  const openPost = useCallback((id: string | null) => {
    setPostId(id);
    if (id) setView("inbox");
  }, []);

  const reload = useCallback(async () => {
    if (tenantId) await load(tenantId);
  }, [tenantId, load]);

  const current = data && data.tenant.id === tenantId ? data : null;
  const isAdmin = current?.role === "owner" || current?.role === "admin";
  const canTriage = isAdmin || current?.role === "member";

  if (workspaces && workspaces.length === 0) {
    return <FirstWorkspace onCreated={switchWorkspace} />;
  }

  return (
    <FeedbackShell
      tenantId={tenantId}
      onSwitchWorkspace={switchWorkspace}
      active={view}
      onNavigate={navigate}
      portalHref={tenantId ? `/apps/feedback/b/${tenantId}` : null}
    >
      <main id="main">
        {error ? (
          <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
            <Alert variant="destructive">
              <AlertTitle>We couldn&apos;t load this workspace</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {error}
                {tenantId ? <Button size="sm" variant="outline" onClick={() => void load(tenantId)}><RefreshCw /> Try again</Button> : null}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        {account.error && !workspaces ? (
          <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
            <Alert variant="destructive">
              <AlertTitle>We couldn&apos;t load your account</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                {account.error}
                <Button size="sm" variant="outline" onClick={() => void account.refresh()}><RefreshCw /> Try again</Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        {!current && !error ? <LoadingWorkspace /> : null}
        {current ? (
          <>
            {view === "inbox" ? (
              <InboxView
                data={current}
                isAdmin={isAdmin}
                canTriage={canTriage}
                selectedId={postId}
                onSelect={openPost}
                reload={reload}
                onCreateBoard={() => { setCreatingBoard(true); setView("boards"); }}
              />
            ) : null}
            {view === "roadmap" ? <RoadmapView data={current} isAdmin={isAdmin} reload={reload} onOpenPost={openPost} /> : null}
            {view === "changelog" ? <ChangelogView data={current} isAdmin={isAdmin} reload={reload} onOpenPost={openPost} /> : null}
            {view === "boards" ? <BoardsView data={current} isAdmin={isAdmin} reload={reload} creating={creatingBoard} onCreatingChange={setCreatingBoard} /> : null}
            {view === "settings" ? <SettingsView data={current} isAdmin={isAdmin} reload={reload} /> : null}
            {view === "team" ? (
              <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-6 px-4 py-8 sm:px-6">
                <PageHeader
                  title="Team"
                  description="Everyone who triages and answers feedback in this workspace. Invite people by email, even before they have an account."
                />
                <TeamPanel
                  product="feedback"
                  productName="Feedback"
                  tenantId={current.tenant.id}
                  onLeft={() => {
                    setData(null);
                    setTenantId(null);
                    setView("inbox");
                    void refreshAccount("feedback");
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </FeedbackShell>
  );
}

function LoadingWorkspace() {
  return (
    <div className="grid w-full gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)_minmax(0,1.15fr)]" aria-busy="true" aria-label="Loading your workspace">
      <div className="hidden gap-2 lg:grid">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-7" />)}</div>
      <div className="grid gap-2">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="hidden h-[520px] rounded-xl lg:block" />
    </div>
  );
}

/** First visit: name the workspace that will hold your boards. */
function FirstWorkspace({ onCreated }: { onCreated: (tenantId: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { tenant } = await apiJson<{ tenant: { id: string } }>("/api/fleet/feedback/tenants", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      await refreshAccount("feedback");
      onCreated(tenant.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <FeedbackMark size={36} />
          <span className="brand-heading text-2xl">Feedback</span>
        </div>
        <form onSubmit={create} className="grid gap-5 rounded-3xl border border-border bg-card p-7 shadow-[0_24px_48px_-28px_rgb(0_0_0/0.35)] sm:p-9">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><MessagesSquare className="size-6" /></span>
          <div>
            <h1 className="brand-heading text-2xl">Start listening to your customers</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Your workspace holds your boards, roadmap and changelog. Name it after your product; you can invite your team next.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fb-first-workspace">Product or company name</Label>
            <Input id="fb-first-workspace" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme" minLength={2} maxLength={80} required autoFocus className="h-11" />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <Button type="submit" size="lg" className="h-11" disabled={busy || name.trim().length < 2}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Plus />} Create workspace
          </Button>
        </form>
      </div>
    </main>
  );
}
