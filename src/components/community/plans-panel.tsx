"use client";

import { useState } from "react";
import { CreditCard, KeyRound, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isManager, type CommunityAction } from "@/lib/community/model";

import { formatWhen, paperCard, type Workspace } from "./api";

export function PlansPanel({
  workspace,
  act,
}: {
  workspace: Workspace;
  act: (action: CommunityAction, success?: string) => Promise<unknown>;
}) {
  const manager = isManager(workspace.me.role);
  const [creating, setCreating] = useState(false);
  const [grantUid, setGrantUid] = useState<string>("");
  const [grantPlan, setGrantPlan] = useState<string>("");
  const spaceName = new Map(workspace.spaces.map((space) => [space.id, space.name]));
  const memberName = new Map(workspace.members.map((member) => [member.uid, member.displayName]));
  const planName = new Map(workspace.plans.map((plan) => [plan.id, plan.name]));

  return (
    <div className="flex flex-col gap-4">
      <Alert className="border-2 border-[var(--ink)]">
        <CreditCard />
        <AlertTitle>Payments are not connected</AlertTitle>
        <AlertDescription>
          No payment provider is configured for this community yet, so nobody can be charged. Owners and admins grant plan access by hand; every grant and revocation is recorded in an immutable access history.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">Membership plans</h2>
        {manager ? <Button onClick={() => setCreating(true)}><Plus /> New plan</Button> : null}
      </div>

      {workspace.plans.length === 0 ? (
        <p className={`${paperCard} p-6 text-sm text-[var(--muted)]`}>
          {manager ? "Create a plan that unlocks one or more private spaces, then grant it to members." : "This community has no membership plans yet."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspace.plans.map((plan) => {
            const mine = workspace.myPlanIds.includes(plan.id);
            return (
              <div key={plan.id} className={`${paperCard} flex flex-col gap-2 p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  {plan.priceLabel ? <Badge variant="secondary">{plan.priceLabel}</Badge> : null}
                </div>
                {plan.description ? <p className="text-sm">{plan.description}</p> : null}
                <p className="text-xs text-[var(--muted)]">
                  Unlocks: {plan.spaceIds.length ? plan.spaceIds.map((id) => spaceName.get(id) ?? "a private space").join(", ") : "no spaces yet"}
                </p>
                {mine ? (
                  <Badge className="self-start bg-[#a855f7] text-white"><KeyRound size={12} /> You have access</Badge>
                ) : (
                  <Button variant="outline" size="sm" className="self-start" disabled>Checkout not connected</Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {manager && workspace.access ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${paperCard} flex flex-col gap-3 p-4`}>
            <h3 className="font-black">Grant access</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={grantUid} onValueChange={setGrantUid}>
                <SelectTrigger className="w-full" aria-label="Member"><SelectValue placeholder="Member" /></SelectTrigger>
                <SelectContent>
                  {workspace.members.map((member) => <SelectItem key={member.uid} value={member.uid}>{member.displayName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={grantPlan} onValueChange={setGrantPlan}>
                <SelectTrigger className="w-full" aria-label="Plan"><SelectValue placeholder="Plan" /></SelectTrigger>
                <SelectContent>
                  {workspace.plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                disabled={!grantUid || !grantPlan}
                onClick={() => void act({ type: "entitlement.grant", planId: grantPlan, uid: grantUid, reason: "Manual grant" }, "Access granted.").catch(() => undefined)}
              >
                Grant
              </Button>
            </div>
            <h4 className="mt-2 text-sm font-bold">Active access ({workspace.access.entitlements.length})</h4>
            {workspace.access.entitlements.length === 0 ? <p className="text-sm text-[var(--muted)]">Nobody holds a plan yet.</p> : null}
            {workspace.access.entitlements.map((entitlement) => (
              <div key={entitlement.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{memberName.get(entitlement.uid) ?? "Former member"} · {planName.get(entitlement.planId) ?? "Deleted plan"}</span>
                <Button size="sm" variant="ghost" onClick={() => void act({ type: "entitlement.revoke", planId: entitlement.planId, uid: entitlement.uid, reason: "Manual revoke" }, "Access revoked.").catch(() => undefined)}>Revoke</Button>
              </div>
            ))}
          </section>
          <section className={`${paperCard} flex flex-col gap-2 p-4`}>
            <h3 className="font-black">Access history</h3>
            {workspace.access.history.length === 0 ? <p className="text-sm text-[var(--muted)]">No grants or revocations yet.</p> : null}
            <ol className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
              {workspace.access.history.map((event) => (
                <li key={event.id} className="border-b border-[var(--line)] pb-1">
                  <Badge variant={event.type === "granted" ? "secondary" : "destructive"} className="mr-1">{event.type}</Badge>
                  {memberName.get(event.uid) ?? "Former member"} · {planName.get(event.planId) ?? "Deleted plan"} · {event.source} · {formatWhen(event.at)}
                  {event.reason ? <span className="block text-xs text-[var(--muted)]">{event.reason}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}

      {creating ? <PlanDialog workspace={workspace} onClose={() => setCreating(false)} act={act} /> : null}
    </div>
  );
}

function PlanDialog({
  workspace,
  onClose,
  act,
}: {
  workspace: Workspace;
  onClose: () => void;
  act: (action: CommunityAction, success?: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [priceLabel, setPriceLabel] = useState("");
  const [description, setDescription] = useState("");
  const [spaceIds, setSpaceIds] = useState<string[]>([]);
  const privateSpaces = workspace.spaces.filter((space) => space.visibility === "private");

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await act({ type: "plan.create", name, priceLabel, description, spaceIds }, "Plan created.").then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>New membership plan</DialogTitle>
            <DialogDescription>Members holding this plan can see the private spaces you pick. The price is a label until payments are connected.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-price">Price label</Label>
            <Input id="plan-price" value={priceLabel} onChange={(event) => setPriceLabel(event.target.value)} maxLength={40} placeholder="$20 / month" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Input id="plan-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} />
          </div>
          <fieldset className="flex flex-col gap-2 rounded-lg border-2 border-[var(--line)] p-3">
            <legend className="px-1 text-sm font-semibold">Private spaces this plan unlocks</legend>
            {privateSpaces.length === 0 ? <p className="text-sm text-[var(--muted)]">Create a private space first.</p> : null}
            {privateSpaces.map((space) => (
              <label key={space.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={spaceIds.includes(space.id)}
                  onCheckedChange={(checked) => setSpaceIds((current) => (checked ? [...current, space.id] : current.filter((id) => id !== space.id)))}
                />
                {space.name}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim()}>Create plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
