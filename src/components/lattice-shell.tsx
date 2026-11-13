"use client";

import { useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  Home,
  KeyRound,
  LoaderCircle,
  Menu,
  MessageSquareHeart,
  Plug,
  Plus,
  ScrollText,
  Target,
  Users,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { PerformanceMark } from "@/brands/performance/mark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { hasPermission, type Permission } from "@/lib/lattice/permissions";
import { cn } from "@/lib/utils";

export const PERFORMANCE_VIEWS = [
  "home",
  "reviews",
  "goals",
  "feedback",
  "one-on-ones",
  "people",
  "reports",
  "permissions",
  "audit",
  "integrations",
] as const;

export type PerformanceView = (typeof PERFORMANCE_VIEWS)[number];

export function isPerformanceView(value: string | null | undefined): value is PerformanceView {
  return (PERFORMANCE_VIEWS as readonly string[]).includes(value ?? "");
}

type NavItem = {
  view: PerformanceView;
  label: string;
  icon: LucideIcon;
  visible: (permissions: Permission[]) => boolean;
};

const can = (permissions: Permission[], ...any: Permission[]) => any.some((permission) => hasPermission(permissions, permission));

const NAV: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { view: "home", label: "Home", icon: Home, visible: () => true },
      { view: "reviews", label: "Reviews", icon: ClipboardCheck, visible: (p) => can(p, "reviews.read", "reviews.manage") },
      { view: "goals", label: "Goals", icon: Target, visible: (p) => can(p, "reviews.read") },
      { view: "feedback", label: "Feedback", icon: MessageSquareHeart, visible: (p) => can(p, "reviews.read") },
      { view: "one-on-ones", label: "One-on-ones", icon: CalendarClock, visible: (p) => can(p, "reviews.read") },
      { view: "people", label: "People", icon: Users, visible: (p) => can(p, "directory.read") },
      { view: "reports", label: "Reports", icon: BarChart3, visible: (p) => can(p, "reports.read", "workspace.export") },
    ],
  },
  {
    label: "Admin",
    items: [
      { view: "permissions", label: "Roles & permissions", icon: KeyRound, visible: (p) => can(p, "roles.read") },
      { view: "audit", label: "Audit log", icon: ScrollText, visible: (p) => can(p, "audit.read") },
      { view: "integrations", label: "Integrations", icon: Plug, visible: (p) => can(p, "organization.manage") },
    ],
  },
];

export const VIEW_TITLES: Record<PerformanceView, string> = Object.fromEntries(
  NAV.flatMap((group) => group.items.map((item) => [item.view, item.label])),
) as Record<PerformanceView, string>;

/** The views this set of permissions can open, in navigation order. */
export function visibleViews(permissions: Permission[]) {
  return NAV.flatMap((group) => group.items.filter((item) => item.visible(permissions)).map((item) => item.view));
}

export function viewHref(view: PerformanceView, organizationId?: string | null) {
  const params = new URLSearchParams();
  if (view !== "home") params.set("view", view);
  if (organizationId) params.set("organization", organizationId);
  const query = params.toString();
  return query ? `/lattice?${query}` : "/lattice";
}

type ShellProps = {
  organization: { id: string; name: string } | null;
  memberships: Array<{ organizationId: string; organizationName: string }>;
  /** Permissions that decide which sections appear (the viewed-as role while previewing one). */
  permissions: Permission[];
  /** The person's role in this organization, shown under its name. */
  roleName?: string | null;
  /** The section on screen; null on pages outside the workspace (account settings). */
  view: PerformanceView | null;
  /** Breadcrumb label for pages outside the workspace sections. */
  crumb?: string;
  /** In the workspace, sections switch in place; elsewhere the links navigate. */
  onNavigate?: (view: PerformanceView) => void;
  /** Extra controls for the top bar, left of the account menu (notifications). */
  topBar?: ReactNode;
  /** Shown above the page, below the top bar (e.g. the "viewing as" banner). */
  banner?: ReactNode;
  children: ReactNode;
};

/**
 * The signed-in Performance frame: a sidebar with the organization switcher and sections, a top
 * bar with notifications and the account menu, and the page. On phones the sidebar becomes a
 * sheet behind the menu button.
 */
