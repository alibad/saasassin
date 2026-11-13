"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Building2,
  GraduationCap,
  Handshake,
  Home,
  LineChart,
  LoaderCircle,
  MailPlus,
  Menu,
  Phone,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "@/components/account/client";
import { acceptPendingInvitation, WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { TeamPanel } from "@/components/account/team-panel";
import { readableAuthError } from "@/components/account/auth-errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RevenueMark } from "@/brands/revenue/mark";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { canCoach, canWrite } from "@/lib/revenue/schemas";
import { cn } from "@/lib/utils";

import { CallDetailView } from "./call-detail";
import { AccountsView } from "./accounts-view";
import { CallsView } from "./calls-view";
import { api, type Workspace } from "./client";
import { CoachingView } from "./coaching-view";
import { DealView } from "./deal-view";
import { DealsView } from "./deals-view";
import { ForecastPanel } from "./forecast-panel";
import { HomeView } from "./home-view";
import { InsightsView } from "./insights-view";
import { LogCallForm } from "./log-call-form";
import { PeopleProvider } from "./people";
import { navSection, useRevenueRoute, type Navigate, type Route, type View } from "./routing";
import { SettingsView } from "./settings-view";
import { EmptyState, PageHeader, Panel } from "./ui";

const PRODUCT = "revenue";
const APP_HREF = "/apps/revenue";
const TENANT_KEY = "saasassin-revenue-tenant";

function readStoredTenant() {
  try {
    return window.localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

function storeTenant(id: string) {
  try {
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* storage unavailable: the selection just isn't remembered */
  }
}

type NavItem = { view: View; label: string; icon: typeof Home; badge?: number | null };

/** Revenue, signed in: the workspace shell (navy sidebar, top bar) around every screen. */
export function RevenueWorkspace({ userEmail, userName }: { userEmail: string; userName: string }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <RevenueApp userEmail={userEmail} userName={userName} />
    </Suspense>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="hidden bg-sidebar lg:block" />
      <div className="grid content-start gap-4 p-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-24" />)}</div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

function RevenueApp({ userEmail, userName }: { userEmail: string; userName: string }) {
  const { route, navigate, params } = useRevenueRoute();
  const account = useAccount(PRODUCT);
  const workspaces = useMemo(() => account.data?.workspaces ?? [], [account.data]);
  const [chosen, setChosen] = useState<string | null>(null);
  const requested = params.get("workspace");
  const [handledRequest, setHandledRequest] = useState<string | null>(null);

  // After accepting an invitation the app opens with ?workspace=<tenantId>: select it once.
  if (requested && requested !== handledRequest) {
    setHandledRequest(requested);
    setChosen(requested);
  }
  useEffect(() => {
    if (!requested) return;
    storeTenant(requested);
    const next = new URLSearchParams(params.toString());
    next.delete("workspace");
    const query = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    void refreshAccount(PRODUCT);
  }, [requested, params]);

  const tenantId = useMemo(() => {
    if (!workspaces.length) return null;
    const preferred = chosen ?? (typeof window === "undefined" ? null : readStoredTenant());
    return workspaces.find((workspace) => workspace.id === preferred)?.id ?? workspaces[0].id;
  }, [workspaces, chosen]);

  const selectTenant = useCallback(
    (id: string) => {
      storeTenant(id);
      setChosen(id);
      navigate({ view: "home" });
    },
    [navigate],
  );

  if (account.error && !account.data) {
    return (
      <CenteredPage>
        <Alert variant="destructive">
          <AlertTitle>We couldn&apos;t load your workspaces</AlertTitle>
          <AlertDescription className="grid gap-2">
            {account.error}
            <Button variant="outline" className="w-fit" onClick={() => void account.refresh()}>Try again</Button>
          </AlertDescription>
        </Alert>
      </CenteredPage>
    );
  }
  if (account.loading && !account.data) return <ShellSkeleton />;
  if (!tenantId) {
    return <Onboarding userName={account.data?.profile.name || userName || userEmail} onReady={selectTenant} />;
  }
  return <TenantShell key={tenantId} tenantId={tenantId} route={route} navigate={navigate} onSwitch={selectTenant} fallbackName={userName || userEmail} />;
}

function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10 text-foreground">
      <div className="grid w-full max-w-lg gap-6">{children}</div>
    </main>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <RevenueMark size={28} />
      <span className="brand-heading text-lg">Revenue</span>
    </span>
  );
}

