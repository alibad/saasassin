"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, LoaderCircle, Mail, UserPlus } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { RoleOption } from "@/lib/fleet/account/roles";
import type { CreatedInvitation } from "@/lib/fleet/account/types";

import { readableAuthError } from "./auth-errors";
import { accountApiBase, accountRequest } from "./client";

export function InviteDialog({ product, tenantId, open, onOpenChange, roles, defaultRole, onCreated }: {
  product: string;
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  defaultRole: string;
  onCreated: (created: CreatedInvitation) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = roles.find((option) => option.id === role);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await accountRequest<CreatedInvitation>(
        `${accountApiBase(product)}/tenants/${encodeURIComponent(tenantId)}/invitations`,
        { method: "POST", json: { email: email.trim(), role } },
      );
      setEmail("");
      onCreated(created);
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
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>They can join with this email whether or not they have an account yet.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${product}-invite-email`}>Email</Label>
            <Input
              id={`${product}-invite-email`}
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${product}-invite-role`}>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id={`${product}-invite-role`} className="w-full">
                <SelectValue placeholder="Choose a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.description ? <p className="text-xs text-muted-foreground">{selected.description}</p> : null}
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !email.trim()}>
              {saving ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Create invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function mailtoInvite(input: { email: string; link: string; workspaceName: string; productName: string; inviterName: string }) {
  const subject = `Join ${input.workspaceName} on ${input.productName}`;
  const body = [
    "Hi,",
    "",
    `I'd like you to join ${input.workspaceName} on ${input.productName}. Use this link to accept the invitation. It's meant for ${input.email} and expires in 14 days:`,
    "",
    input.link,
    "",
    input.inviterName ? `Thanks,\n${input.inviterName}` : "Thanks",
  ].join("\n");
  return `mailto:${encodeURIComponent(input.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Shows a freshly created (or re-issued) invitation link. Nothing is emailed automatically. */
export function InviteLinkDialog({ created, open, onOpenChange, workspaceName, productName, inviterName }: {
  created: CreatedInvitation | null;
  /** Kept separate from `created` so the content stays put while the dialog animates closed. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  productName: string;
  inviterName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open && created !== null} onOpenChange={(next) => { if (!next) setCopied(false); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share the invitation with {created?.invitation.email}</DialogTitle>
          <DialogDescription>
            We don&apos;t send email for you, so send this link yourself. It works only for {created?.invitation.email}, as{" "}
            {created?.invitation.roleLabel}, and expires in 14 days.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.inviteUrl}
                aria-label="Invitation link"
                onFocus={(event) => event.target.select()}
              />
              <Button type="button" onClick={copy} aria-label="Copy invitation link">
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button asChild variant="outline">
              <a href={mailtoInvite({ email: created.invitation.email, link: created.inviteUrl, workspaceName, productName, inviterName })}>
                <Mail /> Email it from your mail app
              </a>
            </Button>
            <Alert>
              <AlertDescription>
                This is the only time the link is shown. If it gets lost, use &ldquo;New link&rdquo; on the pending invitation;
                the old link then stops working.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
