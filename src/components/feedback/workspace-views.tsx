"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Layers,
  LoaderCircle,
  Lock,
  Megaphone,
  MessageSquare,
  Plus,
  Rocket,
  Tag as TagIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { groupByInitiative, groupRoadmap } from "@/lib/feedback/model";

import { CannyImport } from "./canny-import";
import type { AdminData } from "./feedback-workspace";
import { PageHeader, SettingsSection } from "./settings-section";
import { apiJson, EmptyState, formatDate, PersonAvatar, plural, STATUS_DISPLAY, StatusBadge, TagChip, timeAgo, VoteCount } from "./shared";
import { WebhooksPanel } from "./webhooks-panel";

type ViewProps = { data: AdminData; isAdmin: boolean; reload: () => Promise<void> };

const portalPath = (tenantId: string) => `/apps/feedback/b/${tenantId}`;

function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast({ title: success });
      await reload();
      return true;
    } catch (cause) {
      toast({ title: "That didn't go through", description: (cause as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/* ----------------------------------------------------------------------------- roadmap */

export function RoadmapView({ data, isAdmin, reload, onOpenPost }: ViewProps & { onOpenPost: (postId: string) => void }) {
  const [creating, setCreating] = useState(false);
  const visible = data.posts.filter((post) => !post.hidden);
  const columns = groupRoadmap(visible);
  const { groups } = groupByInitiative(visible, data.initiatives);
  const initiativeName = new Map(data.initiatives.map((entry) => [entry.id, entry.name]));
  const tagsById = new Map(data.tags.map((tag) => [tag.id, tag]));

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-[1400px] gap-8 px-4 py-8 sm:px-6">
      <PageHeader
        title="Roadmap"
        description="What's planned, in progress and shipped. Your public portal shows the same columns, so customers can follow along."
        action={
          <>
            <Button asChild variant="outline"><Link href={`${portalPath(data.tenant.id)}`} target="_blank" rel="noopener"><Globe /> Public roadmap</Link></Button>
            {isAdmin ? <Button onClick={() => setCreating(true)}><Plus /> Release or theme</Button> : null}
          </>
        }
      />

      {groups.length ? (
        <section aria-label="Releases and themes" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <article key={group.initiative.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    {group.initiative.kind === "release" ? <Rocket className="size-3.5" /> : <Layers className="size-3.5" />}
                    {group.initiative.kind === "release" ? "Release" : "Theme"}
                    {group.initiative.targetDate ? <><span aria-hidden="true">·</span><CalendarDays className="size-3.5" />{formatDate(group.initiative.targetDate)}</> : null}
                    {!group.initiative.isPublic ? <><span aria-hidden="true">·</span><Lock className="size-3" /> Team only</> : null}
                  </p>
                  <h2 className="brand-heading mt-1 truncate text-base">{group.initiative.name}</h2>
                </div>
                <span className="text-sm font-bold tabular-nums">{group.progress}%</span>
              </div>
              <Progress value={group.progress} className="mt-3 h-2" aria-label={`${group.initiative.name}: ${group.progress}% shipped`} />
              <p className="mt-2 text-xs text-muted-foreground">{group.done} of {plural(group.total, "idea")} shipped{group.initiative.description ? ` · ${group.initiative.description}` : ""}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section aria-label="Roadmap columns" className="grid gap-4 lg:grid-cols-3">
        {columns.map((column) => (
          <div key={column.status} className="flex flex-col rounded-2xl bg-muted/70 p-3">
            <div className="flex items-center justify-between px-1 pb-3">
              <StatusBadge status={column.status} />
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{column.posts.length}</span>
            </div>
            <ul className="grid gap-2">
              {column.posts.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing {STATUS_DISPLAY[column.status].toLowerCase()} yet. Move a post here from the inbox.
                </li>
              ) : null}
              {[...column.posts].sort((a, b) => b.voteCount - a.voteCount).map((post) => (
                <li key={post.id}>
                  <button type="button" onClick={() => onOpenPost(post.id)} className="flex w-full gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-foreground/20 hover:shadow-sm">
                    <VoteCount votes={post.voteCount} className="w-11 py-1" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-bold leading-snug">{post.title}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {post.initiativeId ? <Badge variant="secondary" className="h-5 text-[11px]">{initiativeName.get(post.initiativeId)}</Badge> : null}
                        {post.tags.slice(0, 2).map((id) => { const tag = tagsById.get(id); return tag ? <TagChip key={id} tag={tag} className="h-5 text-[11px]" /> : null; })}
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{post.commentCount}</span>
                        {post.owner ? <PersonAvatar person={post.owner} people={data.people} size="xs" className="ml-auto" /> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {creating ? <InitiativeDialog data={data} reload={reload} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function InitiativeDialog({ data, reload, onClose }: { data: AdminData; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"initiative" | "release">("release");
  const [targetDate, setTargetDate] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const action = useAction(reload);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(
      () => apiJson(`/api/feedback/tenants/${data.tenant.id}/initiatives`, { method: "POST", body: JSON.stringify({ name, description, kind, targetDate: targetDate || null, isPublic }) }),
      kind === "release" ? "Release created" : "Theme created",
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Group your roadmap</DialogTitle>
            <DialogDescription>A release has a target date; a theme collects related ideas. Attach posts from each post&apos;s details.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
              <SelectTrigger className="w-full" aria-label="Kind"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="release">Release, with a target date</SelectItem><SelectItem value="initiative">Theme</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="fb-init-name">Name</Label><Input id="fb-init-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "release" ? "Winter release" : "Faster onboarding"} autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="fb-init-desc">Description</Label><Textarea id="fb-init-desc" value={description} onChange={(event) => setDescription(event.target.value)} rows={2} /></div>
          <div className="grid gap-1.5"><Label htmlFor="fb-init-date">Target date</Label><Input id="fb-init-date" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={isPublic} onCheckedChange={setIsPublic} /> Show on the public roadmap</label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={action.busy || name.trim().length < 2}>{action.busy ? <LoaderCircle className="animate-spin" /> : null} Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------------------------------------------------- changelog */

export function ChangelogView({ data, isAdmin, reload, onOpenPost }: ViewProps & { onOpenPost: (postId: string) => void }) {
  const [composing, setComposing] = useState(false);
  const postsById = new Map(data.posts.map((post) => [post.id, post]));

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-8 px-4 py-8 sm:px-6">
      <PageHeader
        title="Changelog"
        description="Close the loop: announce what shipped and link the ideas behind it, so the people who asked can see it landed."
        action={
          <>
            <Button asChild variant="outline"><Link href={`${portalPath(data.tenant.id)}?tab=changelog`} target="_blank" rel="noopener"><Globe /> Public changelog</Link></Button>
            {isAdmin ? <Button onClick={() => setComposing(true)}><Megaphone /> Announce a release</Button> : null}
          </>
        }
      />
      {data.changelog.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="Your first announcement starts here" action={isAdmin ? <Button onClick={() => setComposing(true)}>Announce a release</Button> : null}>
          Mark a post as completed, then announce it. Customers who follow your portal see what changed and why.
        </EmptyState>
      ) : (
        <ol className="relative grid gap-6 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border sm:before:left-[119px]">
          {data.changelog.map((entry) => (
            <li key={entry.id} className="relative grid gap-2 pl-7 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-8 sm:pl-0">
              <span className="absolute left-0 top-1.5 size-[15px] rounded-full border-4 border-background bg-primary sm:left-[112px]" aria-hidden="true" />
              <time className="pt-0.5 text-sm font-semibold text-muted-foreground" dateTime={entry.publishedAt ?? undefined}>{formatDate(entry.publishedAt)}</time>
              <article className="rounded-2xl border border-border bg-card p-5 sm:ml-6">
                <h2 className="brand-heading text-lg">{entry.title}</h2>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <PersonAvatar person={entry.author} people={data.people} size="xs" />
                  {data.people[entry.author.uid]?.name || entry.author.name}
                </p>
                {entry.body ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">{entry.body}</p> : null}
                {entry.postIds.length ? (
                  <ul className="mt-4 grid gap-1.5">
                    {entry.postIds.map((id) => {
                      const post = postsById.get(id);
                      return post ? (
                        <li key={id}>
                          <button type="button" onClick={() => onOpenPost(post.id)} className="flex w-full items-center gap-2 rounded-lg bg-secondary/70 px-3 py-2 text-left text-sm hover:bg-secondary">
                            <Check className="size-4 text-primary" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate font-medium">{post.title}</span>
                            <span className="text-xs text-muted-foreground">{plural(post.voteCount, "vote")}</span>
                          </button>
                        </li>
                      ) : null;
                    })}
                  </ul>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      )}
      {composing ? <ChangelogDialog data={data} reload={reload} onClose={() => setComposing(false)} /> : null}
    </div>
  );
}

function ChangelogDialog({ data, reload, onClose }: { data: AdminData; reload: () => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const action = useAction(reload);
  const announced = new Set(data.changelog.flatMap((entry) => entry.postIds));
  const completed = data.posts.filter((post) => post.status === "completed" && !post.hidden).sort((a, b) => Number(announced.has(a.id)) - Number(announced.has(b.id)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(
      () => apiJson(`/api/feedback/tenants/${data.tenant.id}/changelog`, { method: "POST", body: JSON.stringify({ title, body, postIds: selected }) }),
      "Published on your portal",
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Announce a release</DialogTitle>
            <DialogDescription>Published straight to your public changelog. Link the completed ideas it delivers.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="fb-cl-title">Title</Label><Input id="fb-cl-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Offline mode is here" autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="fb-cl-body">What changed</Label><Textarea id="fb-cl-body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} /></div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Completed ideas in this release</legend>
            {completed.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is marked completed yet.</p> : null}
            {completed.map((post) => (
              <label key={post.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm">
                <Checkbox
                  checked={selected.includes(post.id)}
                  onCheckedChange={(checked) => setSelected((current) => (checked ? [...current, post.id] : current.filter((id) => id !== post.id)))}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{post.title}</span>
                  <span className="block text-xs text-muted-foreground">{plural(post.voteCount, "vote")}{announced.has(post.id) ? " · already announced" : ""}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={action.busy || title.trim().length < 3}>{action.busy ? <LoaderCircle className="animate-spin" /> : null} Publish</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------ boards */

export function BoardsView({ data, isAdmin, reload, creating, onCreatingChange }: ViewProps & { creating: boolean; onCreatingChange: (open: boolean) => void }) {
  const action = useAction(reload);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(boardId: string, path: string) {
    void navigator.clipboard?.writeText(`${window.location.origin}${path}`).then(() => {
      setCopied(boardId);
      window.setTimeout(() => setCopied(null), 1800);
    });
  }

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-6xl gap-8 px-4 py-8 sm:px-6">
      <PageHeader
        title="Boards"
        description="Each board collects one kind of feedback. Public boards can be read by anyone with the link; posting and voting need a free account."
        action={isAdmin ? <Button onClick={() => onCreatingChange(true)}><Plus /> New board</Button> : null}
      />
      {data.boards.length === 0 ? (
        <EmptyState icon={<Layers />} title="Create a board to start listening" action={isAdmin ? <Button onClick={() => onCreatingChange(true)}>New board</Button> : null}>
          Start with &ldquo;Feature requests&rdquo;, share the link in your app or help center, and watch the first votes come in.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.boards.map((board) => {
            const path = `/apps/feedback/b/${data.tenant.id}/${board.slug}`;
            const posts = data.posts.filter((post) => post.boardId === board.id && !post.hidden);
            const votes = posts.reduce((sum, post) => sum + post.voteCount, 0);
            return (
              <article key={board.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Layers className="size-5" /></span>
                  <Badge variant={board.isPublic ? "secondary" : "outline"}>{board.isPublic ? <><Globe /> Public</> : <><Lock /> Private</>}</Badge>
                </div>
                <h2 className="brand-heading mt-4 text-lg">{board.name}</h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{board.description || "No description yet."}</p>
                <p className="mt-4 text-sm font-semibold">{plural(posts.length, "idea")} · {plural(votes, "vote")}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <label className="mr-auto flex items-center gap-2 text-sm">
                    <Switch
                      checked={board.isPublic}
                      disabled={!isAdmin || action.busy}
                      onCheckedChange={(checked) => void action.run(
                        () => apiJson(`/api/feedback/tenants/${data.tenant.id}/boards/${board.id}`, { method: "PATCH", body: JSON.stringify({ isPublic: checked }) }),
                        checked ? `${board.name} is public` : `${board.name} is private`,
                      )}
                      aria-label={`${board.name} is public`}
                    />
                    Public
                  </label>
                  {board.isPublic ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => copy(board.id, path)}>{copied === board.id ? <Check /> : <Copy />} {copied === board.id ? "Copied" : "Copy link"}</Button>
                      <Button asChild size="sm" variant="outline"><Link href={path} target="_blank" rel="noopener">Open <ExternalLink /></Link></Button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {creating ? <BoardDialog data={data} reload={reload} onClose={() => onCreatingChange(false)} /> : null}
    </div>
  );
}

function BoardDialog({ data, reload, onClose }: { data: AdminData; reload: () => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const action = useAction(reload);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run(
      () => apiJson(`/api/feedback/tenants/${data.tenant.id}/boards`, { method: "POST", body: JSON.stringify({ name, description, isPublic }) }),
      "Board created. Share its link to start collecting ideas.",
    );
    if (ok) onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
            <DialogDescription>Boards keep different kinds of feedback apart, like feature requests and bug reports.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5"><Label htmlFor="fb-board-name">Name</Label><Input id="fb-board-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Feature requests" autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="fb-board-desc">Description</Label><Textarea id="fb-board-desc" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Tell us what would make the product better for you." /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={isPublic} onCheckedChange={setIsPublic} /> Anyone with the link can read it</label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={action.busy || name.trim().length < 2}>{action.busy ? <LoaderCircle className="animate-spin" /> : null} Create board</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------- settings */

const ACTIVITY: Record<string, string> = {
  "post.created": "posted",
  "post.status_changed": "changed the status of",
  "post.merged": "merged",
  "post.unmerged": "unmerged",
  "post.tagged": "tagged",
  "post.assigned": "assigned",
  "post.edited": "edited the wording of",
  "post.initiative_set": "regrouped",
  "post.hidden": "hid",
  "post.restored": "restored",
  "comment.created": "commented on",
  "comment.hidden": "hid a comment",
  "comment.restored": "restored a comment",
  "note.created": "added a team note to",
  "vote.added": "voted for",
  "vote.removed": "removed their vote from",
  "board.created": "created a board",
  "board.updated": "updated a board",
  "tag.created": "created a tag",
  "changelog.published": "published a changelog entry",
  "initiative.created": "created a release or theme",
  "profile.updated": "updated a customer's details",
  "webhook.created": "added a webhook",
  "webhook.enabled": "resumed a webhook",
  "webhook.disabled": "paused a webhook",
  "import.committed": "imported from Canny",
  "export.downloaded": "downloaded an export",
};

function describeActivity(action: string) {
  return ACTIVITY[action] ?? action.replace(/[._]/g, " ");
}

export function SettingsView({ data, isAdmin, reload }: ViewProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0E9384");
  const [isPublic, setIsPublic] = useState(true);
  const action = useAction(reload);
  const postsById = useMemo(() => new Map(data.posts.map((post) => [post.id, post])), [data.posts]);
  const membersByUid = useMemo(() => new Map(data.members.map((member) => [member.uid, member])), [data.members]);

  function createTag(event: FormEvent) {
    event.preventDefault();
    void action.run(
      () => apiJson(`/api/feedback/tenants/${data.tenant.id}/tags`, { method: "POST", body: JSON.stringify({ name, color, isPublic }) }),
      "Tag created",
    ).then((ok) => ok && setName(""));
  }

  return (
    <div className="mx-auto grid w-full grid-cols-1 max-w-4xl gap-6 px-4 py-8 sm:px-6">
      <PageHeader title="Settings" description="Tags, moving your data in and out, connections to your other tools, and a record of every change." />

      <SettingsSection title="Tags" description="Group ideas by area. Team-only tags never appear on public boards.">
        <div className="flex flex-wrap gap-2">
          {data.tags.length === 0 ? <p className="text-sm text-muted-foreground">No tags yet.</p> : null}
          {data.tags.map((tag) => (
            <span key={tag.id} className="inline-flex items-center gap-1.5">
              <TagChip tag={tag} />
              <span className="text-xs text-muted-foreground">{tag.isPublic ? "" : "Team only · "}{data.posts.filter((post) => post.tags.includes(tag.id)).length}</span>
            </span>
          ))}
        </div>
        {isAdmin ? (
          <form className="mt-5 flex flex-wrap items-end gap-3 border-t border-border pt-5" onSubmit={createTag}>
            <div className="grid gap-1.5"><Label htmlFor="fb-tag-name">New tag</Label><Input id="fb-tag-name" className="w-52" value={name} onChange={(event) => setName(event.target.value)} placeholder="Mobile" /></div>
            <div className="grid gap-1.5"><Label htmlFor="fb-tag-color">Colour</Label><Input id="fb-tag-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} className="h-9 w-14 p-1" /></div>
            <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={isPublic} onCheckedChange={setIsPublic} /> Public</label>
            <Button type="submit" disabled={action.busy || !name.trim()}><TagIcon /> Add tag</Button>
          </form>
        ) : null}
      </SettingsSection>

      <SettingsSection
        title="Export everything"
        description="Download every board, post, vote, comment, tag, changelog entry and audit event as versioned JSON, or only the Fider-compatible mapping to move to Fider."
      >
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild><a href={`/api/feedback/tenants/${data.tenant.id}/export`} download><Download /> Full export</a></Button>
            <Button asChild variant="outline"><a href={`/api/feedback/tenants/${data.tenant.id}/export?format=fider`} download><Download /> Fider format</a></Button>
          </div>
        ) : <p className="text-sm text-muted-foreground">Owners and admins can export.</p>}
      </SettingsSection>

      <CannyImport tenantId={data.tenant.id} isAdmin={isAdmin} onImported={reload} />
      <WebhooksPanel tenantId={data.tenant.id} isAdmin={isAdmin} />

      <SettingsSection title="Activity" description="Every change in this workspace, newest first. Entries can't be edited or deleted.">
        {data.audit.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has happened yet.</p> : (
          <ol className="grid divide-y divide-border">
            {data.audit.slice(0, 60).map((event) => {
              const uid = event.actor?.uid ?? "";
              const person = data.people[uid];
              const member = membersByUid.get(uid);
              const name = person?.name || member?.name || event.actor?.email || "Someone";
              const post = event.target?.type === "post" ? postsById.get(event.target.id) : undefined;
              return (
                <li key={event.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <PersonAvatar person={{ uid, name }} people={data.people} size="sm" />
                  <p className="min-w-0 flex-1">
                    <strong>{name}</strong> {describeActivity(event.action)}
                    {post ? <span className="font-medium"> &ldquo;{post.title}&rdquo;</span> : null}
                    {event.action === "post.status_changed" && typeof event.details?.to === "string" ? <span className="text-muted-foreground"> to {STATUS_DISPLAY[event.details.to as keyof typeof STATUS_DISPLAY] ?? event.details.to}</span> : null}
                  </p>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurredAt ?? undefined}>{timeAgo(event.occurredAt)}</time>
                </li>
              );
            })}
          </ol>
        )}
      </SettingsSection>
    </div>
  );
}
