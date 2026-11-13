"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  GraduationCap,
  Hash,
  Home,
  KeyRound,
  Lock,
  Megaphone,
  Menu,
  PenSquare,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { CommunityMark } from "@/brands/community/mark";
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
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

import type { WorkspaceSpace } from "./api";

export const COMMUNITY_HOME = "/apps/community";

export type CommunityView = "feed" | "space" | "events" | "members" | "courses" | "plans" | "inbox" | "moderation" | "people" | "settings";

export const COMMUNITY_VIEWS: CommunityView[] = ["feed", "space", "events", "members", "courses", "plans", "inbox", "moderation", "people", "settings"];

type NavItem = { view: CommunityView; label: string; icon: LucideIcon; badge?: number };

export const spaceIcon = { discussion: Hash, announcements: Megaphone, events: CalendarDays } as const;

function SideButton({ active, icon: Icon, label, badge, trailing, onClick }: { active: boolean; icon: LucideIcon; label: string; badge?: number; trailing?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-card font-semibold text-foreground shadow-xs ring-1 ring-border" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {badge ? <span className="rounded-full bg-brand-accent px-1.5 text-[11px] font-semibold text-brand-accent-foreground tabular-nums">{badge}</span> : null}
    </button>
  );
}

export type ShellNav = {
  view: CommunityView;
  spaceId: string | null;
  onNavigate: (view: CommunityView, spaceId?: string | null) => void;
};

/**
 * The signed-in Community frame: the community switcher, its navigation and spaces on the left,
 * search, a new-post button, appearance and the account menu on top.
 */
