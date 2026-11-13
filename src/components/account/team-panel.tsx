"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, LoaderCircle, LogOut, MoreHorizontal, RefreshCw, UserMinus, UserPlus, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/toast";
import type { CreatedInvitation, InvitationView, TeamMemberView, TeamView } from "@/lib/fleet/account/types";
import { cn } from "@/lib/utils";

import { readableAuthError } from "./auth-errors";
import { accountApiBase, accountRequest, refreshAccount } from "./client";
import { InviteDialog, InviteLinkDialog } from "./invite-dialogs";
import { useReauthGuard } from "./reauth-dialog";
import { UserAvatar } from "./user-avatar";

export type TeamPanelProps = {
  /** Fleet product slug. */
  product: string;
  productName: string;
  tenantId: string;
  /** Called after you leave this workspace (switch to another one). Defaults to reloading the page. */
  onLeft?: () => void;
  className?: string;
};

type Confirm =
  | { kind: "remove"; member: TeamMemberView }
  | { kind: "transfer"; member: TeamMemberView }
  | { kind: "leave" }
  | { kind: "revoke"; invitation: InvitationView };

function relativeExpiry(iso: string | null) {
  if (!iso) return "";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Expired";
  return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
}

/**
 * The team page for one workspace: members with photos and roles, invitations (with links to
 * share, new links and revoke), role changes, removal, leaving and ownership transfer. What
 * each person can do comes from the server; the buttons only mirror it.
 */
