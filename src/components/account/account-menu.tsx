"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, LoaderCircle, LogOut, MailPlus, Settings, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Toaster, toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import { readableAuthError } from "./auth-errors";
import { useAccount } from "./client";
import { signOutOfProduct } from "./use-firebase-user";
import { UserAvatar } from "./user-avatar";
import { acceptPendingInvitation } from "./workspace-switcher";

export type AccountMenuProps = {
  /** Fleet product slug, or "performance". */
  product: string;
  /** The account settings page, e.g. "/apps/research/account". */
  accountHref: string;
  /** The team page; omit to hide the item. */
  teamHref?: string;
  /** Where to go after signing out, e.g. "/apps/research/sign-in". */
  signInHref: string;
  /** Pass both to show a "Switch workspace" submenu. */
  currentTenantId?: string | null;
  onSwitchWorkspace?: (tenantId: string) => void;
  workspaceNoun?: string;
  align?: "start" | "end";
  className?: string;
};

/** The signed-in person's avatar, opening a menu with their name, settings, team, workspaces and sign out. */
export function AccountMenu({
  product,
  accountHref,
  teamHref,
  signInHref,
  currentTenantId = null,
  onSwitchWorkspace,
  workspaceNoun = "workspace",
  align = "end",
  className,
}: AccountMenuProps) {
  const { data } = useAccount(product);
  const [signingOut, setSigningOut] = useState(false);
  const profile = data?.profile;
  const workspaces = data?.workspaces ?? [];
  const invitations = data?.pendingInvitations ?? [];
  const person = {
    uid: profile?.uid ?? "",
    name: profile?.name ?? "",
    email: profile?.email ?? "",
    photoURL: profile?.photoURL ?? null,
  };

  async function signOut() {
    setSigningOut(true);
    await signOutOfProduct(product);
    window.location.assign(signInHref);
  }

  return (
    <>
      <Toaster />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-lg"
            className={cn("relative rounded-full", className)}
            aria-label={profile ? `Account menu for ${profile.name || profile.email}` : "Account menu"}
          >
            <UserAvatar person={person} size="md" />
            {invitations.length ? (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background" aria-hidden="true" />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-64">
          <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
            <UserAvatar person={person} size="lg" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{person.name || "Your account"}</span>
              <span className="block truncate text-xs text-muted-foreground">{person.email}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={accountHref}><Settings /> Account settings</Link>
            </DropdownMenuItem>
            {teamHref ? (
              <DropdownMenuItem asChild>
                <Link href={teamHref}><Users /> Team</Link>
              </DropdownMenuItem>
            ) : null}
            {onSwitchWorkspace && (workspaces.length > 1 || invitations.length) ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowLeftRight /> Switch {workspaceNoun}
                  {invitations.length ? <Badge className="ml-auto h-5 min-w-5 px-1.5 tabular-nums">{invitations.length}</Badge> : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {workspaces.map((workspace) => (
                    <DropdownMenuItem key={workspace.id} onSelect={() => onSwitchWorkspace(workspace.id)}>
                      <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                      {workspace.id === currentTenantId ? <Check className="text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                  {invitations.length ? <DropdownMenuSeparator /> : null}
                  {invitations.map((invitation) => (
                    <DropdownMenuItem
                      key={invitation.invitationId}
                      onSelect={() => {
                        void acceptPendingInvitation(product, invitation)
                          .then(() => {
                            toast({ title: `You joined ${invitation.workspaceName}` });
                            onSwitchWorkspace(invitation.tenantId);
                          })
                          .catch((caught: unknown) =>
                            toast({ title: "Couldn't join", description: readableAuthError(caught), variant: "destructive" }));
                      }}
                    >
                      <MailPlus />
                      <span className="min-w-0 flex-1 truncate">Join {invitation.workspaceName}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); void signOut(); }} disabled={signingOut}>
            {signingOut ? <LoaderCircle className="animate-spin" /> : <LogOut />} Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
