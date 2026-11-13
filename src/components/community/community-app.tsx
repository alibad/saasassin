"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CircleAlert, Link2, Plus, Sparkles } from "lucide-react";

import { useAccount } from "@/components/account/client";
import { CreateWorkspaceDialog } from "@/components/account/workspace-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { CommunityWorkspace } from "./community-workspace";
import { COMMUNITY_VIEWS, CommunityShell, type CommunityView } from "./shell";

const REMEMBERED = "community:lastTenant";

function remembered() {
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(tenantId: string) {
  try {
    window.localStorage.setItem(REMEMBERED, tenantId);
  } catch {
    // Storage can be unavailable in private windows; the URL still carries the choice.
  }
}

export type CommunityNavigate = (next: { view?: CommunityView; space?: string | null; workspace?: string }) => void;

/**
 * Community once signed in. The community and the page live in the URL
 * (`?workspace=…&view=…&space=…`; `?c=` from older join links still works), so invitations,
 * the account menu and the back button all land in the right place.
 */
export function CommunityApp({ userEmail, initialTenantId }: { userEmail: string; initialTenantId: string | null }) {
  const { data, loading, error, refresh } = useAccount("community");
  const searchParams = useSearchParams();
  const [stored, setStored] = useState<string | null>(null);
  const [refreshedFor, setRefreshedFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only memory of the last community
    setStored(remembered());
  }, []);

  const workspaces = useMemo(() => data?.workspaces ?? [], [data]);
  const requested = searchParams.get("workspace") ?? searchParams.get("c") ?? initialTenantId;
  const active = workspaces.find((entry) => entry.id === requested) ?? workspaces.find((entry) => entry.id === stored) ?? workspaces[0] ?? null;
  const requestedView = searchParams.get("view") as CommunityView | null;
  const view: CommunityView = requestedView && COMMUNITY_VIEWS.includes(requestedView) ? requestedView : "feed";
  const spaceId = searchParams.get("space");

  // Just joined (from an invite or join link) and the account list doesn't know yet.
  useEffect(() => {
    if (requested && data && !workspaces.some((entry) => entry.id === requested) && refreshedFor !== requested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one refresh per unknown community
      setRefreshedFor(requested);
      void refresh();
    }
  }, [requested, data, workspaces, refreshedFor, refresh]);

  useEffect(() => {
    if (active) remember(active.id);
  }, [active]);

  const navigate = useCallback<CommunityNavigate>((next) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("c");
    if (next.workspace) params.set("workspace", next.workspace);
    if (next.view) params.set("view", next.view);
    if (next.space) params.set("space", next.space);
    else if (next.space === null || (next.view && next.view !== "space")) params.delete("space");
    window.history.pushState(null, "", `?${params.toString()}`);
    window.scrollTo({ top: 0 });
  }, []);

  const switchCommunity = useCallback((tenantId: string) => {
    remember(tenantId);
    setStored(tenantId);
    navigate({ workspace: tenantId, view: "feed", space: null });
  }, [navigate]);

  if (active) {
    return (
      <CommunityWorkspace
        key={active.id}
        tenantId={active.id}
        userEmail={userEmail}
        view={view}
        spaceId={spaceId}
        navigate={(next) => navigate({ ...next, workspace: active.id })}
        onSwitchCommunity={switchCommunity}
        onLeft={() => {
          void refresh().then(() => navigate({ view: "feed", space: null }));
        }}
      />
    );
  }

  return (
    <CommunityShell
      tenantId={null}
      spaces={[]}
      nav={{ view: "feed", spaceId: null, onNavigate: () => undefined }}
      counts={{ unread: 0, moderation: 0, members: 0 }}
      access={{ moderate: false, manage: false, hasCourses: false, hasPlans: false, canPost: false }}
      onSwitchCommunity={switchCommunity}
      onSearch={() => undefined}
      onNewPost={() => undefined}
    >
      {loading && !data ? (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-12 w-80 rounded-2xl" />
          <Skeleton className="h-64 rounded-[var(--radius)]" />
        </div>
      ) : error && !data ? (
        <Alert variant="destructive"><CircleAlert /><AlertTitle>Your account couldn&apos;t be loaded</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      ) : (
        <div className="mx-auto grid max-w-3xl gap-6 py-6">
          <section className="relative overflow-hidden rounded-[calc(var(--radius)*1.4)] bg-brand-ink px-6 py-10 text-brand-ink-foreground sm:px-10">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_100%_0%,color-mix(in_oklab,var(--primary)_60%,transparent)_0%,transparent_70%),radial-gradient(50%_80%_at_0%_110%,color-mix(in_oklab,var(--brand-accent)_45%,transparent)_0%,transparent_70%)]" aria-hidden="true" />
            <div className="relative">
              <span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Sparkles className="size-6 text-brand-accent" aria-hidden="true" /></span>
              <h1 className="brand-heading mt-5 text-4xl leading-tight">Bring your people together</h1>
              <p className="mt-3 max-w-xl text-brand-ink-foreground/80">
                Start a community with spaces for conversations, announcements and events. Share one link to invite members; they choose a handle and never see each other&apos;s email.
              </p>
              <Button size="lg" className="mt-6 rounded-full bg-brand-accent px-5 text-brand-accent-foreground hover:bg-brand-accent/90" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" /> Start a community
              </Button>
            </div>
          </section>
          <section className="flex items-start gap-4 rounded-[var(--radius)] bg-card p-6 ring-1 ring-border">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><Link2 className="size-5" aria-hidden="true" /></span>
            <div>
              <h2 className="font-heading text-lg font-semibold">Joining someone else&apos;s community?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Open the invite link they shared with you while signed in as {userEmail}. Invitations sent to your email also show up in the account menu.</p>
            </div>
          </section>
        </div>
      )}
      <CreateWorkspaceDialog
        product="community"
        open={creating}
        onOpenChange={setCreating}
        title="Start a community"
        label="Community name"
        onCreated={(tenantId) => {
          setCreating(false);
          switchCommunity(tenantId);
        }}
      />
    </CommunityShell>
  );
}