export function CommunityShell({
  tenantId,
  spaces,
  nav,
  counts,
  access,
  onSwitchCommunity,
  onSearch,
  onNewPost,
  children,
}: {
  tenantId: string | null;
  spaces: WorkspaceSpace[];
  nav: ShellNav;
  counts: { unread: number; moderation: number; members: number };
  access: { moderate: boolean; manage: boolean; hasCourses: boolean; hasPlans: boolean; canPost: boolean };
  onSwitchCommunity: (tenantId: string) => void;
  onSearch: (query: string) => void;
  onNewPost: () => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const main: NavItem[] = [
    { view: "feed", label: "Home", icon: Home },
    { view: "events", label: "Events", icon: CalendarDays },
    { view: "members", label: "Members", icon: Users },
    ...(access.hasCourses || access.manage ? [{ view: "courses" as const, label: "Courses", icon: GraduationCap }] : []),
    ...(access.hasPlans || access.manage ? [{ view: "plans" as const, label: "Membership", icon: KeyRound }] : []),
    { view: "inbox", label: "Inbox", icon: Bell, badge: counts.unread },
  ];
  const manage: NavItem[] = [
    ...(access.moderate ? [{ view: "moderation" as const, label: "Moderation", icon: ShieldCheck, badge: counts.moderation }] : []),
    ...(access.manage ? [{ view: "people" as const, label: "People & invites", icon: UsersRound }] : []),
    ...(access.manage ? [{ view: "settings" as const, label: "Settings", icon: Settings2 }] : []),
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(query.trim());
  }

  const isActive = (item: NavItem) => nav.view === item.view;

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Wordmark name="Community" mark={<CommunityMark />} href={COMMUNITY_HOME} size="sm" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-5">
          {tenantId ? (
            <WorkspaceSwitcher product="community" currentTenantId={tenantId} onSwitch={onSwitchCommunity} workspaceNoun="community" className="h-11 w-full max-w-none rounded-2xl bg-card font-semibold" />
          ) : null}
          {tenantId ? (
            <nav aria-label="Community" className="grid gap-0.5">
              {main.map((item) => (
                <SideButton key={item.view} active={isActive(item)} icon={item.icon} label={item.label} badge={item.badge} onClick={() => nav.onNavigate(item.view)} />
              ))}
            </nav>
          ) : null}
          {tenantId && spaces.length ? (
            <nav aria-label="Spaces" className="grid gap-0.5">
              <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">Spaces</p>
              {spaces.map((space) => {
                const Icon = spaceIcon[space.kind];
                return (
                  <SideButton
                    key={space.id}
                    active={nav.view === "space" && nav.spaceId === space.id}
                    icon={Icon}
                    label={space.name}
                    trailing={space.visibility === "private" ? <Lock className="size-3 text-muted-foreground" aria-label="Private" /> : null}
                    onClick={() => nav.onNavigate("space", space.id)}
                  />
                );
              })}
            </nav>
          ) : null}
          {manage.length ? (
            <nav aria-label="Manage" className="mt-auto grid gap-0.5">
              <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">Manage</p>
              {manage.map((item) => (
                <SideButton key={item.view} active={isActive(item)} icon={item.icon} label={item.label} badge={item.badge} onClick={() => nav.onNavigate(item.view)} />
              ))}
            </nav>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" className="lg:hidden" aria-label="Open navigation"><Menu /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
              {main.map((item) => (
                <DropdownMenuItem key={item.view} onSelect={() => nav.onNavigate(item.view)} className={cn(isActive(item) && "font-semibold text-primary")}>
                  <item.icon /> {item.label}
                  {item.badge ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{item.badge}</span> : null}
                </DropdownMenuItem>
              ))}
              {spaces.length ? <DropdownMenuSeparator /> : null}
              {spaces.length ? <DropdownMenuLabel>Spaces</DropdownMenuLabel> : null}
              {spaces.map((space) => {
                const Icon = spaceIcon[space.kind];
                return (
                  <DropdownMenuItem key={space.id} onSelect={() => nav.onNavigate("space", space.id)}>
                    <Icon /> {space.name}
                  </DropdownMenuItem>
                );
              })}
              {manage.length ? <DropdownMenuSeparator /> : null}
              {manage.map((item) => (
                <DropdownMenuItem key={item.view} onSelect={() => nav.onNavigate(item.view)}>
                  <item.icon /> {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Wordmark name="Community" mark={<CommunityMark />} href={COMMUNITY_HOME} size="sm" className="lg:hidden max-sm:[&>span]:hidden" />
          {tenantId ? (
            <form role="search" onSubmit={submit} className="relative ml-2 hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                aria-label="Search posts"
                placeholder="Search posts"
                value={query}
                maxLength={120}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (!event.target.value.trim()) onSearch("");
                }}
                className="h-10 rounded-full bg-card pl-10"
              />
            </form>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            {tenantId && access.canPost ? (
              <Button size="lg" className="rounded-full px-4" onClick={onNewPost}>
                <PenSquare aria-hidden="true" /> <span className="hidden sm:inline">New post</span>
              </Button>
            ) : null}
            <ThemeToggle />
            <AccountMenu
              product="community"
              accountHref={`${COMMUNITY_HOME}/account`}
              teamHref={tenantId ? `${COMMUNITY_HOME}?view=${access.manage ? "people" : "members"}` : undefined}
              signInHref={`${COMMUNITY_HOME}/sign-in`}
              currentTenantId={tenantId}
              onSwitchWorkspace={onSwitchCommunity}
              workspaceNoun="community"
            />
          </div>
        </header>
        {tenantId ? (
          <div className="border-b border-border px-3 py-2 lg:hidden">
            <WorkspaceSwitcher product="community" currentTenantId={tenantId} onSwitch={onSwitchCommunity} workspaceNoun="community" className="w-full max-w-none rounded-xl" />
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

/** A page title row for Community views. */
export function ViewHeader({ icon: Icon, title, description, actions }: { icon?: LucideIcon; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <h1 className="brand-heading flex items-center gap-2.5 text-3xl leading-tight">
          {Icon ? <Icon className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          {title}
        </h1>
        {description ? <p className="mt-1.5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** The frame around the account page. */
export function CommunityAccountFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
        <Wordmark name="Community" mark={<CommunityMark />} href={COMMUNITY_HOME} size="sm" />
        <Button variant="ghost" size="sm" asChild className="ml-2 hidden text-muted-foreground sm:inline-flex">
          <Link href={COMMUNITY_HOME}><ArrowLeft aria-hidden="true" /> Back to your community</Link>
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <AccountMenu product="community" accountHref={`${COMMUNITY_HOME}/account`} signInHref={`${COMMUNITY_HOME}/sign-in`} />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}
