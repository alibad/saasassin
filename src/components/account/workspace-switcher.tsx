"use client";

import { useState, type FormEvent } from "react";
import { Check, ChevronsUpDown, LoaderCircle, MailPlus, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "@/components/ui/toast";
import type { PendingInvitation } from "@/lib/fleet/account/types";
import { cn } from "@/lib/utils";

import { readableAuthError } from "./auth-errors";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "./client";

export type WorkspaceSwitcherProps = {
  /** Fleet product slug. */
  product: string;
  currentTenantId: string | null;
  /** Called with the chosen, newly created or newly joined workspace id. */
  onSwitch: (tenantId: string) => void;
  /** What this product calls a workspace ("workspace", "community", "portal"…). */
  workspaceNoun?: string;
  /** Show "Create …" (default true). */
  allowCreate?: boolean;
  className?: string;
};

/** Accepts an invitation addressed to the signed-in, verified email and refreshes the account. */
export async function acceptPendingInvitation(product: string, invitation: PendingInvitation) {
  await accountRequest(`${accountApiBase(product)}/invitations/accept`, {
    method: "POST",
    json: { tenantId: invitation.tenantId, invitationId: invitation.invitationId },
  });
  await refreshAccount(product);
}

/**
 * The current workspace with a menu to switch, create a new one, or join one you've been
 * invited to (the badge counts invitations waiting for your verified email).
 */
export function WorkspaceSwitcher({
  product,
  currentTenantId,
  onSwitch,
  workspaceNoun = "workspace",
  allowCreate = true,
  className,
}: WorkspaceSwitcherProps) {
  const { data, loading } = useAccount(product);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const workspaces = data?.workspaces ?? [];
  const invitations = data?.pendingInvitations ?? [];
  const current = workspaces.find((workspace) => workspace.id === currentTenantId) ?? null;
  const Noun = workspaceNoun.charAt(0).toUpperCase() + workspaceNoun.slice(1);

  async function join(invitation: PendingInvitation) {
    setJoining(invitation.invitationId);
    try {
      await acceptPendingInvitation(product, invitation);
      toast({ title: `You joined ${invitation.workspaceName}`, description: `Your role there: ${invitation.roleLabel}.` });
      onSwitch(invitation.tenantId);
    } catch (caught) {
      toast({ title: "Couldn't join", description: readableAuthError(caught), variant: "destructive" });
      void refreshAccount(product);
    } finally {
      setJoining(null);
    }
  }

  return (
    <>
      <Toaster />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("max-w-64 justify-between gap-2", className)} aria-label={`Switch ${workspaceNoun}${current ? ` (current: ${current.name})` : ""}`}>
            <span className="truncate">{current?.name ?? (loading ? "Loading…" : `Choose a ${workspaceNoun}`)}</span>
            {invitations.length ? (
              <Badge className="h-5 min-w-5 px-1.5 tabular-nums" aria-label={`${invitations.length} pending invitations`}>
                {invitations.length}
              </Badge>
            ) : null}
            <ChevronsUpDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Your {workspaceNoun}s</DropdownMenuLabel>
          <DropdownMenuGroup>
            {workspaces.length ? workspaces.map((workspace) => (
              <DropdownMenuItem key={workspace.id} onSelect={() => onSwitch(workspace.id)}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{workspace.name}</span>
                  <span className="block text-xs text-muted-foreground">{workspace.roleLabel}</span>
                </span>
                {workspace.id === currentTenantId ? <Check className="text-primary" /> : null}
              </DropdownMenuItem>
            )) : (
              <DropdownMenuItem disabled>No {workspaceNoun}s yet</DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {invitations.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Invitations</DropdownMenuLabel>
              <DropdownMenuGroup>
                {invitations.map((invitation) => (
                  <DropdownMenuItem
                    key={invitation.invitationId}
                    disabled={joining !== null}
                    onSelect={() => {
                      void join(invitation);
                    }}
                  >
                    {joining === invitation.invitationId ? <LoaderCircle className="animate-spin" /> : <MailPlus />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">Join {invitation.workspaceName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {invitation.roleLabel}{invitation.invitedByName ? ` · from ${invitation.invitedByName}` : ""}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
          {allowCreate ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus /> Create a {workspaceNoun}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog
        product={product}
        open={creating}
        onOpenChange={setCreating}
        title={`Create a ${workspaceNoun}`}
        label={`${Noun} name`}
        onCreated={(id) => {
          setCreating(false);
          onSwitch(id);
        }}
      />
    </>
  );
}

export function CreateWorkspaceDialog({ product, open, onOpenChange, onCreated, title = "Create a workspace", label = "Workspace name" }: {
  product: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tenantId: string) => void;
  title?: string;
  label?: string;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase(product)}/tenants`, {
        method: "POST",
        json: { name: name.trim() },
      });
      await refreshAccount(product);
      setName("");
      onCreated(tenant.id);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setError(""); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>You&apos;ll be its owner and can invite your team next.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${product}-new-workspace`}>{label}</Label>
            <Input
              id={`${product}-new-workspace`}
              value={name}
              minLength={2}
              maxLength={80}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? <LoaderCircle className="animate-spin" /> : <Plus />} Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
