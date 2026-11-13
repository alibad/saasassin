"use client";

import type { ReactNode } from "react";
import { Download, FlaskConical, History, Users, Webhook, type LucideIcon } from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { StudiesMark } from "@/brands/studies/mark";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export type StudiesView = "studies" | "study" | "activity" | "team" | "integrations" | "export";

type NavItem = { view: StudiesView; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { view: "studies", label: "Studies", icon: FlaskConical },
  { view: "activity", label: "Activity", icon: History },
  { view: "team", label: "Team", icon: Users },
  { view: "integrations", label: "Integrations", icon: Webhook },
  { view: "export", label: "Export", icon: Download },
];

export const STUDIES_HREF = "/apps/studies";
export const STUDIES_ACCOUNT_HREF = "/apps/studies/account";
export const STUDIES_SIGN_IN_HREF = "/apps/studies/sign-in";

export function StudiesWordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <StudiesMark size={size} />
      <span className="font-heading text-[1.15rem] leading-none font-semibold tracking-[-0.03em]">Studies</span>
    </span>
  );
}

/** Studies' signed-in frame: one bright top bar with the workspace, the sections and you. */
export function WorkspaceShell({
  tenantId,
  view,
  onNavigate,
  onSwitchWorkspace,
  children,
}: {
  tenantId: string | null;
  view: StudiesView;
  onNavigate: (view: StudiesView) => void;
  onSwitchWorkspace: (tenantId: string) => void;
  children: ReactNode;
}) {
  const teamHref = tenantId ? `${STUDIES_HREF}?workspace=${encodeURIComponent(tenantId)}&view=team` : undefined;
  const isActive = (item: NavItem) => item.view === view || (item.view === "studies" && view === "study");

  const nav = (className: string, pill: string, active: string, idle: string) => (
    <nav aria-label="Workspace" className={className}>
      {NAV.map((item) => (
        <button
          key={item.view}
          type="button"
          disabled={!tenantId}
          onClick={() => onNavigate(item.view)}
          aria-current={isActive(item) ? "page" : undefined}
          className={cn(pill, isActive(item) ? active : idle)}
        >
          <item.icon className="size-4" aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-brand-subtle text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <a href={STUDIES_HREF} aria-label="Studies home" className="shrink-0 rounded-md">
            <StudiesWordmark className="max-sm:[&>span:last-child]:hidden" />
          </a>
          <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
          <WorkspaceSwitcher product="studies" currentTenantId={tenantId} onSwitch={onSwitchWorkspace} className="h-9 min-w-0 max-w-56 rounded-full" />
          {nav(
            "ml-3 hidden items-center gap-1 lg:flex",
            "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
            "bg-secondary text-secondary-foreground",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          <span className="flex-1" />
          <ThemeToggle />
          <AccountMenu
            product="studies"
            accountHref={STUDIES_ACCOUNT_HREF}
            teamHref={teamHref}
            signInHref={STUDIES_SIGN_IN_HREF}
            currentTenantId={tenantId}
            onSwitchWorkspace={onSwitchWorkspace}
          />
        </div>
        {tenantId
          ? nav(
            "flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:hidden",
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition-colors [&>svg]:size-3.5",
            "bg-primary text-primary-foreground",
            "text-muted-foreground hover:bg-muted",
          )
          : null}
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}

export function PageHeader({ title, description, actions, kicker, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; kicker?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {kicker ? <div className="mb-2 text-sm text-muted-foreground">{kicker}</div> : null}
        <h1 className="brand-heading text-[1.9rem] leading-tight break-words sm:text-[2.2rem]">{title}</h1>
        {description ? <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center", className)}>
      <span className="relative grid size-12 place-items-center rounded-2xl bg-secondary text-primary">
        <Icon className="size-5" aria-hidden="true" />
        <span className="absolute -top-1 -right-1 size-3 rounded-full bg-brand-accent ring-2 ring-card" aria-hidden="true" />
      </span>
      <h2 className="brand-heading text-xl">{title}</h2>
      {children ? <div className="max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  );
}