function Onboarding({ userName, onReady }: { userName: string; onReady: (tenantId: string) => void }) {
  const { data } = useAccount(PRODUCT);
  const invitations = data?.pendingInvitations ?? [];
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setPending("create");
    setError(null);
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase(PRODUCT)}/tenants`, { method: "POST", json: { name: name.trim() } });
      await refreshAccount(PRODUCT);
      onReady(tenant.id);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <CenteredPage>
      <div className="flex items-center justify-between">
        <Wordmark />
        <AccountMenu product={PRODUCT} accountHref={`${APP_HREF}/account`} signInHref={`${APP_HREF}/sign-in`} />
      </div>
      <Panel className="grid gap-5 p-6 sm:p-8">
        <div className="grid gap-2">
          <h1 className="brand-heading text-2xl">Welcome{userName ? `, ${userName.split(" ")[0]}` : ""}. Let&apos;s set up your sales team.</h1>
          <p className="text-sm text-muted-foreground">
            A workspace holds your accounts, deals and call transcripts. Your teammates join it by invitation, and nothing in it is shared with any other workspace.
          </p>
        </div>
        {invitations.length ? (
          <div className="grid gap-2">
            <p className="text-sm font-medium">You&apos;ve been invited</p>
            {invitations.map((invitation) => (
              <div key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-brand-subtle p-3">
                <div className="grid">
                  <span className="text-sm font-semibold">{invitation.workspaceName}</span>
                  <span className="text-xs text-muted-foreground">
                    {invitation.roleLabel}{invitation.invitedByName ? ` · invited by ${invitation.invitedByName}` : ""}
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={pending !== null}
                  onClick={async () => {
                    setPending(invitation.invitationId);
                    setError(null);
                    try {
                      await acceptPendingInvitation(PRODUCT, invitation);
                      onReady(invitation.tenantId);
                    } catch (caught) {
                      setError(readableAuthError(caught));
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  {pending === invitation.invitationId ? <LoaderCircle className="animate-spin" /> : <MailPlus />} Join
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <form className="grid gap-3" onSubmit={create}>
          <Label htmlFor="ws-name">{invitations.length ? "Or create your own workspace" : "Name your team's workspace"}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="ws-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Sales" maxLength={80} className="sm:flex-1" />
            <Button type="submit" disabled={pending !== null || name.trim().length < 2}>
              {pending === "create" ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </form>
        <ol className="grid gap-2 border-t border-border pt-5 text-sm text-muted-foreground sm:grid-cols-3">
          {["Add your accounts and open deals", "Log calls from transcripts, with consent", "Coach from talk ratio, next steps and risks"].map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-accent text-[0.7rem] font-semibold text-brand-accent-foreground">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </Panel>
    </CenteredPage>
  );
}

function TenantShell({
  tenantId,
  route,
  navigate,
  onSwitch,
  fallbackName,
}: {
  tenantId: string;
  route: Route;
  navigate: Navigate;
  onSwitch: (id: string) => void;
  fallbackName: string;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Workspace>(`/api/revenue/tenants/${tenantId}/workspace`)
      .then((result) => {
        if (!cancelled) {
          setWorkspace(result);
          setError(null);
        }
      })
      .catch((err: Error & { status?: number }) => !cancelled && setError({ message: err.message, status: err.status }));
    return () => {
      cancelled = true;
    };
  }, [tenantId, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const section = navSection(route);
  const myOpenAssignments = workspace
    ? workspace.assignments.filter((entry) => entry.status === "assigned" && entry.assigneeEmail.toLowerCase() === workspace.user.email.toLowerCase()).length
    : 0;

  const nav: Array<{ label?: string; items: NavItem[] }> = [
    {
      items: [
        { view: "home", label: "Home", icon: Home },
        { view: "deals", label: "Deals", icon: Handshake },
        { view: "calls", label: "Calls", icon: Phone },
        { view: "accounts", label: "Accounts", icon: Building2 },
        { view: "forecast", label: "Forecast", icon: LineChart },
      ],
    },
    {
      label: "Improve",
      items: [
        { view: "coaching", label: "Coaching", icon: GraduationCap, badge: myOpenAssignments || null },
        { view: "insights", label: "Insights", icon: BarChart3 },
      ],
    },
    {
      label: "Workspace",
      items: [
        { view: "team", label: "Team", icon: Users },
        { view: "settings", label: "Settings", icon: Settings },
      ],
    },
  ];

  const go = (view: View) => navigate(view === "settings" ? { view: "settings" } : view === "log" ? { view: "log" } : view === "calls" ? { view: "calls" } : ({ view } as Route));
  const writer = workspace ? canWrite(workspace.role) : false;

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Desktop sidebar: navy in light mode, deeper navy in dark. Its subtree uses the brand's dark tokens. */}
      <aside className="sticky top-0 hidden h-dvh border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <div className="dark flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
          <a href={APP_HREF} className="px-2 text-sidebar-accent-foreground" aria-label="Revenue home" onClick={(event) => { event.preventDefault(); go("home"); }}>
            <Wordmark />
          </a>
          <WorkspaceSwitcher
            product={PRODUCT}
            currentTenantId={tenantId}
            onSwitch={onSwitch}
            className="w-full max-w-none border-sidebar-border bg-sidebar-accent/60 text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          />
          {writer ? (
            <Button className="w-full justify-center bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90" onClick={() => navigate({ view: "log" })}>
              <Plus /> Log a call
            </Button>
          ) : null}
          <nav className="grid gap-4" aria-label="Revenue">
            {nav.map((group, index) => (
              <div key={group.label ?? index} className="grid gap-0.5">
                {group.label ? <p className="px-2.5 pb-1 text-[0.7rem] font-medium tracking-wide text-sidebar-foreground/55 uppercase">{group.label}</p> : null}
                {group.items.map((item) => {
                  const active = section === item.view;
                  return (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => go(item.view)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4", active ? "text-sidebar-primary" : "text-sidebar-foreground/60")} aria-hidden="true" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge ? (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-primary px-1.5 text-[0.7rem] font-semibold tabular-nums text-sidebar-primary-foreground">{item.badge}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 border-t border-sidebar-border pt-3">
            <p className="px-2.5 text-xs text-sidebar-foreground/55">Your calls stay in this workspace. Transcripts only, never audio.</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar
          tenantId={tenantId}
          onSwitch={onSwitch}
          navigate={navigate}
          nav={nav}
          section={section}
          onGo={go}
          canLog={writer}
          initialQuery={route.view === "calls" ? route.q ?? "" : ""}
        />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{error.status === 403 ? "You don't have access to this workspace" : error.status === 404 ? "Workspace not found" : "We couldn't load this workspace"}</AlertTitle>
              <AlertDescription className="grid gap-2">
                {error.message}
                <Button variant="outline" className="w-fit" onClick={reload}>Try again</Button>
              </AlertDescription>
            </Alert>
          ) : !workspace ? (
            <div className="grid gap-4">
              <Skeleton className="h-9 w-72" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-28" />)}</div>
              <Skeleton className="h-96" />
            </div>
          ) : (
            <PeopleProvider workspace={workspace}>
              <Screen workspace={workspace} route={route} navigate={navigate} reload={reload} version={version} fallbackName={fallbackName} />
            </PeopleProvider>
          )}
        </main>
      </div>
    </div>
  );
}

function TopBar({
  tenantId,
  onSwitch,
  navigate,
  nav,
  section,
  onGo,
  canLog,
  initialQuery,
}: {
  tenantId: string;
  onSwitch: (id: string) => void;
  navigate: Navigate;
  nav: Array<{ label?: string; items: NavItem[] }>;
  section: View;
  onGo: (view: View) => void;
  canLog: boolean;
  initialQuery: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-2 px-3 sm:px-6 lg:px-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open navigation">
              <Menu />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            {nav.map((group, index) => (
              <div key={group.label ?? index}>
                {index ? <DropdownMenuSeparator /> : null}
                {group.label ? <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel> : null}
                {group.items.map((item) => (
                  <DropdownMenuItem key={item.view} onSelect={() => onGo(item.view)} className={cn(section === item.view && "bg-muted font-medium")}>
                    <item.icon /> <span className="flex-1">{item.label}</span>
                    {item.badge ? <Badge className="h-5 min-w-5 px-1.5 tabular-nums">{item.badge}</Badge> : null}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <a href={APP_HREF} className="lg:hidden" aria-label="Revenue home" onClick={(event) => { event.preventDefault(); onGo("home"); }}>
          <Wordmark className="[&_span]:text-base" />
        </a>
        <TopSearch key={initialQuery} initialQuery={initialQuery} navigate={navigate} />
        <div className="ml-auto flex items-center gap-1">
          {canLog ? (
            <Button size="sm" className="hidden sm:inline-flex lg:hidden" onClick={() => navigate({ view: "log" })}>
              <Plus /> Log call
            </Button>
          ) : null}
          <div className="hidden sm:block lg:hidden">
            <WorkspaceSwitcher product={PRODUCT} currentTenantId={tenantId} onSwitch={onSwitch} className="h-8 max-w-44" />
          </div>
          <ThemeToggle />
          <AccountMenu
            product={PRODUCT}
            accountHref={`${APP_HREF}/account`}
            teamHref={`${APP_HREF}?view=team`}
            signInHref={`${APP_HREF}/sign-in`}
            currentTenantId={tenantId}
            onSwitchWorkspace={onSwitch}
          />
        </div>
      </div>
    </header>
  );
}

function TopSearch({ initialQuery, navigate }: { initialQuery: string; navigate: Navigate }) {
  const [query, setQuery] = useState(initialQuery);
  return (
    <form
      className="relative hidden max-w-md flex-1 md:block"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (query.trim().length >= 2) navigate({ view: "calls", q: query.trim() });
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        aria-label="Search every call transcript"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search what customers said…"
        className="h-9 bg-card pl-8"
        maxLength={120}
      />
    </form>
  );
}

function Screen({
  workspace,
  route,
  navigate,
  reload,
  version,
  fallbackName,
}: {
  workspace: Workspace;
  route: Route;
  navigate: Navigate;
  reload: () => void;
  version: number;
  fallbackName: string;
}) {
  const openCall = (id: string, at?: number | null) => navigate({ view: "call", call: id, at: at ?? null });
  const openDeal = (id: string) => navigate({ view: "deal", deal: id });

  switch (route.view) {
    case "home":
      return <HomeView workspace={workspace} navigate={navigate} fallbackName={fallbackName} />;
    case "deals":
      return <DealsView workspace={workspace} onChanged={reload} onOpenDeal={openDeal} />;
    case "deal": {
      const deal = workspace.deals.find((entry) => entry.id === route.deal);
      if (!deal) {
        return (
          <EmptyState icon={Handshake} title="This deal isn't in the workspace" action={<Button variant="outline" onClick={() => navigate({ view: "deals" })}>Back to deals</Button>}>
            It may have been removed, or the link points to another workspace.
          </EmptyState>
        );
      }
      return (
        <DealView
          key={deal.id}
          workspace={workspace}
          deal={deal}
          version={version}
          onChanged={reload}
          onOpenCall={openCall}
          onBack={() => navigate({ view: "deals" })}
          onLogCall={(dealId) => navigate({ view: "log", deal: dealId })}
        />
      );
    }
    case "calls":
      return <CallsView key={route.q ?? ""} workspace={workspace} initialQuery={route.q ?? ""} onOpenCall={openCall} onLogCall={() => navigate({ view: "log" })} />;
    case "call":
      return (
        <CallDetailView
          key={`${route.call}-${route.at ?? ""}`}
          workspace={workspace}
          callId={route.call}
          focusAt={route.at ?? null}
          onBack={() => navigate({ view: "calls" })}
          onOpenDeal={openDeal}
          onChanged={reload}
        />
      );
    case "accounts":
      return <AccountsView workspace={workspace} onChanged={reload} onOpenDeal={openDeal} />;
    case "forecast":
      return <ForecastPanel workspace={workspace} onChanged={reload} onOpenDeal={(deal) => openDeal(deal.id)} />;
    case "coaching":
      return <CoachingView workspace={workspace} onOpenCall={openCall} onChanged={reload} />;
    case "insights":
      return <InsightsView workspace={workspace} onOpenCall={openCall} />;
    case "log":
      return canWrite(workspace.role) ? (
        <div className="grid gap-6">
          <PageHeader title="Log a call" description="Paste or upload the transcript your meeting tool exported. Revenue analyses it in seconds; audio is never needed." />
          <LogCallForm
            key={route.deal ?? "none"}
            workspace={workspace}
            defaultDealId={route.deal}
            onLogged={(callId) => {
              reload();
              navigate({ view: "call", call: callId });
            }}
            onAddDeal={() => navigate({ view: "deals" })}
          />
        </div>
      ) : (
        <EmptyState icon={Phone} title="Viewers can't log calls">Ask a workspace admin to change your role if you need to add calls.</EmptyState>
      );
    case "team":
      return (
        <div className="grid gap-6">
          <PageHeader
            title="Team"
            description={canCoach(workspace.role) ? "Invite reps and managers, set what each person can do, and see who's waiting to join." : "The people in this workspace and what each of them can do."}
          />
          <TeamPanel
            product={PRODUCT}
            productName="Revenue"
            tenantId={workspace.tenant.id}
            onLeft={() => {
              void refreshAccount(PRODUCT);
              navigate({ view: "home" });
            }}
          />
        </div>
      );
    case "settings":
      return <SettingsView workspace={workspace} tab={route.tab} onTab={(tab) => navigate({ view: "settings", tab }, { replace: true })} onChanged={reload} onOpenCall={openCall} />;
    default:
      return null;
  }
}
