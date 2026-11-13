"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Copy, Download, Flag, Hash, History, Link2, LoaderCircle, Plus, RefreshCw, Settings2, Shield, ShieldCheck, UsersRound } from "lucide-react";

import { TeamPanel } from "@/components/account/team-panel";
import { UserAvatar } from "@/components/account/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isManager, type CommunityAction, type SpaceKind, type SpaceVisibility } from "@/lib/community/model";
import { cn } from "@/lib/utils";

import { api, personFor, surface, timeAgo, type PeopleIndex, type Workspace, type WorkspaceSpace } from "./api";
import { CircleImportCard } from "./import-panel";
import { spaceIcon, ViewHeader } from "./shell";

type Act = (action: CommunityAction, success?: string) => Promise<unknown>;
type AuditEvent = { id: string; action: string; actor: { uid?: string; email: string }; target: { type: string; id: string }; occurredAt: string | null; details: Record<string, unknown> };

function Panel({ icon: Icon, title, description, actions, children, className }: { icon: typeof Flag; title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(surface, "grid content-start gap-4 p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Icon className="size-5 text-primary" aria-hidden="true" /> {title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  "post.created": "posted",
  "comment.created": "replied",
  "reaction.added": "reacted",
  "reaction.removed": "took back a reaction",
  "post.pinned": "pinned a post",
  "post.unpinned": "unpinned a post",
  "post.removed": "removed a post",
  "post.restored": "restored a post",
  "comment.removed": "removed a reply",
  "report.created": "reported a post",
  "membership.joined_via_invite": "joined with the invite link",
  "membership.role_changed": "changed someone's role",
  "membership.removed": "removed a member",
  "invitation.accepted": "accepted an invitation",
  "invitation.created": "invited someone",
  "rsvp.set": "RSVP'd to an event",
  "space.created": "created a space",
  "space.updated": "updated a space",
  "export.downloaded": "downloaded the community",
};

/* ---------------------------------------------------------------------------------------- */

export function ModerationPanel({ tenantId, workspace, people, act, onOpenPost, onError }: { tenantId: string; workspace: Workspace; people: PeopleIndex; act: Act; onOpenPost: (postId: string) => void; onError: (message: string) => void }) {
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);

  async function loadAudit() {
    try {
      const { events } = await api<{ events: AuditEvent[] }>(`/api/community/tenants/${tenantId}/audit`);
      setAudit(events);
    } catch (error) {
      onError(error instanceof Error ? error.message : "The activity log couldn't be loaded.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    api<{ events: AuditEvent[] }>(`/api/community/tenants/${tenantId}/audit`)
      .then(({ events }) => { if (!cancelled) setAudit(events); })
      .catch(() => { if (!cancelled) setAudit([]); });
    return () => { cancelled = true; };
  }, [tenantId]);

  return (
    <>
      <ViewHeader icon={ShieldCheck} title="Moderation" description="Reports and appeals waiting for a decision, and a log of everything that happens here." />
      <div className="grid gap-5">
        <Panel icon={Flag} title="Reports" description="Posts members flagged. Remove the post or dismiss the report; either way it's logged." actions={workspace.reports.length ? <Badge variant="destructive">{workspace.reports.length} open</Badge> : null}>
          {workspace.reports.length === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">All clear. Nothing has been reported.</p>
          ) : (
            <ul className="grid gap-3">
              {workspace.reports.map((report) => (
                <li key={report.id} className="flex flex-col gap-3 rounded-2xl bg-brand-subtle p-4 ring-1 ring-border sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <button type="button" className="font-semibold hover:text-primary" onClick={() => onOpenPost(report.postId)}>{report.postTitle}</button>
                    <p className="mt-1 text-sm">“{report.reason}”</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserAvatar person={personFor(people, report.reporterUid, report.reporterName)} size="xs" /> {report.reporterName} · {timeAgo(report.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void act({ type: "report.resolve", reportId: report.id, resolution: "actioned", note: "" }, "Post removed and report closed.").catch(() => undefined)}>Remove post</Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => void act({ type: "report.resolve", reportId: report.id, resolution: "dismissed", note: "" }, "Report dismissed.").catch(() => undefined)}>Dismiss</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={Shield} title="Appeals" description="Authors can appeal a removal once. You can't decide an appeal about your own decision." actions={workspace.appeals.length ? <Badge variant="destructive">{workspace.appeals.length} open</Badge> : null}>
          {workspace.appeals.length === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">No appeals waiting.</p>
          ) : (
            <ul className="grid gap-3">
              {workspace.appeals.map((appeal) => (
                <li key={appeal.id} className="flex flex-col gap-3 rounded-2xl bg-brand-subtle p-4 ring-1 ring-border sm:flex-row sm:items-center">
                  <UserAvatar person={personFor(people, appeal.authorUid, appeal.authorName)} size="lg" />
                  <div className="min-w-0 flex-1">
                    <button type="button" className="font-semibold hover:text-primary" onClick={() => onOpenPost(appeal.postId)}>{appeal.postTitle}</button>
                    <p className="text-xs text-muted-foreground">Removed for: {appeal.removedReason ?? "no reason given"}</p>
                    <p className="mt-1 text-sm">“{appeal.message}” — {appeal.authorName}, {timeAgo(appeal.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="rounded-full" onClick={() => void act({ type: "appeal.resolve", appealId: appeal.id, decision: "reinstated", note: "" }, "Post reinstated.").catch(() => undefined)}>Reinstate</Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => void act({ type: "appeal.resolve", appealId: appeal.id, decision: "upheld", note: "" }, "Removal upheld.").catch(() => undefined)}>Keep removed</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={History}
          title="Activity log"
          description={isManager(workspace.me.role) ? "Every join, post, reaction, RSVP, moderation action, role change and export." : "Every join, post, moderation action and role change. Moderators see names, not emails."}
          actions={<Button size="sm" variant="outline" className="rounded-full" onClick={() => void loadAudit()}><RefreshCw /> Refresh</Button>}
        >
          {audit === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading</p>
          ) : audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ol className="grid max-h-[28rem] gap-0 overflow-y-auto">
              {audit.map((event, index) => {
                const person = event.actor?.uid ? people.get(event.actor.uid) : undefined;
                return (
                  <li key={event.id} className={cn("flex items-start gap-3 py-2.5 text-sm", index && "border-t border-border")}>
                    <UserAvatar person={{ uid: event.actor?.uid ?? event.id, name: person?.displayName || event.actor?.email, photoURL: person?.photoURL ?? null }} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{person?.displayName || event.actor?.email}</span>{" "}
                      <span className="text-muted-foreground">{AUDIT_LABELS[event.action] ?? event.action.replace(/[._]/g, " ")}</span>
                      {typeof event.details?.reason === "string" && event.details.reason ? <span className="block text-xs text-muted-foreground">Reason: {event.details.reason}</span> : null}
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">{timeAgo(event.occurredAt)}</time>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

/**
 * People and invitations, in one place:
 * - the community's invite link, for members (anyone with it joins as a member);
 * - the shared team panel, for everyone in the community with their role: email invitations
 *   (also to people without an account), role changes, removal, leaving and ownership transfer.
 * Owners and admins see emails here; nobody else ever does.
 */
export function PeoplePanel({ tenantId, workspace, act, onLeft, onNotice }: { tenantId: string; workspace: Workspace; act: Act; onLeft: () => void; onNotice: (message: string) => void }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the invite link needs the browser origin
    setOrigin(window.location.origin);
  }, []);
  const inviteUrl = workspace.invite?.code ? `${origin}/apps/community/join/${tenantId}/${workspace.invite.code}` : "";
  const pending = workspace.migration?.pendingInvites ?? [];

  return (
    <>
      <ViewHeader icon={UsersRound} title="People & invites" description="Share the invite link with members. Invite moderators and admins by email, even if they don't have an account yet." />
      <div className="grid gap-5">
        <Panel icon={Link2} title="Invite link for members" description="Anyone with this link can join as a member. Turn it off or replace it at any time; old links stop working.">
          {workspace.invite?.enabled && inviteUrl ? (
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(event) => event.target.select()} className="h-10 rounded-full bg-muted font-mono text-xs" />
              <Button className="h-10 rounded-full" onClick={() => void navigator.clipboard?.writeText(inviteUrl).then(() => onNotice("Invite link copied."))}><Copy /> Copy</Button>
            </div>
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">The invite link is off. Nobody can join with an old link.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={workspace.invite?.enabled ?? false} onCheckedChange={(checked) => void act({ type: "invite.toggle", enabled: checked }, checked ? "The invite link is on." : "The invite link is off.").catch(() => undefined)} />
              Let new members join with the link
            </label>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => void act({ type: "invite.rotate" }, "New invite link created. The old one no longer works.").catch(() => undefined)}><RefreshCw /> New link</Button>
          </div>
        </Panel>

        <TeamPanel product="community" productName="Community" tenantId={tenantId} onLeft={onLeft} />

        {pending.length ? (
          <Panel icon={UsersRound} title="Imported from Circle, not joined yet" description="Send them the invite link. When they join with the same email, their profile and imported posts become theirs. Only owners and admins see these emails.">
            <ul className="grid gap-2 sm:grid-cols-2">
              {pending.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2">
                  <UserAvatar person={{ uid: invite.id, name: invite.name || invite.email, email: invite.email }} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{invite.name || "No name"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{invite.email}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------------------------- */

export function SettingsPanel({ tenantId, workspace, act, onNotice, refresh }: { tenantId: string; workspace: Workspace; act: Act; onNotice: (message: string) => void; refresh: () => Promise<void> }) {
  const [spaceDialog, setSpaceDialog] = useState<{ mode: "create" } | { mode: "edit"; space: WorkspaceSpace } | null>(null);
  return (
    <>
      <ViewHeader icon={Settings2} title="Settings" description="Spaces, posting limits, moving over from Circle, and taking your community with you." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          icon={Hash}
          title="Spaces"
          description="Where conversations happen, in the order members see them. Private spaces are visible only to the people and cohorts you choose."
          className="lg:col-span-2"
          actions={<Button size="sm" className="rounded-full" onClick={() => setSpaceDialog({ mode: "create" })}><Plus /> New space</Button>}
        >
          {workspace.spaces.length === 0 ? <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">Start with a welcome space where new members introduce themselves.</p> : null}
          <ul className="grid gap-2">
            {workspace.spaces.map((space, index) => {
              const Icon = spaceIcon[space.kind];
              return (
                <li key={space.id} className="flex items-center gap-3 rounded-2xl bg-brand-subtle px-3 py-2.5 ring-1 ring-border">
                  <span className="grid size-9 place-items-center rounded-xl bg-card text-primary"><Icon className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{space.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {space.kind} · {space.visibility === "private" ? `private (${space.memberUids.length} ${space.memberUids.length === 1 ? "person" : "people"}${space.cohortIds.length ? ` + ${space.cohortIds.length} cohort${space.cohortIds.length === 1 ? "" : "s"}` : ""})` : "all members"}
                    </p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${space.name} up`} disabled={index === 0} onClick={() => void act({ type: "space.move", spaceId: space.id, direction: "up" }).catch(() => undefined)}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${space.name} down`} disabled={index === workspace.spaces.length - 1} onClick={() => void act({ type: "space.move", spaceId: space.id, direction: "down" }).catch(() => undefined)}><ArrowDown /></Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setSpaceDialog({ mode: "edit", space })}>Edit</Button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <PostingLimitCard workspace={workspace} act={act} />

        <Panel icon={Download} title="Download your community" description="Everything in one versioned JSON file: spaces, posts, replies, events, members, plans, courses and the activity log.">
          <Button asChild className="w-fit rounded-full"><a href={`/api/community/tenants/${tenantId}/export`} download><Download /> Download</a></Button>
        </Panel>

        <CircleImportCard
          tenantId={tenantId}
          workspace={workspace}
          onDone={async (message) => {
            onNotice(message);
            await refresh();
          }}
        />
      </div>

      {spaceDialog ? (
        <SpaceDialog
          key={spaceDialog.mode === "edit" ? spaceDialog.space.id : "new"}
          initial={spaceDialog.mode === "edit" ? spaceDialog.space : null}
          members={workspace.members}
          cohorts={workspace.cohorts}
          onClose={() => setSpaceDialog(null)}
          onSubmit={async (space) => {
            await act(
              spaceDialog.mode === "edit" ? { type: "space.update", spaceId: spaceDialog.space.id, space } : { type: "space.create", space },
              spaceDialog.mode === "edit" ? "Space updated." : "Space created.",
            );
            setSpaceDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

function SpaceDialog({
  initial,
  members,
  cohorts,
  onClose,
  onSubmit,
}: {
  initial: WorkspaceSpace | null;
  members: Workspace["members"];
  cohorts: Workspace["cohorts"];
  onClose: () => void;
  onSubmit: (space: { name: string; description: string; kind: SpaceKind; visibility: SpaceVisibility; memberUids: string[]; cohortIds: string[] }) => Promise<void>;
}) {
  const [cohortIds, setCohortIds] = useState<string[]>(initial?.cohortIds ?? []);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<SpaceKind>(initial?.kind ?? "discussion");
  const [visibility, setVisibility] = useState<SpaceVisibility>(initial?.visibility ?? "members");
  const [memberUids, setMemberUids] = useState<string[]>(initial?.memberUids ?? []);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSubmit({ name, description, kind, visibility, memberUids: visibility === "private" ? memberUids : [], cohortIds: visibility === "private" ? cohortIds : [] }).catch(() => undefined);
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle className="brand-heading text-2xl">{initial ? "Edit space" : "New space"}</DialogTitle>
            <DialogDescription>Private spaces are visible only to the people and cohorts you choose, plus owners and admins.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input id="space-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required className="rounded-xl" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="space-description">Description</Label>
            <Input id="space-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} className="rounded-xl" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(value) => setKind((value as SpaceKind) ?? "discussion")}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discussion">Discussion</SelectItem>
                  <SelectItem value="announcements">Announcements</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Who can see it</Label>
              <Select value={visibility} onValueChange={(value) => setVisibility((value as SpaceVisibility) ?? "members")}>
                <SelectTrigger className="w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="members">Every member</SelectItem>
                  <SelectItem value="private">Only people I choose</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {visibility === "private" ? (
            <fieldset className="grid max-h-60 gap-2 overflow-y-auto rounded-2xl bg-muted p-3">
              <legend className="px-1 text-sm font-semibold">People with access</legend>
              {members.map((member) => (
                <label key={member.uid} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={memberUids.includes(member.uid)} onCheckedChange={(checked) => setMemberUids((current) => (checked ? [...current, member.uid] : current.filter((uid) => uid !== member.uid)))} />
                  <UserAvatar person={{ uid: member.uid, name: member.displayName, photoURL: member.photoURL }} size="xs" />
                  {member.displayName} {member.handle ? <span className="text-xs text-muted-foreground">@{member.handle}</span> : null}
                </label>
              ))}
            </fieldset>
          ) : null}
          {visibility === "private" && cohorts.length ? (
            <fieldset className="grid gap-2 rounded-2xl bg-muted p-3">
              <legend className="px-1 text-sm font-semibold">Cohorts with access</legend>
              {cohorts.map((cohort) => (
                <label key={cohort.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={cohortIds.includes(cohort.id)} onCheckedChange={(checked) => setCohortIds((current) => (checked ? [...current, cohort.id] : current.filter((id) => id !== cohort.id)))} />
                  {cohort.name} <span className="text-xs text-muted-foreground">starts {cohort.startsAt.slice(0, 10)} · {cohort.memberUids.length} people</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="rounded-full" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null} {initial ? "Save" : "Create space"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PostingLimitCard({ workspace, act }: { workspace: Workspace; act: Act }) {
  const limit = workspace.safety.postingLimit;
  const [max, setMax] = useState(String(limit.max));
  const parsed = Number(max);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;
  return (
    <Panel icon={Shield} title="Posting limit" description={`How many posts and replies one member can publish in ${limit.windowMinutes} minutes. Moderators and admins are exempt; the first time someone hits it is logged.`}>
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void act({ type: "settings.posting_limit", max: parsed }, `Members can now post ${parsed} times per ${limit.windowMinutes} minutes.`).catch(() => undefined);
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="posting-limit">Per {limit.windowMinutes} minutes</Label>
          <Input id="posting-limit" type="number" min={1} max={100} value={max} onChange={(event) => setMax(event.target.value)} className="w-28 rounded-xl" aria-invalid={!valid} />
        </div>
        <Button type="submit" variant="outline" className="rounded-full" disabled={!valid || parsed === limit.max}>Save</Button>
      </form>
      {!valid ? <p className="text-xs text-destructive" role="alert">Enter a whole number from 1 to 100.</p> : null}
    </Panel>
  );
}