export function TeamPanel({ product, productName, tenantId, onLeft, className }: TeamPanelProps) {
  const [team, setTeam] = useState<TeamView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirm, setConfirmState] = useState<Confirm | null>(null);
  // Separate from `confirm` so the dialog keeps its text while it animates closed.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setConfirm = (next: Confirm) => {
    setConfirmState(next);
    setConfirmOpen(true);
  };
  const { guard, dialog } = useReauthGuard(product);
  const base = `${accountApiBase(product)}/tenants/${encodeURIComponent(tenantId)}`;

  const load = useCallback(async () => {
    try {
      setTeam(await accountRequest<TeamView>(`${base}/team`));
      setError("");
    } catch (caught) {
      setError(readableAuthError(caught, "The team couldn't be loaded."));
    }
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    accountRequest<TeamView>(`${base}/team`)
      .then((next) => {
        if (cancelled) return;
        setTeam(next);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(readableAuthError(caught, "The team couldn't be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function act(key: string, action: () => Promise<void>, success?: string) {
    setBusy(key);
    try {
      await guard(async () => {
        await action();
        if (success) toast({ title: success });
        await load();
      });
    } catch (caught) {
      toast({ title: "That didn't work", description: readableAuthError(caught), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function changeRole(member: TeamMemberView, role: string) {
    if (role === member.role) return;
    const label = team?.assignableRoles.find((option) => option.id === role)?.label ?? role;
    void act(`role-${member.uid}`, async () => {
      await accountRequest(`${base}/members/${encodeURIComponent(member.uid)}`, { method: "PATCH", json: { role } });
    }, `${member.name} is now ${label}`);
  }

  function runConfirm(current: Confirm) {
    setConfirmOpen(false);
    if (current.kind === "remove") {
      void act(`remove-${current.member.uid}`, async () => {
        await accountRequest(`${base}/members/${encodeURIComponent(current.member.uid)}`, { method: "DELETE" });
      }, `${current.member.name} was removed`);
    } else if (current.kind === "transfer") {
      void act(`transfer-${current.member.uid}`, async () => {
        await accountRequest(`${base}/transfer`, { method: "POST", json: { uid: current.member.uid } });
        void refreshAccount(product);
      }, `${current.member.name} now owns ${team?.workspace.name ?? "the workspace"}`);
    } else if (current.kind === "revoke") {
      void act(`revoke-${current.invitation.id}`, async () => {
        await accountRequest(`${base}/invitations/${encodeURIComponent(current.invitation.id)}`, { method: "DELETE" });
      }, `Invitation for ${current.invitation.email} revoked`);
    } else {
      setBusy("leave");
      void accountRequest(`${base}/leave`, { method: "POST" })
        .then(async () => {
          toast({ title: `You left ${team?.workspace.name ?? "the workspace"}` });
          await refreshAccount(product);
          if (onLeft) onLeft();
          else window.location.reload();
        })
        .catch((caught: unknown) => toast({ title: "Couldn't leave", description: readableAuthError(caught), variant: "destructive" }))
        .finally(() => setBusy(null));
    }
  }

  function resend(invitation: InvitationView) {
    void act(`resend-${invitation.id}`, async () => {
      setCreated(await accountRequest<CreatedInvitation>(`${base}/invitations/${encodeURIComponent(invitation.id)}/resend`, { method: "POST" }));
      setLinkOpen(true);
    });
  }

  if (error && !team) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertTitle>The team couldn&apos;t be loaded</AlertTitle>
        <AlertDescription>
          {error}
          <Button className="mt-2 w-fit" size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Try again</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!team) {
    return (
      <Card className={className}>
        <CardHeader><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-56" /></CardHeader>
        <CardContent className="grid gap-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 flex-1" /></div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const { viewer } = team;
  const ownerCount = team.members.filter((member) => member.role === "owner").length;
  const soleOwner = viewer.isOwner && ownerCount <= 1;
  const me = team.members.find((member) => member.isYou);

  return (
    <div className={cn("grid gap-6", className)}>
      <Toaster />
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            {team.members.length === 1 ? "Just you so far." : `${team.members.length} people in ${team.workspace.name}.`}
          </CardDescription>
          {viewer.canManage ? (
            <CardAction>
              <Button onClick={() => setInviting(true)}><UserPlus /> Invite</Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1">
            {team.members.map((member, index) => {
              const canChangeRole = viewer.canManage && !member.isYou && member.role !== "owner";
              const canRemove = viewer.canManage && !member.isYou && (member.role !== "owner" || viewer.isOwner);
              const canTransfer = viewer.isOwner && !member.isYou && member.role !== "owner";
              return (
                <li key={member.uid}>
                  {index > 0 ? <Separator className="my-3" /> : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar person={member} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{member.name}</span>
                        {member.isYou ? <Badge variant="secondary">You</Badge> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[member.title, member.email].filter(Boolean).join(" · ") || " "}
                      </p>
                    </div>
                    {canChangeRole ? (
                      <Select value={member.role} onValueChange={(role) => changeRole(member, role)} disabled={busy !== null}>
                        <SelectTrigger size="sm" className="w-36" aria-label={`Role for ${member.name}`}>
                          {busy === `role-${member.uid}` ? <LoaderCircle className="animate-spin" /> : null}
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                          {team.assignableRoles.map((option) => (
                            <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={member.role === "owner" ? "default" : "outline"}>
                        {member.role === "owner" ? <Crown /> : null} {member.roleLabel}
                      </Badge>
                    )}
                    {canRemove || canTransfer || member.isYou ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${member.name}`} disabled={busy !== null}>
                            {busy?.endsWith(member.uid) && !busy.startsWith("role-") ? <LoaderCircle className="animate-spin" /> : <MoreHorizontal />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {canTransfer ? (
                            <DropdownMenuItem onSelect={() => setConfirm({ kind: "transfer", member })}>
                              <Crown /> Make owner
                            </DropdownMenuItem>
                          ) : null}
                          {canTransfer && canRemove ? <DropdownMenuSeparator /> : null}
                          {canRemove ? (
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm({ kind: "remove", member })}>
                              <UserMinus /> Remove from {team.workspace.name}
                            </DropdownMenuItem>
                          ) : null}
                          {member.isYou ? (
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={soleOwner}
                              onSelect={() => setConfirm({ kind: "leave" })}
                            >
                              <LogOut /> {soleOwner ? "Transfer ownership before leaving" : `Leave ${team.workspace.name}`}
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {team.invitations && team.invitations.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>People who haven&apos;t joined yet. Links expire after 14 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1">
              {team.invitations.map((invitation, index) => (
                <li key={invitation.id}>
                  {index > 0 ? <Separator className="my-3" /> : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <UserAvatar person={{ uid: invitation.email, email: invitation.email }} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {invitation.roleLabel}
                        {invitation.invitedBy.name ? ` · invited by ${invitation.invitedBy.name}` : ""}
                        {invitation.status === "pending" ? ` · ${relativeExpiry(invitation.expiresAt)}` : ""}
                      </p>
                    </div>
                    {invitation.status === "expired" ? <Badge variant="outline">Expired</Badge> : <Badge variant="secondary">Pending</Badge>}
                    <Button variant="outline" size="sm" onClick={() => resend(invitation)} disabled={busy !== null}>
                      {busy === `resend-${invitation.id}` ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} New link
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Revoke the invitation for ${invitation.email}`}
                      onClick={() => setConfirm({ kind: "revoke", invitation })}
                      disabled={busy !== null}
                    >
                      {busy === `revoke-${invitation.id}` ? <LoaderCircle className="animate-spin" /> : <X />}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <InviteDialog
        key={team.defaultInviteRole}
        product={product}
        tenantId={tenantId}
        open={inviting}
        onOpenChange={setInviting}
        roles={team.assignableRoles}
        defaultRole={team.defaultInviteRole}
        onCreated={(next) => {
          setInviting(false);
          setCreated(next);
          setLinkOpen(true);
          void load();
        }}
      />
      <InviteLinkDialog
        created={created}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        workspaceName={team.workspace.name}
        productName={productName}
        inviterName={me?.name ?? ""}
      />

      <AlertDialog open={confirmOpen && confirm !== null} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          {confirm ? <ConfirmCopy confirm={confirm} workspaceName={team.workspace.name} /> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "transfer" ? "default" : "destructive"}
              onClick={() => { if (confirm) runConfirm(confirm); }}
            >
              {confirm?.kind === "remove" ? "Remove" : confirm?.kind === "transfer" ? "Transfer ownership" : confirm?.kind === "revoke" ? "Revoke invitation" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConfirmCopy({ confirm, workspaceName }: { confirm: Confirm; workspaceName: string }) {
  const copy = {
    remove: confirm.kind === "remove" ? {
      title: `Remove ${confirm.member.name}?`,
      body: `They lose access to ${workspaceName} right away. Their past work stays. You can invite them again later.`,
    } : null,
    transfer: confirm.kind === "transfer" ? {
      title: `Make ${confirm.member.name} the owner?`,
      body: `${confirm.member.name} will own ${workspaceName} and you'll become an admin. Only the new owner can transfer it back. You may be asked to confirm it's you.`,
    } : null,
    revoke: confirm.kind === "revoke" ? {
      title: `Revoke the invitation for ${confirm.invitation.email}?`,
      body: "The link stops working immediately. You can invite them again later.",
    } : null,
    leave: confirm.kind === "leave" ? {
      title: `Leave ${workspaceName}?`,
      body: "You lose access right away. To come back, someone will need to invite you again.",
    } : null,
  }[confirm.kind];
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
      <AlertDialogDescription>{copy?.body}</AlertDialogDescription>
    </AlertDialogHeader>
  );
}