export function PerformanceShell({
  organization,
  memberships,
  permissions,
  roleName,
  view,
  crumb,
  onNavigate,
  topBar,
  banner,
  children,
}: ShellProps) {
  const current = view && view !== "home" ? VIEW_TITLES[view] : crumb;
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebar = (
    <SidebarContent
      organization={organization}
      memberships={memberships}
      roleName={roleName}
      permissions={permissions}
      view={view}
      onNavigate={(next) => {
        setMobileOpen(false);
        onNavigate?.(next);
      }}
      navigates={Boolean(onNavigate)}
    />
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside className="sticky top-0 hidden h-dvh w-[16.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur supports-backdrop-filter:bg-background/70 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SheetDescription className="sr-only">Sections of Performance and your organizations.</SheetDescription>
              <div className="flex h-full flex-col">{sidebar}</div>
            </SheetContent>
          </Sheet>
          <Link href={viewHref("home", organization?.id)} className="flex items-center gap-2 lg:hidden" aria-label="Performance home">
            <PerformanceMark className="size-6" />
            <span className="brand-heading text-base">Performance</span>
          </Link>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground lg:flex">
            <span className="truncate">{organization?.name ?? "Performance"}</span>
            {current ? (
              <>
                <span aria-hidden="true">/</span>
                <span className="truncate font-medium text-foreground">{current}</span>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {topBar}
            <AccountMenu
              product="performance"
              accountHref="/lattice/account"
              teamHref={can(permissions, "directory.read") ? viewHref("people", organization?.id) : undefined}
              signInHref="/lattice/sign-in"
            />
          </div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-8 sm:pt-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  organization,
  memberships,
  roleName,
  permissions,
  view,
  onNavigate,
  navigates,
}: {
  organization: ShellProps["organization"];
  memberships: ShellProps["memberships"];
  roleName?: string | null;
  permissions: Permission[];
  view: PerformanceView | null;
  onNavigate: (view: PerformanceView) => void;
  navigates: boolean;
}) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 px-5">
        <Link href={viewHref("home", organization?.id)} className="flex items-center gap-2" aria-label="Performance home">
          <PerformanceMark className="size-6" />
          <span className="brand-heading text-[1.05rem]">Performance</span>
        </Link>
      </div>
      <div className="px-3 pb-2">
        <OrganizationSwitcher organization={organization} memberships={memberships} roleName={roleName} />
      </div>
      <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 py-2">
        {organization
          ? NAV.map((group, index) => {
            const items = group.items.filter((item) => item.visible(permissions));
            if (!items.length) return null;
            return (
              <div key={group.label ?? index} className={cn(index > 0 && "mt-5")}>
                {group.label ? <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p> : null}
                <ul className="grid gap-0.5">
                  {items.map((item) => {
                    const active = item.view === view;
                    const Icon = item.icon;
                    return (
                      <li key={item.view}>
                        <Link
                          href={viewHref(item.view, organization.id)}
                          aria-current={active ? "page" : undefined}
                          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                            if (!navigates || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                            event.preventDefault();
                            onNavigate(item.view);
                          }}
                          className={cn(
                            "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active && "bg-sidebar-accent text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className={cn("size-4 text-muted-foreground", active && "text-sidebar-primary")} aria-hidden="true" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
          : null}
      </nav>
      <div className="flex items-center justify-between border-t border-sidebar-border px-3 py-3">
        <ThemeToggle withLabel />
      </div>
    </>
  );
}

function OrganizationTile({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-heading text-sm font-semibold text-primary-foreground", className)}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

function OrganizationSwitcher({
  organization,
  memberships,
  roleName,
}: {
  organization: ShellProps["organization"];
  memberships: ShellProps["memberships"];
  roleName?: string | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/lattice/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: new FormData(event.currentTarget).get("name") }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Could not create the organization.");
      setCreating(false);
      router.push(viewHref("home", body.organizationId));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the organization.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-background/60 px-2 py-1.5 text-left text-sm shadow-xs transition-colors hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <OrganizationTile name={organization?.name ?? "Workspace"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{organization?.name ?? "No organization"}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {roleName ?? (memberships.length > 1 ? `${memberships.length} organizations` : "Organization")}
              </span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Organizations</DropdownMenuLabel>
          {memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.organizationId}
              onSelect={() => {
                if (membership.organizationId === organization?.id) return;
                router.push(viewHref("home", membership.organizationId));
              }}
            >
              <OrganizationTile name={membership.organizationName} className="size-6 text-xs" />
              <span className="min-w-0 flex-1 truncate">{membership.organizationName}</span>
              {membership.organizationId === organization?.id ? <Check className="text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { setError(""); setCreating(true); }}>
            <Plus /> New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New organization</DialogTitle>
              <DialogDescription>
                A separate company with its own people, roles and review cycles. You&apos;ll be its owner.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-organization-name">Organization name</Label>
              <Input id="new-organization-name" name="name" placeholder="Acme Studio" minLength={2} maxLength={100} required autoFocus />
            </div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create organization
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
