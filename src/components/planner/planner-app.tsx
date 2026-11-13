"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, MailPlus, Menu, RefreshCw, UserPlus } from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { readableAuthError } from "@/components/account/auth-errors";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "@/components/account/client";
import { acceptPendingInvitation, WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { PlannerMark } from "@/brands/planner/mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { productLinks } from "@/lib/brand/links";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

import { isPlannerView, PLANNER_NAV, type PlannerView } from "./planner-nav";
import { PlannerWorkspace } from "./planner-workspace";

const PRODUCT = "planner";
const STORAGE_KEY = "planner:last-tenant";
const links = productLinks(PRODUCT);

function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: the choice still holds until the page closes */
  }
}

function recall() {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The signed-in Planner: a calendar-led workspace with the team, account and workspace switcher around it. */
export function PlannerApp() {
  return (
    <TooltipProvider delayDuration={250}>
      <Toaster />
      <Suspense fallback={<ShellSkeleton />}>
        <PlannerShell />
      </Suspense>
    </TooltipProvider>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link href={links.home} className={cn("flex items-center gap-2 text-foreground", className)} aria-label="Planner home">
      <PlannerMark size={26} />
      <span className="brand-heading text-[1.05rem]">Planner</span>
    </Link>
  );
}

function PlannerShell() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data, error, loading, refresh } = useAccount(PRODUCT);
  const [chosen, setChosen] = useState<string | null>(null);
  const [stored] = useState(recall);
  const workspaces = data?.workspaces ?? [];
  const requested = params.get("workspace");
  const rawView = params.get("view");
  const view: PlannerView = isPlannerView(rawView) ? rawView : "calendar";
  const has = (id: string | null) => Boolean(id && workspaces.some((workspace) => workspace.id === id));
  const tenantId = has(chosen) ? chosen : has(requested) ? requested : has(stored) ? stored : workspaces[0]?.id ?? null;

  const replaceParams = useCallback((update: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    update(next);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  // Arriving from an accepted invitation (?workspace=…): open that workspace once, then tidy the URL.
  useEffect(() => {
    if (!requested || !data) return;
    if (has(requested)) {
      remember(requested);
      replaceParams((next) => next.delete("workspace"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `has` reads `workspaces` from `data`
  }, [requested, data, replaceParams]);

  const switchTo = useCallback((id: string) => {
    setChosen(id);
    remember(id);
    replaceParams((next) => {
      next.delete("workspace");
      next.delete("view");
    });
  }, [replaceParams]);

  const navigate = useCallback((next: PlannerView) => {
    replaceParams((query) => {
      if (next === "calendar") query.delete("view");
      else query.set("view", next);
    });
  }, [replaceParams]);

  const onForbidden = useCallback(() => {
    remember(null);
    setChosen(null);
    void refreshAccount(PRODUCT);
  }, []);

  if (!data) {
    if (error && !loading) {
      return (
        <div className="grid min-h-dvh place-items-center bg-background p-6">
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <PlannerMark size={36} />
            <h1 className="brand-heading text-xl">Planner couldn&apos;t load your account</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button onClick={() => void refresh()}><RefreshCw /> Try again</Button>
              <Button variant="outline" asChild><Link href={links.signIn}>Sign in again</Link></Button>
            </div>
          </div>
        </div>
      );
    }
    return <ShellSkeleton />;
  }

  if (!tenantId) return <Welcome onCreated={switchTo} />;

  const accountMenu = (
    <AccountMenu
      product={PRODUCT}
      accountHref={`${links.home}/account`}
      teamHref={`${links.home}?view=team`}
      signInHref={links.signIn}
      currentTenantId={tenantId}
      onSwitchWorkspace={switchTo}
    />
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground lg:h-dvh lg:overflow-hidden">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex" aria-label="Planner">
        <div className="flex h-14 items-center px-4">
          <Wordmark />
        </div>
        <div className="px-3 pb-3">
          <WorkspaceSwitcher product={PRODUCT} currentTenantId={tenantId} onSwitch={switchTo} className="w-full max-w-none bg-card" />
        </div>
        <nav className="grid gap-5 overflow-y-auto px-3 pb-4" aria-label="Main">
          {(["plan", "workspace"] as const).map((group) => (
            <div key={group} className="grid gap-0.5">
              {group === "workspace" ? <p className="px-2.5 pb-1 text-[0.6875rem] font-semibold text-muted-foreground">Workspace</p> : null}
              {PLANNER_NAV.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-card text-foreground shadow-xs ring-1 ring-sidebar-border",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border p-3">
          <SidebarFooter onJoined={switchTo} onInvite={() => navigate("team")} />
        </div>
      </aside>

      <PlannerWorkspace
        key={tenantId}
        tenantId={tenantId}
        view={view}
        onNavigate={navigate}
        onForbidden={onForbidden}
        start={<MobileNav view={view} onNavigate={navigate} tenantId={tenantId} onSwitch={switchTo} />}
        end={
          <>
            <ThemeToggle />
            {accountMenu}
          </>
        }
      />
    </div>
  );
}

function MobileNav({ view, onNavigate, tenantId, onSwitch }: { view: PlannerView; onNavigate: (view: PlannerView) => void; tenantId: string; onSwitch: (id: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Open navigation"><Menu /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="flex items-center gap-2"><PlannerMark size={18} /> Planner</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PLANNER_NAV.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {index > 0 && PLANNER_NAV[index - 1].group !== item.group ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem onSelect={() => onNavigate(item.id)} className={cn(view === item.id && "font-semibold text-primary")}>
                  <Icon /> {item.label}
                </DropdownMenuItem>
              </div>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <PlannerMark size={22} />
      <WorkspaceSwitcher product={PRODUCT} currentTenantId={tenantId} onSwitch={onSwitch} className="h-8 max-w-40" />
    </div>
  );
}

function SidebarFooter({ onJoined, onInvite }: { onJoined: (id: string) => void; onInvite: () => void }) {
  const { data } = useAccount(PRODUCT);
  const invitation = data?.pendingInvitations[0];
  const [joining, setJoining] = useState(false);
  if (!invitation) {
    return (
      <button type="button" onClick={onInvite} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
        <span className="grid size-7 place-items-center rounded-full bg-accent text-accent-foreground"><UserPlus className="size-3.5" /></span>
        <span className="min-w-0">
          <span className="block font-medium">Invite your team</span>
          <span className="block text-xs text-muted-foreground">Plan everyone&apos;s week together</span>
        </span>
      </button>
    );
  }
  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium"><MailPlus className="size-4 text-primary" /> Invitation</p>
      <p className="text-xs text-muted-foreground">{invitation.invitedByName ? `${invitation.invitedByName} invited you to` : "You're invited to"} {invitation.workspaceName}.</p>
      <Button
        size="sm"
        disabled={joining}
        onClick={() => {
          setJoining(true);
          void acceptPendingInvitation(PRODUCT, invitation)
            .then(() => {
              toast({ title: `You joined ${invitation.workspaceName}` });
              onJoined(invitation.tenantId);
            })
            .catch((caught: unknown) => toast({ title: "Couldn't join", description: readableAuthError(caught), variant: "destructive" }))
            .finally(() => setJoining(false));
        }}
      >
        {joining ? <LoaderCircle className="animate-spin" /> : null} Join
      </Button>
    </div>
  );
}

function Welcome({ onCreated }: { onCreated: (id: string) => void }) {
  const { data } = useAccount(PRODUCT);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstName = data?.profile.name?.split(/\s+/)[0] ?? "";
  const invitations = data?.pendingInvitations ?? [];

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase(PRODUCT)}/tenants`, { method: "POST", json: { name: name.trim() } });
      await refreshAccount(PRODUCT);
      onCreated(tenant.id);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountMenu product={PRODUCT} accountHref={`${links.home}/account`} signInHref={links.signIn} />
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-6 px-4 py-14 sm:py-20">
        <div className="grid gap-2">
          <h1 className="brand-heading text-3xl sm:text-4xl">{firstName ? `Welcome, ${firstName}.` : "Welcome to Planner."}</h1>
          <p className="text-muted-foreground">
            Create a workspace for your week. Add tasks with estimates and due dates, and Planner fits them around your meetings, with a reason for every block.
          </p>
        </div>
        {invitations.length ? (
          <Card>
            <CardContent className="grid gap-3">
              <p className="text-sm font-semibold">You&apos;ve been invited</p>
              {invitations.map((invitation) => (
                <div key={invitation.invitationId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{invitation.workspaceName}</p>
                    <p className="truncate text-xs text-muted-foreground">{invitation.roleLabel}{invitation.invitedByName ? ` · from ${invitation.invitedByName}` : ""}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void acceptPendingInvitation(PRODUCT, invitation)
                      .then(() => onCreated(invitation.tenantId))
                      .catch((caught: unknown) => toast({ title: "Couldn't join", description: readableAuthError(caught), variant: "destructive" }))}
                  >
                    Join
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent>
            <form className="grid gap-3" onSubmit={create}>
              <Label htmlFor="planner-workspace-name">Workspace name</Label>
              <Input id="planner-workspace-name" placeholder="e.g. Product team" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoFocus />
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
              <Button type="submit" size="lg" disabled={saving || name.trim().length < 2}>
                {saving ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace
              </Button>
              <p className="text-xs text-muted-foreground">You&apos;ll be the owner and can invite your team next.</p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="hidden w-60 shrink-0 border-r border-border bg-sidebar p-4 lg:grid lg:content-start lg:gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-7 w-full" />)}
      </div>
      <div className="grid flex-1 content-start gap-4 p-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    </div>
  );
}
