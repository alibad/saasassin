"use client";

import { useState, type FormEvent } from "react";
import { Bookmark, BookmarkCheck, CalendarDays, Lightbulb, LoaderCircle, MapPin, MessageCircle, PartyPopper, Pin, ThumbsUp } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REACTION_LABELS, REACTION_TYPES, type CommunityAction, type ReactionType } from "@/lib/community/model";
import { cn } from "@/lib/utils";

import { personFor, ROLE_LABELS, surface, timeAgo, type PeopleIndex, type Workspace, type WorkspacePost, type WorkspaceSpace } from "./api";
import { spaceIcon } from "./shell";

const REACTION_ICONS: Record<ReactionType, typeof ThumbsUp> = { like: ThumbsUp, celebrate: PartyPopper, insightful: Lightbulb };

/** "Hey @maya" → the handle in the brand colour. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@[a-z0-9_-]{3,30})/g);
  return (
    <p className={cn("whitespace-pre-line", className)}>
      {parts.map((part, index) => (part.startsWith("@") && index % 2 === 1 ? <span key={index} className="font-medium text-primary">{part}</span> : part))}
    </p>
  );
}

export function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const date = new Date(iso);
  return (
    <div className={cn("grid h-fit w-14 shrink-0 place-items-center self-start rounded-xl bg-primary py-1.5 text-primary-foreground", className)}>
      <span className="text-[10px] font-semibold tracking-wide uppercase">{date.toLocaleDateString(undefined, { month: "short" })}</span>
      <span className="brand-heading text-2xl leading-none">{date.getDate()}</span>
    </div>
  );
}

/** One post in a feed: who, where, when, what, and the reactions. */
export function PostCard({
  post,
  space,
  people,
  reacted,
  saved,
  onSave,
  onOpen,
  onReact,
}: {
  post: WorkspacePost;
  space?: WorkspaceSpace;
  people: PeopleIndex;
  reacted: Set<string>;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onReact: (reaction: ReactionType) => void;
}) {
  const author = personFor(people, post.authorUid, post.authorName);
  const member = people.get(post.authorUid);
  const role = member && member.role !== "member" ? ROLE_LABELS[member.role] : null;
  const SpaceIcon = space ? spaceIcon[space.kind] : null;
  return (
    <article className={cn(surface, "p-5 transition hover:ring-primary/25", post.removed && "opacity-60")}>
      <div className="flex items-start gap-3">
        <UserAvatar person={author} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm leading-tight">
            <span className="font-semibold">{author.name}</span>
            {member?.handle ? <span className="text-muted-foreground">@{member.handle}</span> : null}
            {role ? <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px]">{role}</Badge> : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {space && SpaceIcon ? <span className="inline-flex items-center gap-1"><SpaceIcon className="size-3" aria-hidden="true" /> {space.name}</span> : null}
            {space ? <span aria-hidden="true">·</span> : null}
            <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            {post.commentsClosed ? <><span aria-hidden="true">·</span> comments closed</> : null}
          </p>
        </div>
        {post.pinned ? <Pin className="size-4 shrink-0 text-primary" aria-label="Pinned" /> : null}
      </div>
      {post.removed ? <Badge variant="destructive" className="mt-3">Removed{post.removedReason ? `: ${post.removedReason}` : ""}</Badge> : null}
      <button type="button" onClick={onOpen} className="mt-3 block w-full text-left">
        <h3 className="font-heading text-lg leading-snug font-semibold hover:text-primary">{post.title}</h3>
        {post.event ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-primary">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" /> {new Date(post.event.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            {post.event.location ? <span className="inline-flex items-center gap-1.5 text-muted-foreground"><MapPin className="size-4" aria-hidden="true" /> {post.event.location}</span> : null}
          </p>
        ) : null}
        <RichText text={post.body} className="mt-1.5 line-clamp-4 text-[15px] leading-relaxed text-foreground/85" />
      </button>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {REACTION_TYPES.map((reaction) => {
          const active = reacted.has(`${post.id}:${reaction}`);
          const Icon = REACTION_ICONS[reaction];
          const count = post.reactionCounts?.[reaction] ?? 0;
          return (
            <button
              key={reaction}
              type="button"
              aria-pressed={active}
              aria-label={`${REACTION_LABELS[reaction]}${count ? ` (${count})` : ""}`}
              disabled={post.removed}
              onClick={() => onReact(reaction)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition disabled:opacity-50",
                active ? "bg-primary/10 text-primary ring-primary/35" : "bg-background text-muted-foreground ring-border hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {count ? <span className="tabular-nums">{count}</span> : <span className="hidden sm:inline">{REACTION_LABELS[reaction]}</span>}
            </button>
          );
        })}
        <Button size="sm" variant="ghost" className="ml-auto h-8 rounded-full text-muted-foreground" onClick={onOpen}>
          <MessageCircle aria-hidden="true" /> {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}
        </Button>
        <Button size="icon-sm" variant="ghost" className="size-8 rounded-full text-muted-foreground" aria-pressed={saved} aria-label={saved ? "Saved" : "Save"} onClick={onSave} disabled={post.removed}>
          {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
        </Button>
      </div>
    </article>
  );
}

/** The "start a conversation" box at the top of a feed. */
export function ComposerPrompt({ me, placeholder, onOpen }: { me: { uid: string; name: string; photoURL: string | null }; placeholder: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn(surface, "flex w-full items-center gap-3 p-3 pr-4 text-left transition hover:ring-primary/30")}>
      <UserAvatar person={me} size="lg" />
      <span className="flex-1 rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground">{placeholder}</span>
    </button>
  );
}

export function Composer({
  open,
  onOpenChange,
  spaces,
  defaultSpaceId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: WorkspaceSpace[];
  defaultSpaceId?: string;
  onSubmit: (action: CommunityAction) => Promise<void>;
}) {
  const [spaceId, setSpaceId] = useState<string | undefined>(defaultSpaceId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = spaces.find((space) => space.id === (spaceId ?? defaultSpaceId));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const isEvent = selected.kind === "events";
      if (isEvent && !startsAt) throw new Error("Pick a start time for the event.");
      await onSubmit({
        type: "post.create",
        spaceId: selected.id,
        title,
        body,
        event: isEvent ? { startsAt: new Date(startsAt).toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : null, location } : null,
      });
      setTitle("");
      setBody("");
      setStartsAt("");
      setEndsAt("");
      setLocation("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your post couldn't be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="brand-heading text-2xl">{selected?.kind === "events" ? "Create an event" : "Start a conversation"}</DialogTitle>
            <DialogDescription>Mention someone with their @handle. Only people who can see the space will see your post.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label>Post in</Label>
            <Select value={selected?.id} onValueChange={(value) => setSpaceId(value ?? undefined)}>
              <SelectTrigger className="w-full rounded-xl"><SelectValue placeholder="Choose a space" /></SelectTrigger>
              <SelectContent>
                {spaces.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-title">Title</Label>
            <Input id="post-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required className="rounded-xl" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="post-body">{selected?.kind === "events" ? "What's happening" : "What's on your mind?"}</Label>
            <Textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} rows={6} maxLength={10000} required className="rounded-xl" />
          </div>
          {selected?.kind === "events" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="event-start">Starts</Label>
                <Input id="event-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required className="rounded-xl" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-end">Ends (optional)</Label>
                <Input id="event-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="rounded-xl" />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="event-location">Where (a place or a link)</Label>
                <Input id="event-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} className="rounded-xl" />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="rounded-full px-5" disabled={busy || !selected}>{busy ? <LoaderCircle className="animate-spin" /> : null} Publish</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The right-hand column of the home feed: next events, who's here, and the viewer's profile. */
export function FeedRail({ workspace, people, onOpenPost, onMembers, onEvents }: { workspace: Workspace; people: PeopleIndex; onOpenPost: (id: string) => void; onMembers: () => void; onEvents: () => void }) {
  const next = workspace.events.slice(0, 3);
  const newest = [...workspace.members].reverse().slice(0, 6);
  const me = people.get(workspace.me.uid);
  return (
    <aside className="hidden content-start gap-5 xl:grid">
      <section className={cn(surface, "overflow-hidden")}>
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-heading text-sm font-semibold">Coming up</h2>
          <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={onEvents}>All events</Button>
        </div>
        {next.length === 0 ? (
          <p className="px-4 pt-2 pb-4 text-sm text-muted-foreground">No events on the calendar. Post one in an events space and members can RSVP.</p>
        ) : (
          <ul className="grid gap-1 p-2">
            {next.map((event) => (
              <li key={event.id}>
                <button type="button" onClick={() => onOpenPost(event.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted">
                  {event.event ? <DateBlock iso={event.event.startsAt} className="w-12" /> : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {event.event ? new Date(event.event.startsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""}
                      {event.event?.location ? ` · ${event.event.location}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(surface, "p-4")}>
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">Members</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{workspace.members.length}</span>
        </div>
        <button type="button" onClick={onMembers} className="mt-3 flex w-full items-center gap-3 text-left">
          <AvatarGroup>
            {newest.slice(0, 5).map((member) => <UserAvatar key={member.uid} person={{ uid: member.uid, name: member.displayName, photoURL: member.photoURL }} size="md" className="ring-2 ring-card" />)}
            {workspace.members.length > 5 ? <AvatarGroupCount className="text-xs">+{workspace.members.length - 5}</AvatarGroupCount> : null}
          </AvatarGroup>
        </button>
        {newest.some((member) => member.handle) ? (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground">Say hello to</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {newest.filter((member) => member.handle && member.uid !== workspace.me.uid).slice(0, 4).map((member) => (
                <Badge key={member.uid} variant="secondary" className="rounded-full">@{member.handle}</Badge>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {me ? (
        <section className={cn(surface, "p-4")}>
          <div className="flex items-center gap-3">
            <UserAvatar person={{ uid: me.uid, name: me.displayName, photoURL: me.photoURL }} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{me.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{me.handle ? `@${me.handle}` : "Choose a handle so people can @mention you"}</p>
            </div>
          </div>
          {me.headline ? <p className="mt-3 text-sm">{me.headline}</p> : null}
          <Button variant="outline" size="sm" className="mt-3 w-full rounded-full" onClick={onMembers}>{me.handle ? "Edit your profile" : "Choose a handle"}</Button>
        </section>
      ) : null}
    </aside>
  );
}
