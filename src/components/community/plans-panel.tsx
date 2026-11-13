"use client";

import { useState } from "react";
import { Archive, CreditCard, KeyRound, Pencil, Plus, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isManager, type CommunityAction, type PlanArchiveChoice } from "@/lib/community/model";

import { formatWhen, surface, type Workspace } from "./api";

type Act = (action: CommunityAction, success?: string) => Promise<unknown>;
type WorkspacePlan = Workspace["plans"][number];

export function PlansPanel({ workspace, act }: { workspace: Workspace; act: Act }) {
  const manager = isManager(workspace.me.role);
  const [editing, setEditing] = useState<{ mode: "create" } | { mode: "edit"; plan: WorkspacePlan } | null>(null);
  const [archiving, setArchiving] = useState<WorkspacePlan | null>(null);
  const [grantUid, setGrantUid] = useState<string>("");
  const [grantPlan, setGrantPlan] = useState<string>("");
  const spaceName = new Map(workspace.spaces.map((space) => [space.id, space.name]));
  const memberName = new Map(workspace.members.map((member) => [member.uid, member.displayName]));
  const planName = new Map(workspace.plans.map((plan) => [plan.id, plan.name]));
  const grantable = workspace.plans.filter((plan) => !plan.archived);
  const holders = (planId: string) => workspace.access?.entitlements.filter((entry) => entry.planId === planId).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Alert className="rounded-2xl border-0 bg-accent text-accent-foreground">
        <CreditCard />
        <AlertTitle>Payments aren&apos;t connected yet</AlertTitle>
        <AlertDescription>
          Nobody can be charged until a payment provider is connected. Until then, owners and admins grant plan access by hand, and every grant and revocation is kept in the access history.
        </AlertDescription>
      </Alert>

      <div className="-order-1 flex items-center justify-between">
        <h1 className="brand-heading text-3xl">Membership</h1>
        {manager ? <Button className="rounded-full" onClick={() => setEditing({ mode: "create" })}><Plus /> New plan</Button> : null}
      </div>

      {workspace.plans.length === 0 ? (
        <p className={`${surface} p-6 text-sm text-muted-foreground`}>
          {manager ? "Create a plan that unlocks one or more private spaces, then grant it to members." : "This community has no membership plans yet."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {workspace.plans.map((plan) => {
            const mine = workspace.myPlanIds.includes(plan.id);
            return (
              <div key={plan.id} className={`${surface} flex flex-col gap-2 p-4 ${plan.archived ? "opacity-80" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-heading text-xl font-semibold">{plan.name}</h3>
                  <div className="flex flex-wrap justify-end gap-1">
                    {plan.archived ? <Badge variant="outline">Archived</Badge> : null}
                    {plan.priceLabel ? <Badge variant="secondary">{plan.priceLabel}</Badge> : null}
                  </div>
                </div>
                {plan.description ? <p className="text-sm">{plan.description}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Unlocks: {plan.spaceIds.length ? plan.spaceIds.map((id) => spaceName.get(id) ?? "a private space").join(", ") : "no spaces yet"}
                </p>
                {plan.archived ? (
                  <p className="text-xs text-muted-foreground">
                    Archived {formatWhen(plan.archivedAt)}. No new grants. {plan.existingAccess === "keep" ? "People who already held it keep access." : "Existing access was revoked."}
                  </p>
                ) : null}
                {mine ? (
                  <Badge className="self-start bg-primary text-primary-foreground"><KeyRound size={12} /> You have access</Badge>
                ) : !plan.archived ? (
                  <Button variant="outline" size="sm" className="self-start" disabled>Checkout not connected</Button>
                ) : null}
                {manager ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing({ mode: "edit", plan })}><Pencil /> Edit</Button>
                    {plan.archived ? (
                      <Button size="sm" variant="ghost" onClick={() => void act({ type: "plan.unarchive", planId: plan.id }, `${plan.name} can be granted again.`).catch(() => undefined)}><RotateCcw /> Unarchive</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setArchiving(plan)}><Archive /> Archive</Button>
                    )}
                    <span className="ml-auto self-center text-xs text-muted-foreground">{holders(plan.id)} active</span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {manager && workspace.access ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${surface} flex flex-col gap-3 p-4`}>
            <h3 className="font-heading font-semibold">Grant access</h3>
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
                  {grantable.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                disabled={!grantUid || !grantPlan || !grantable.some((plan) => plan.id === grantPlan)}
                onClick={() => void act({ type: "entitlement.grant", planId: grantPlan, uid: grantUid, reason: "Manual grant" }, "Access granted.").catch(() => undefined)}
              >
                Grant
              </Button>
            </div>
            {grantable.length === 0 && workspace.plans.length > 0 ? <p className="text-xs text-muted-foreground">Every plan is archived. Unarchive one to grant it.</p> : null}
            <h4 className="mt-2 text-sm font-bold">Active access ({workspace.access.entitlements.length})</h4>
            {workspace.access.entitlements.length === 0 ? <p className="text-sm text-muted-foreground">Nobody holds a plan yet.</p> : null}
            {workspace.access.entitlements.map((entitlement) => (
              <div key={entitlement.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{memberName.get(entitlement.uid) ?? "Former member"} · {planName.get(entitlement.planId) ?? "Deleted plan"}</span>
                <Button size="sm" variant="ghost" onClick={() => void act({ type: "entitlement.revoke", planId: entitlement.planId, uid: entitlement.uid, reason: "Manual revoke" }, "Access revoked.").catch(() => undefined)}>Revoke</Button>
              </div>
            ))}
          </section>
          <section className={`${surface} flex flex-col gap-2 p-4`}>
            <h3 className="font-heading font-semibold">Access history</h3>
            {workspace.access.history.length === 0 ? <p className="text-sm text-muted-foreground">No grants or revocations yet.</p> : null}
            <ol className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
              {workspace.access.history.map((event) => (
                <li key={event.id} className="border-b border-border pb-1">
                  <Badge variant={event.type === "granted" ? "secondary" : "destructive"} className="mr-1">{event.type}</Badge>
                  {memberName.get(event.uid) ?? "Former member"} · {planName.get(event.planId) ?? "Deleted plan"} · {event.source.replace("_", " ")} · {formatWhen(event.at)}
                  {event.reason ? <span className="block text-xs text-muted-foreground">{event.reason}</span> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}

      {editing ? (
        <PlanDialog
          key={editing.mode === "edit" ? editing.plan.id : "new"}
          workspace={workspace}
          initial={editing.mode === "edit" ? editing.plan : null}
          activeHolders={editing.mode === "edit" ? holders(editing.plan.id) : 0}
          onClose={() => setEditing(null)}
          act={act}
        />
      ) : null}
      {archiving ? <ArchiveDialog plan={archiving} activeHolders={holders(archiving.id)} onClose={() => setArchiving(null)} act={act} /> : null}
    </div>
  );
}

function PlanDialog({
  workspace,
  initial,
  activeHolders,
  onClose,
  act,
}: {
  workspace: Workspace;
  initial: WorkspacePlan | null;
  activeHolders: number;
  onClose: () => void;
  act: Act;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [priceLabel, setPriceLabel] = useState(initial?.priceLabel ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [spaceIds, setSpaceIds] = useState<string[]>(initial?.spaceIds ?? []);
  const privateSpaces = workspace.spaces.filter((space) => space.visibility === "private");

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const action: CommunityAction = initial
              ? { type: "plan.update", planId: initial.id, name, priceLabel, description, spaceIds }
              : { type: "plan.create", name, priceLabel, description, spaceIds };
            await act(action, initial ? "Plan updated." : "Plan created.").then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial ? `Edit ${initial.name}` : "New membership plan"}</DialogTitle>
            <DialogDescription>
              Members holding this plan can see the private spaces you pick. The price is a label until payments are connected.
              {initial && activeHolders ? ` Changing the spaces changes access for the ${activeHolders} ${activeHolders === 1 ? "person" : "people"} who hold it now; the change is logged.` : ""}
            </DialogDescription>
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
          <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold">Private spaces this plan unlocks</legend>
            {privateSpaces.length === 0 ? <p className="text-sm text-muted-foreground">Create a private space first.</p> : null}
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
            <Button type="submit" disabled={!name.trim()}>{initial ? "Save plan" : "Create plan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog({ plan, activeHolders, onClose, act }: { plan: WorkspacePlan; activeHolders: number; onClose: () => void; act: Act }) {
  const [choice, setChoice] = useState<PlanArchiveChoice | "">("");
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!choice) return;
            await act(
              { type: "plan.archive", planId: plan.id, existingAccess: choice, reason },
              choice === "revoke" ? `${plan.name} archived; ${activeHolders} ${activeHolders === 1 ? "grant" : "grants"} revoked.` : `${plan.name} archived; existing holders keep access.`,
            ).then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Archive {plan.name}?</DialogTitle>
            <DialogDescription>Archived plans can no longer be granted. Choose what happens to the {activeHolders} {activeHolders === 1 ? "person" : "people"} who hold it now. Your choice is recorded in the audit log.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={choice} onValueChange={(value) => setChoice(value as PlanArchiveChoice)} aria-label="Existing access">
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <RadioGroupItem value="keep" className="mt-0.5" />
              <span><strong className="block">Keep their access</strong>Current holders keep the spaces this plan unlocks until you revoke them one by one.</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <RadioGroupItem value="revoke" className="mt-0.5" />
              <span><strong className="block">Revoke everyone now</strong>Each holder gets an immutable &ldquo;revoked&rdquo; entry in the access history.</span>
            </label>
          </RadioGroup>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="archive-reason">Reason (optional)</Label>
            <Input id="archive-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={280} placeholder="Replaced by the annual plan" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant={choice === "revoke" ? "destructive" : "default"} disabled={!choice}>Archive plan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
