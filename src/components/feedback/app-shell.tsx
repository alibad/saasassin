"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Inbox, Layers, Map as MapIcon, Megaphone, Settings2, Users } from "lucide-react";

import { FeedbackMark } from "@/brands/feedback/mark";
import { AccountMenu } from "@/components/account/account-menu";
import { WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { cn } from "@/lib/utils";

export const FEEDBACK_VIEWS = ["inbox", "roadmap", "changelog", "boards", "team", "settings"] as const;
export type FeedbackView = (typeof FEEDBACK_VIEWS)[number];

const NAV: Array<{ view: FeedbackView; label: string; icon: typeof Inbox }> = [
  { view: "inbox", label: "Inbox", icon: Inbox },
  { view: "roadmap", label: "Roadmap", icon: MapIcon },
  { view: "changelog", label: "Changelog", icon: Megaphone },
  { view: "boards", label: "Boards", icon: Layers },
  { view: "team", label: "Team", icon: Users },
  { view: "settings", label: "Settings", icon: Settings2 },
];

export const FEEDBACK_HOME = "/apps/feedback";
export const FEEDBACK_SIGN_IN = "/apps/feedback/sign-in";
export const FEEDBACK_ACCOUNT = "/apps/feedback/account";

export function viewHref(view: FeedbackView, tenantId?: string | null) {
  const params = new URLSearchParams();
  if (view !== "inbox") params.set("view", view);
  if (tenantId) params.set("workspace", tenantId);
  const query = params.toString();
  return query ? `${FEEDBACK_HOME}?${query}` : FEEDBACK_HOME;
}

/**
 * The signed-in frame of Feedback: product mark, workspace switcher, the sections of the
 * workspace, a link to the public portal, appearance and the person's account menu.
 * In the workspace the sections switch in place (`onNavigate`); elsewhere they are links.
 */
export function FeedbackShell({
  tenantId,
  onSwitchWorkspace,
  active,
  onNavigate,
  portalHref,
  children,
}: {
  tenantId: string | null;
  onSwitchWorkspace: (tenantId: string) => void;
  active: FeedbackView | null;
  onNavigate?: (view: FeedbackView) => void;
  portalHref?: string | null;
  children: ReactNode;
}) {
  const nav = (
    <nav aria-label="Workspace" className="flex items-center gap-1">
      {NAV.map(({ view, label, icon: Icon }) => {
        const className = cn(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors",
          active === view ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        );
        const content = (
          <>
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </>
        );
        return onNavigate ? (
          <button key={view} type="button" className={className} aria-current={active === view ? "page" : undefined} onClick={() => onNavigate(view)}>
            {content}
          </button>
        ) : (
          <Link key={view} href={viewHref(view, tenantId)} className={className} aria-current={active === view ? "page" : undefined}>
            {content}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <Toaster />
      <div className="min-h-dvh bg-brand-subtle text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
            <Link href={viewHref("inbox", tenantId)} className="flex shrink-0 items-center gap-2" aria-label="Feedback inbox">
              <FeedbackMark size={30} />
              <span className="brand-heading hidden text-lg sm:inline">Feedback</span>
            </Link>
            <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
            <WorkspaceSwitcher
              product="feedback"
              currentTenantId={tenantId}
              onSwitch={onSwitchWorkspace}
              workspaceNoun="workspace"
              className="h-9 max-w-44 rounded-full border-border bg-background font-semibold sm:max-w-56"
            />
            <div className="ml-2 hidden min-w-0 lg:block">{nav}</div>
            <div className="ml-auto flex items-center gap-1.5">
              {portalHref ? (
                <Button asChild variant="outline" size="lg" className="hidden rounded-full md:inline-flex">
                  <Link href={portalHref} target="_blank" rel="noopener">
                    View portal <ExternalLink aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
              <ThemeToggle />
              <AccountMenu
                product="feedback"
                accountHref={FEEDBACK_ACCOUNT}
                teamHref={viewHref("team", tenantId)}
                signInHref={FEEDBACK_SIGN_IN}
                currentTenantId={tenantId}
                onSwitchWorkspace={onSwitchWorkspace}
              />
            </div>
          </div>
          <div className="overflow-x-auto border-t border-border px-3 py-2 lg:hidden">{nav}</div>
        </header>
        {children}
        <footer className="w-full px-4 pb-8 pt-4 text-xs text-muted-foreground sm:px-6">
          Feedback is free and open source. Part of the SaaSassin open-source family.
        </footer>
      </div>
    </TooltipProvider>
  );
}
