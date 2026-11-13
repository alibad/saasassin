"use client";

import type { ReactNode } from "react";
import { Download, FolderClosed, FolderOpen, History, Plus, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { useAccount } from "@/components/account/client";
import { WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { ResearchMark } from "@/brands/research/mark";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export type ResearchView = "projects" | "project" | "consent" | "activity" | "team" | "export";

type NavItem = { view: ResearchView; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { view: "projects", label: "Projects", icon: FolderOpen },
  { view: "consent", label: "Consent & retention", icon: ShieldCheck },
  { view: "activity", label: "Activity", icon: History },
  { view: "team", label: "Team", icon: Users },
  { view: "export", label: "Data export", icon: Download },
];

export const RESEARCH_HREF = "/apps/research";
export const RESEARCH_ACCOUNT_HREF = "/apps/research/account";
export const RESEARCH_SIGN_IN_HREF = "/apps/research/sign-in";

type ShellProps = {
  tenantId: string | null;
  view: ResearchView;
  projects?: Array<{ id: string; name: string; interviews?: number }>;
  activeProjectId?: string | null;
  canCreateProject?: boolean;
  onNavigate: (view: ResearchView) => void;
  onOpenProject: (projectId: string) => void;
  onNewProject?: () => void;
  onSwitchWorkspace: (tenantId: string) => void;
  children: ReactNode;
};

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ResearchMark size={26} />
      <span className="font-heading text-[1.3rem] leading-none font-medium tracking-[-0.015em]">Research</span>
    </span>
  );
}

/** Research's signed-in frame: a calm reading-room sidebar on desktop, a compact bar on phones. */
export function WorkspaceShell({
  tenantId,
  view,
  projects = [],
  activeProjectId = null,
  canCreateProject = false,
  onNavigate,
  onOpenProject,
  onNewProject,
  onSwitchWorkspace,
  children,
}: ShellProps) {
  const { data } = useAccount("research");
  const profile = data?.profile;
  const teamHref = tenantId ? `${RESEARCH_HREF}?workspace=${encodeURIComponent(tenantId)}&view=team` : undefined;
  const isActive = (item: NavItem) => item.view === view || (item.view === "projects" && view === "project");

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center px-5">
          <a href={RESEARCH_HREF} aria-label="Research home" className="rounded-md">
            <Wordmark />
          </a>
        </div>
        <div className="px-3">
          <WorkspaceSwitcher product="research" currentTenantId={tenantId} onSwitch={onSwitchWorkspace} className="w-full max-w-none bg-background" />
        </div>
        <nav aria-label="Workspace" className="mt-5 grid gap-0.5 px-3">
          {NAV.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              aria-current={isActive(item) ? "page" : undefined}
              disabled={!tenantId}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors disabled:opacity-50",
                isActive(item)
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className={cn("size-4", isActive(item) ? "text-sidebar-primary" : "")} aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </nav>
        {tenantId ? (
          <div className="mt-7 flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Projects</span>
              {canCreateProject && onNewProject ? (
                <Button variant="ghost" size="icon-xs" onClick={onNewProject} aria-label="New project" className="text-muted-foreground">
                  <Plus />
                </Button>
              ) : null}
            </div>
            <ul className="grid min-h-0 content-start gap-0.5 overflow-y-auto px-3 pb-4">
              {projects.length === 0 ? <li className="px-2.5 py-1.5 text-sm text-muted-foreground">No projects yet</li> : null}
              {projects.map((project) => {
                const active = view === "project" && project.id === activeProjectId;
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors",
                        active ? "bg-background font-medium shadow-xs ring-1 ring-sidebar-border" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60",
                      )}
                    >
                      <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {project.interviews ? <span className="text-xs tabular-nums text-muted-foreground">{project.interviews}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : <div className="flex-1" />}
        <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
          <AccountMenu
            product="research"
            accountHref={RESEARCH_ACCOUNT_HREF}
            teamHref={teamHref}
            signInHref={RESEARCH_SIGN_IN_HREF}
            currentTenantId={tenantId}
            onSwitchWorkspace={onSwitchWorkspace}
            align="start"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{profile?.name || "Your account"}</span>
            <span className="block truncate text-xs text-muted-foreground">{profile?.email ?? ""}</span>
          </span>
          <ThemeToggle />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-2 px-4">
            <a href={RESEARCH_HREF} aria-label="Research home" className="shrink-0 rounded-md">
              <ResearchMark size={26} />
            </a>
            <WorkspaceSwitcher product="research" currentTenantId={tenantId} onSwitch={onSwitchWorkspace} className="mr-auto h-8 min-w-0 max-w-60 justify-between" />
            <ThemeToggle />
            <AccountMenu
              product="research"
              accountHref={RESEARCH_ACCOUNT_HREF}
              teamHref={teamHref}
              signInHref={RESEARCH_SIGN_IN_HREF}
              currentTenantId={tenantId}
              onSwitchWorkspace={onSwitchWorkspace}
            />
          </div>
          {tenantId ? (
            <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
              {NAV.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onNavigate(item.view)}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors",
                    isActive(item) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </nav>
          ) : null}
        </header>
        <main className="mx-auto w-full max-w-[1240px] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">{children}</main>
      </div>
    </div>
  );
}

/** The editorial page header every workspace page opens with. */
export function PageHeader({
  title,
  description,
  actions,
  kicker,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  kicker?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {kicker ? <div className="mb-2 text-sm text-muted-foreground">{kicker}</div> : null}
        <h1 className="brand-heading text-[2rem] leading-tight break-words sm:text-[2.35rem]">{title}</h1>
        {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A quiet card for empty states that invite the next step. */
export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-3 rounded-lg border border-dashed border-border bg-card/60 px-6 py-12 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-full bg-brand-accent/35 text-primary dark:bg-brand-accent/15">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="brand-heading text-xl">{title}</h2>
      {children ? <div className="max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  );
}
