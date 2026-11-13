"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ExternalLink,
  FileUp,
  GraduationCap,
  History,
  LayoutDashboard,
  Library,
  Mail,
  Menu,
  MessagesSquare,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { CreatorMark } from "@/brands/creator/mark";
import { AccountMenu } from "@/components/account/account-menu";
import { WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { Wordmark } from "@/components/product-site/wordmark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export const CREATOR_HOME = "/apps/creator";

export type CreatorView =
  | "home"
  | "courses"
  | "course"
  | "learners"
  | "analytics"
  | "discussions"
  | "emails"
  | "team"
  | "activity"
  | "import"
  | "settings"
  | "learning";

type NavItem = { view: CreatorView; label: string; icon: LucideIcon };

export const SCHOOL_NAV: NavItem[] = [
  { view: "home", label: "Overview", icon: LayoutDashboard },
  { view: "courses", label: "Courses", icon: BookOpen },
  { view: "learners", label: "Learners", icon: GraduationCap },
  { view: "analytics", label: "Analytics", icon: BarChart3 },
  { view: "discussions", label: "Discussions", icon: MessagesSquare },
  { view: "emails", label: "Email list", icon: Mail },
];

export const MANAGE_NAV: NavItem[] = [
  { view: "team", label: "Team", icon: Users },
  { view: "activity", label: "Activity", icon: History },
  { view: "import", label: "Import from Kajabi", icon: FileUp },
  { view: "settings", label: "Settings", icon: Settings2 },
];

const LEARNING: NavItem = { view: "learning", label: "My learning", icon: Library };

export function viewLabel(view: CreatorView) {
  if (view === "course") return "Courses";
  return [...SCHOOL_NAV, ...MANAGE_NAV, LEARNING].find((item) => item.view === view)?.label ?? "Overview";
}

function NavButton({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (view: CreatorView) => void }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.view)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-muted-foreground")} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function MobileNav({ view, hasSchool, onNavigate }: { view: CreatorView; hasSchool: boolean; onNavigate: (view: CreatorView) => void }) {
  const items = hasSchool ? [...SCHOOL_NAV, ...MANAGE_NAV] : [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {hasSchool ? <DropdownMenuLabel>Your school</DropdownMenuLabel> : null}
        {items.map((item) => (
          <DropdownMenuItem key={item.view} onSelect={() => onNavigate(item.view)} className={cn(view === item.view && "font-semibold text-primary")}>
            <item.icon /> {item.label}
          </DropdownMenuItem>
        ))}
        {items.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => onNavigate("learning")} className={cn(view === "learning" && "font-semibold text-primary")}>
          <Library /> My learning
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The signed-in Creator frame: the school sidebar (switcher and navigation), a top bar with the
 * public school link, appearance and the account menu, and the page.
 */
export function CreatorShell({
  tenantId,
  schoolName,
  view,
  onNavigate,
  onSwitchSchool,
  children,
}: {
  tenantId: string | null;
  schoolName: string | null;
  view: CreatorView;
  onNavigate: (view: CreatorView) => void;
  onSwitchSchool: (tenantId: string) => void;
  children: ReactNode;
}) {
  const hasSchool = Boolean(tenantId);
  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Wordmark name="Creator" mark={<CreatorMark />} href={CREATOR_HOME} size="sm" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4">
          {hasSchool ? (
            <div className="grid gap-1.5">
              <p className="px-3 text-xs font-medium text-muted-foreground">School</p>
              <WorkspaceSwitcher
                product="creator"
                currentTenantId={tenantId}
                onSwitch={onSwitchSchool}
                workspaceNoun="school"
                className="h-10 w-full max-w-none rounded-xl bg-card"
              />
            </div>
          ) : null}
          {hasSchool ? (
            <nav aria-label="School" className="grid gap-0.5">
              {SCHOOL_NAV.map((item) => (
                <NavButton key={item.view} item={item} active={view === item.view || (item.view === "courses" && view === "course")} onSelect={onNavigate} />
              ))}
            </nav>
          ) : null}
          {hasSchool ? (
            <nav aria-label="Manage" className="grid gap-0.5">
              <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">Manage</p>
              {MANAGE_NAV.map((item) => (
                <NavButton key={item.view} item={item} active={view === item.view} onSelect={onNavigate} />
              ))}
            </nav>
          ) : null}
          <nav aria-label="Learning" className={cn("grid gap-0.5", hasSchool && "mt-auto")}>
            <NavButton item={LEARNING} active={view === "learning"} onSelect={onNavigate} />
          </nav>
          {tenantId ? (
            <Link
              href={`${CREATOR_HOME}/s/${tenantId}`}
              target="_blank"
              className="group block overflow-hidden rounded-2xl bg-brand-ink p-4 text-brand-ink-foreground ring-1 ring-white/10"
            >
              <p className="brand-heading text-lg leading-tight">Your school&apos;s site</p>
              <p className="mt-1 text-xs opacity-80">See the catalog and course pages exactly as learners do.</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent">
                Open catalog <ExternalLink className="size-3.5" aria-hidden="true" />
              </span>
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-6">
          <MobileNav view={view} hasSchool={hasSchool} onNavigate={onNavigate} />
          <Wordmark name="Creator" mark={<CreatorMark />} href={CREATOR_HOME} size="sm" className="lg:hidden" />
          <p className="hidden min-w-0 truncate text-sm text-muted-foreground lg:block">
            {schoolName ? <span className="font-medium text-foreground">{schoolName}</span> : null}
            {schoolName ? <span className="mx-2 text-border">/</span> : null}
            {viewLabel(view)}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            {tenantId ? (
              <Button variant="outline" size="lg" asChild className="hidden rounded-xl sm:inline-flex">
                <Link href={`${CREATOR_HOME}/s/${tenantId}`} target="_blank">
                  <ExternalLink aria-hidden="true" /> View school
                </Link>
              </Button>
            ) : null}
            <ThemeToggle />
            <AccountMenu
              product="creator"
              accountHref={`${CREATOR_HOME}/account`}
              teamHref={hasSchool ? `${CREATOR_HOME}?view=team` : undefined}
              signInHref={`${CREATOR_HOME}/sign-in`}
              currentTenantId={tenantId}
              onSwitchWorkspace={onSwitchSchool}
              workspaceNoun="school"
            />
          </div>
        </header>
        {hasSchool ? (
          <div className="border-b border-border px-3 py-2 lg:hidden">
            <WorkspaceSwitcher product="creator" currentTenantId={tenantId} onSwitch={onSwitchSchool} workspaceNoun="school" className="w-full max-w-none" />
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}

/** A page title row used by every Creator view. */
export function PageHeader({ title, description, actions, back }: { title: string; description?: ReactNode; actions?: ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <div className="mb-8 grid gap-4">
      {back ? (
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={back.onClick}>
          <ArrowLeft aria-hidden="true" /> {back.label}
        </Button>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="brand-heading text-3xl leading-tight sm:text-4xl">{title}</h1>
          {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** The frame around the account page: the product bar with a way back into the school. */
export function CreatorAccountFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
        <Wordmark name="Creator" mark={<CreatorMark />} href={CREATOR_HOME} size="sm" />
        <Button variant="ghost" size="sm" asChild className="ml-2 hidden text-muted-foreground sm:inline-flex">
          <Link href={CREATOR_HOME}><ArrowLeft aria-hidden="true" /> Back to your school</Link>
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <AccountMenu product="creator" accountHref={`${CREATOR_HOME}/account`} teamHref={`${CREATOR_HOME}?view=team`} signInHref={`${CREATOR_HOME}/sign-in`} />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}
