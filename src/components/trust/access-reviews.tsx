"use client";

import { useState } from "react";
import { ClipboardCheck, Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { EmptyState, Field, formatDate, MemberSelect, panel } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type System = TrustSnapshot["systems"][number];

export function AccessReviewsSection(props: SectionProps) {
  const { snapshot, canEdit } = props;
  const [editing, setEditing] = useState<System | "new" | null>(null);
  const [reviewing, setReviewing] = useState<System | null>(null);

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Access reviews</h2>
          <p className="text-sm text-[#6d6c64]">
            List critical systems and who can access them, then sign off a review every quarter. Current quarter: {snapshot.currentQuarter}.
          </p>
        </div>
        {canEdit ? <Button className="rounded-none" onClick={() => setEditing("new")}><Plus /> Add system</Button> : null}
      </div>
      <p className="mb-3 text-xs text-[#6d6c64]">User lists are maintained by hand here; identity-provider connectors are not configured in this deployment.</p>
      {snapshot.systems.length === 0 ? (
        <EmptyState title="No systems listed.">Start with production cloud, your identity provider, source control, and the customer database.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {snapshot.systems.map((system) => {
            const last = system.reviews.at(-1);
            return (
              <article key={system.id} className="border border-[#171715] bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{system.name}</p>
                    <p className="text-xs text-[#6d6c64]">{system.users.length} users · owner {system.ownerEmail || "unassigned"}</p>
                  </div>
                  <Badge variant="outline" className={`rounded-none border-[#171715] ${system.reviewDue ? "bg-[#fff1b8]" : "bg-[#e8ff59]"}`}>
                    {system.reviewDue ? `${snapshot.currentQuarter} review due` : `${snapshot.currentQuarter} signed off`}
                  </Badge>
                </div>
                {last ? (
                  <p className="mt-2 text-xs text-[#6d6c64]">
                    Last review {last.quarter} by {last.reviewedBy} on {formatDate(last.reviewedAt)} · kept {last.kept.length}, removed {last.removed.length}
                  </p>
                ) : null}
                {canEdit ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {system.reviewDue ? (
                      <Button size="sm" className="rounded-none" onClick={() => setReviewing(system)}><ClipboardCheck /> Review {snapshot.currentQuarter}</Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditing(system)}><Pencil /> Edit users</Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {editing ? <SystemDialog key={editing === "new" ? "new" : editing.id} system={editing === "new" ? null : editing} {...props} onClose={() => setEditing(null)} /> : null}
      {reviewing ? <ReviewDialog key={reviewing.id} system={reviewing} {...props} onClose={() => setReviewing(null)} /> : null}
    </section>
  );
}

function parseUsers(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, ...role] = line.split(",");
      return { email: email.trim(), role: role.join(",").trim() };
    });
}

function SystemDialog({ system, snapshot, act, busy, onClose }: SectionProps & { system: System | null; onClose: () => void }) {
  const [name, setName] = useState(system?.name ?? "");
  const [description, setDescription] = useState(system?.description ?? "");
  const [ownerEmail, setOwnerEmail] = useState(system?.ownerEmail ?? "");
  const [users, setUsers] = useState((system?.users ?? []).map((user) => (user.role ? `${user.email}, ${user.role}` : user.email)).join("\n"));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>{system ? `Edit ${system.name}` : "Add system"}</DialogTitle>
          <DialogDescription>One user per line as &ldquo;email, role&rdquo;. Paste an export from the system&rsquo;s admin console.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="System" htmlFor="system-name"><Input id="system-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="AWS production" className="rounded-none border-[#171715]" /></Field>
          <Field label="Description" htmlFor="system-description"><Input id="system-description" value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="System owner" htmlFor="system-owner"><MemberSelect id="system-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} /></Field>
          <Field label="Users with access" htmlFor="system-users">
            <Textarea id="system-users" rows={8} value={users} onChange={(event) => setUsers(event.target.value)} placeholder={"alex@company.com, admin\nsam@company.com, read-only"} className="rounded-none border-[#171715] font-mono text-xs" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button className="rounded-none" disabled={busy || !name.trim()} onClick={async () => {
            if (await act({ action: "saveSystem", ...(system ? { systemId: system.id } : {}), name, description, ownerEmail, users: parseUsers(users) })) onClose();
          }}>Save system</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ system, snapshot, act, busy, onClose }: SectionProps & { system: System; onClose: () => void }) {
  const [remove, setRemove] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>{snapshot.currentQuarter} access review · {system.name}</DialogTitle>
          <DialogDescription>Confirm each person still needs access. Anyone you mark is removed from the list and recorded as removed in the review.</DialogDescription>
        </DialogHeader>
        {system.users.length === 0 ? (
          <p className="text-sm text-[#6d6c64]">No users listed. Add users first, or sign off an empty review if nobody has access.</p>
        ) : (
          <ul className="grid gap-1">
            {system.users.map((user) => (
              <li key={user.email}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={remove.includes(user.email)}
                    onCheckedChange={(value) => setRemove(value ? [...remove, user.email] : remove.filter((email) => email !== user.email))}
                  />
                  <span>Remove access: <strong>{user.email}</strong>{user.role ? ` · ${user.role}` : ""}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Field label="Reviewer notes" htmlFor="review-notes">
          <Textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Removed two leavers; ticket OPS-123 tracks deprovisioning." className="rounded-none border-[#171715]" />
        </Field>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Cancel</Button>
          <Button className="rounded-none" disabled={busy} onClick={async () => {
            if (await act({ action: "signOffAccessReview", systemId: system.id, removeEmails: remove, notes })) onClose();
          }}>
            Sign off: keep {system.users.length - remove.length}, remove {remove.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
