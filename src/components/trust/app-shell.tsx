"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Gauge,
  Globe,
  KeyRound,
  ListChecks,
  Menu,
  Settings2,
  Users,
} from "lucide-react";

import { TrustMark } from "@/brands/trust/mark";
import { AccountMenu } from "@/components/account/account-menu";
import { useAccount } from "@/components/account/client";
import { WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export const TRUST_SECTIONS = [
  "overview",
  "controls",
  "evidence",
  "policies",
  "risks",
  "vendors",
  "access",
  "audits",
  "trust-center",
  "people",
  "activity",
  "settings",
] as const;
export type TrustSection = (typeof TRUST_SECTIONS)[number];

type NavItem = { id: TrustSection; label: string; icon: typeof Gauge };

const GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Program",
    items: [
      { id: "overview", label: "Overview", icon: Gauge },
      { id: "controls", label: "Controls", icon: ListChecks },
      { id: "evidence", label: "Evidence", icon: FileCheck2 },
      { id: "policies", label: "Policies", icon: FileText },
    ],
  },
  {
    label: "Risk",
    items: [
      { id: "risks", label: "Risks", icon: AlertTriangle },
      { id: "vendors", label: "Vendors", icon: Building2 },
      { id: "access", label: "Access reviews", icon: KeyRound },
    ],
  },
  {
    label: "Assurance",
    items: [
      { id: "audits", label: "Audits", icon: ClipboardCheck },
      { id: "trust-center", label: "Trust center", icon: Globe },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "people", label: "People", icon: Users },
      { id: "activity", label: "Activity", icon: Activity },
      { id: "settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export const TRUST_HOME = "/apps/trust";
export const TRUST_SIGN_IN = "/apps/trust/sign-in";
export const TRUST_ACCOUNT = "/apps/trust/account";

export function sectionHref(section: TrustSection) {
  return section === "overview" ? TRUST_HOME : `${TRUST_HOME}?section=${section}`;
}

export const SECTION_LABELS = Object.fromEntries(GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label]))) as Record<TrustSection, string>;

/**
 * Trust's signed-in frame: a quiet sidebar with the program's sections (and counts of what
 * needs attention), the workspace switcher on top and the person at the bottom.
 */
export function TrustShell({
  tenantId,
  onSwitchWorkspace,
  active,
  onNavigate,
  counts = {},
  children,
}: {
  tenantId: string | null;
  onSwitchWorkspace: (tenantId: string) => void;
  active: TrustSection | null;
  onNavigate?: (section: TrustSection) => void;
  counts?: Partial<Record<TrustSection, number>>;
  children: ReactNode;
}) {
  const { data } = useAccount("trust");
  const profile = data?.profile;

  function itemProps(id: TrustSection) {
    const className = cn(
      "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors",
      active === id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    );
    return { className, "aria-current": active === id ? ("page" as const) : undefined };
  }

  function navLink(item: NavItem) {
    const Icon = item.icon;
    const count = counts[item.id];
    const content = (
      <>
        <Icon className={cn("size-4", active === item.id ? "text-brand-accent" : "opacity-70")} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {count ? <span className="rounded-[4px] bg-amber-100 px-1.5 font-mono text-[11px] font-medium tabular-nums text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">{count}</span> : null}
      </>
    );
    return onNavigate ? (
      <button key={item.id} type="button" {...itemProps(item.id)} onClick={() => onNavigate(item.id)}>{content}</button>
    ) : (
      <Link key={item.id} href={sectionHref(item.id)} {...itemProps(item.id)}>{content}</Link>
    );
  }

  const switcher = (
    <WorkspaceSwitcher
      product="trust"
      currentTenantId={tenantId}
      onSwitch={onSwitchWorkspace}
      workspaceNoun="workspace"
      className="h-9 w-full max-w-none justify-between bg-background font-medium"
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <div className="flex min-h-dvh bg-background text-foreground">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex" aria-label="Trust">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href={sectionHref("overview")} className="flex items-center gap-2" aria-label="Trust overview">
              <TrustMark size={24} />
              <span className="brand-heading text-[17px]">Trust</span>
            </Link>
          </div>
          <div className="px-3 pb-3">{switcher}</div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Sections">
            {GROUPS.map((group) => (
              <div key={group.label} className="mt-3 grid gap-0.5 first:mt-1">
                <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
                {group.items.map((item) => navLink(item))}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2 border-t border-sidebar-border p-3">
            <AccountMenu
              product="trust"
              accountHref={TRUST_ACCOUNT}
              teamHref={sectionHref("people")}
              signInHref={TRUST_SIGN_IN}
              currentTenantId={tenantId}
              onSwitchWorkspace={onSwitchWorkspace}
              align="start"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{profile?.name || "Your account"}</span>
              <span className="block truncate text-xs text-muted-foreground">{profile?.title || profile?.email || ""}</span>
            </span>
            <ThemeToggle />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Sections"><Menu /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {GROUPS.map((group, index) => (
                  <DropdownMenuGroup key={group.label}>
                    {index ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuLabel className="text-xs text-muted-foreground">{group.label}</DropdownMenuLabel>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return onNavigate ? (
                        <DropdownMenuItem key={item.id} onSelect={() => onNavigate(item.id)}>
                          <Icon /> {item.label}
                          {counts[item.id] ? <span className="ml-auto font-mono text-xs text-amber-700 dark:text-amber-300">{counts[item.id]}</span> : null}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={item.id} asChild><Link href={sectionHref(item.id)}><Icon /> {item.label}</Link></DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <TrustMark size={22} />
            <div className="min-w-0 flex-1">{switcher}</div>
            <AccountMenu
              product="trust"
              accountHref={TRUST_ACCOUNT}
              teamHref={sectionHref("people")}
              signInHref={TRUST_SIGN_IN}
              currentTenantId={tenantId}
              onSwitchWorkspace={onSwitchWorkspace}
            />
          </header>
          <main id="main" className="min-w-0 flex-1">{children}</main>
          <footer className="px-4 pb-6 pt-2 text-xs text-muted-foreground sm:px-8">
            Trust tracks readiness; it doesn&apos;t certify. Free and open source, part of the SaaSassin open-source family.
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}
