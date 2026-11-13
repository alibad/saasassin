"use client";

import { useState } from "react";
import { ClipboardCheck, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { displayName, EmailAvatar, EmptyState, Field, formatDate, MemberSelect, PageHeader, panel, PersonCell, Pill } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type System = TrustSnapshot["systems"][number];

export function AccessReviewsSection(props: SectionProps) {
  const { snapshot, canEdit } = props;
  const [editing, setEditing] = useState<System | "new" | null>(null);
  const [reviewing, setReviewing] = useState<System | null>(null);

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title="Access reviews"
        description={<>List your critical systems and who can get in, then sign off a review each quarter. Current quarter: <span className="font-mono">{snapshot.currentQuarter}</span>. User lists are kept by hand for now; syncing them from your identity provider isn&apos;t connected yet.</>}
        action={canEdit ? <Button onClick={() => setEditing("new")}><Plus /> Add system</Button> : null}
      />
      {snapshot.systems.length === 0 ? (
        <EmptyState title="Start with the systems that matter most">Production cloud, your identity provider, source control and the customer database cover most of what auditors ask about.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {snapshot.systems.map((system) => {
            const last = system.reviews.at(-1);
            return (
              <article key={system.id} className={`${panel} flex flex-col`}>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{system.name}</p>
                    {system.description ? <p className="text-xs text-muted-foreground">{system.description}</p> : null}
                  </div>
                  <Pill tone={system.reviewDue ? "warning" : "positive"}>
                    {system.reviewDue ? `${snapshot.currentQuarter} review due` : `${snapshot.currentQuarter} signed off`}
                  </Pill>
                </div>
                <div className="grid flex-1 gap-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <PersonCell snapshot={snapshot} email={system.ownerEmail} detail="System owner" />
                    <span className="flex items-center gap-2">
                      <span className="flex -space-x-1.5">
                        {system.users.slice(0, 5).map((user) => <EmailAvatar key={user.email} snapshot={snapshot} email={user.email} size="xs" className="ring-2 ring-card" />)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{system.users.length} users</span>
                    </span>
                  </div>
                  {last ? (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{last.quarter}</span> reviewed by {displayName(snapshot, last.reviewedBy)} on {formatDate(last.reviewedAt)}: kept {last.kept.length}, removed {last.removed.length}
                    </p>
                  ) : <p className="text-xs text-muted-foreground">Never reviewed.</p>}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                    {system.reviewDue ? (
                      <Button size="sm" onClick={() => setReviewing(system)}><ClipboardCheck /> Review {snapshot.currentQuarter}</Button>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setEditing(system)}><Pencil /> Edit users</Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {editing ? <SystemDialog key={editing === "new" ? "new" : editing.id} system={editing === "new" ? null : editing} {...props} onClose={() => setEditing(null)} /> : null}
      {reviewing ? <ReviewDialog key={reviewing.id} system={reviewing} {...props} onClose={() => setReviewing(null)} /> : null}
    </div>
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{system ? `Edit ${system.name}` : "Add system"}</DialogTitle>
          <DialogDescription>One user per line as &ldquo;email, role&rdquo;. Paste an export from the system&rsquo;s admin console.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="System" htmlFor="system-name"><Input id="system-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="AWS production" /></Field>
          <Field label="Description" htmlFor="system-description"><Input id="system-description" value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Field label="System owner" htmlFor="system-owner"><MemberSelect id="system-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} /></Field>
          <Field label="Users with access" htmlFor="system-users">
            <Textarea id="system-users" rows={8} value={users} onChange={(event) => setUsers(event.target.value)} placeholder={"alex@company.com, admin\nsam@company.com, read-only"} className="font-mono text-xs" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !name.trim()} onClick={async () => {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{snapshot.currentQuarter} access review · {system.name}</DialogTitle>
          <DialogDescription>Confirm each person still needs access. Anyone you mark is removed from the list and recorded as removed in the review.</DialogDescription>
        </DialogHeader>
        {system.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users listed. Add users first, or sign off an empty review if nobody has access.</p>
        ) : (
          <ul className="grid gap-1">
            {system.users.map((user) => (
              <li key={user.email}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={remove.includes(user.email)}
                    onCheckedChange={(value) => setRemove(value ? [...remove, user.email] : remove.filter((email) => email !== user.email))}
                  />
                  <EmailAvatar snapshot={snapshot} email={user.email} size="xs" />
                  <span>Remove access: <strong className="font-medium">{displayName(snapshot, user.email)}</strong>{user.role ? <span className="text-muted-foreground"> · {user.role}</span> : null}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <Field label="Reviewer notes" htmlFor="review-notes">
          <Textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Removed two leavers; ticket OPS-123 tracks deprovisioning." />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            if (await act({ action: "signOffAccessReview", systemId: system.id, removeEmails: remove, notes })) onClose();
          }}>
            Sign off: keep {system.users.length - remove.length}, remove {remove.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
