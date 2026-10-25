"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  CalendarDays,
  Copy,
  Download,
  Flag,
  Hash,
  History,
  Lock,
  LoaderCircle,
  LogOut,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  canPostInSpace,
  canRemoveMember,
  isManager,
  isModerator,
  REACTION_LABELS,
  REACTION_TYPES,
  searchPosts,
  upcomingEvents,
  type CommunityAction,
  type Post,
  type RsvpStatus,
  type SpaceKind,
  type SpaceVisibility,
} from "@/lib/community/model";

import {
  api,
  formatWhen,
  initials,
  paperCard,
  runCommunityAction,
  type Thread,
  type Workspace,
  type WorkspaceMember,
  type WorkspacePost,
  type WorkspaceSpace,
} from "./api";

const spaceIcon = { discussion: Hash, announcements: Megaphone, events: CalendarDays } as const;

type AuditEvent = { id: string; action: string; actor: { email: string }; target: { type: string; id: string }; occurredAt: string | null; details: Record<string, unknown> };

export function CommunityWorkspace({
  tenantId,
  userEmail,
  otherCommunities,
  onSwitch,
  onSignOut,
}: {
  tenantId: string;
  userEmail: string;
  otherCommunities: boolean;
  onSwitch: () => void;
  onSignOut: () => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; status?: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState("feed");
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [appealing, setAppealing] = useState<{ postId: string; title: string } | null>(null);
  const [appealMessage, setAppealMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api<Workspace>(`/api/community/tenants/${tenantId}/workspace`);
      setWorkspace(data);
      setLoadError(null);
    } catch (error) {
      setLoadError({ message: error instanceof Error ? error.message : "Could not load the community.", status: (error as { status?: number }).status });
    }
  }, [tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial workspace fetch
    void refresh();
  }, [refresh]);

  const act = useCallback(
    async (action: CommunityAction, success?: string) => {
      try {
        const result = await runCommunityAction(tenantId, action);
        if (success) setNotice(success);
        await refresh();
        return result;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "That did not work.");
        throw error;
      }
    },
    [refresh, tenantId],
  );

  const spacesById = useMemo(() => new Map((workspace?.spaces ?? []).map((space) => [space.id, space])), [workspace]);
  const activeSpace = spaceId ? spacesById.get(spaceId) ?? null : workspace?.spaces[0] ?? null;

  if (loadError && !workspace) {
    return (
      <Frame userEmail={userEmail} title="Community" onSwitch={onSwitch} onSignOut={onSignOut} otherCommunities>
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>{loadError.status === 404 ? "You are not a member of this community" : "Could not open this community"}</AlertTitle>
          <AlertDescription>{loadError.message}</AlertDescription>
        </Alert>
      </Frame>
    );
  }

  if (!workspace) {
    return (
      <Frame userEmail={userEmail} title="Community" onSwitch={onSwitch} onSignOut={onSignOut} otherCommunities={otherCommunities}>
        <div className="mt-10 flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="animate-spin" size={16} /> Loading community</div>
      </Frame>
    );
  }

  const role = workspace.me.role;
  const viewer = { uid: workspace.me.uid, role };
  const postable = workspace.spaces.filter((space) => canPostInSpace(space, viewer));
  const feed = workspace.posts.filter((post) => !post.removed);
  const unread = workspace.notifications.filter((item) => item.unread).length;
  const events = upcomingEvents(feed as Post[], new Date());
  const spacePosts = activeSpace
    ? workspace.posts
        .filter((post) => post.spaceId === activeSpace.id && (!post.removed || isModerator(role)))
        .sort((a, b) => (a.pinned === b.pinned ? b.createdAt.localeCompare(a.createdAt) : a.pinned ? -1 : 1))
    : [];

  const postList = (posts: WorkspacePost[], empty: string) =>
    posts.length === 0 ? (
      <p className={`${paperCard} p-6 text-sm text-[var(--muted)]`}>{empty}</p>
    ) : (
      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            space={spacesById.get(post.spaceId)}
            reacted={new Set(workspace.myReactions)}
            saved={workspace.myBookmarks.includes(post.id)}
            onSave={() => void act({ type: "bookmark.toggle", postId: post.id }).catch(() => undefined)}
            onOpen={() => setOpenPostId(post.id)}
            onReact={(reaction) => void act({ type: "reaction.toggle", postId: post.id, reaction }).catch(() => undefined)}
          />
        ))}
      </div>
    );

  return (
    <Frame userEmail={userEmail} title={workspace.community.name} role={role} onSwitch={onSwitch} onSignOut={onSignOut} otherCommunities={otherCommunities}>
      {notice ? (
        <Alert className="mt-4 border-2 border-[var(--ink)]">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>{notice}</span>
            <Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="spaces">Spaces</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="inbox">Inbox{unread ? <Badge className="ml-1 bg-[#a855f7] text-white">{unread}</Badge> : null}</TabsTrigger>
            {isModerator(role) ? <TabsTrigger value="admin">Admin</TabsTrigger> : null}
          </TabsList>
          <Button onClick={() => setComposerOpen(true)} disabled={postable.length === 0}><Plus /> New post</Button>
        </div>

        <TabsContent value="feed" className="mt-4 flex flex-col gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" size={16} />
            <Input aria-label="Search posts" className="pl-9" placeholder="Search posts you can see" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {workspace.spaces.length === 0 ? (
            <Alert className="border-2 border-[var(--ink)]">
              <AlertTitle>No spaces yet</AlertTitle>
              <AlertDescription>{isManager(role) ? "Create your first space in Admin, then share the invite link." : "The owner has not opened any spaces to you yet."}</AlertDescription>
            </Alert>
          ) : null}
          <label className="flex items-center gap-2 self-end text-sm">
            <Switch checked={savedOnly} onCheckedChange={setSavedOnly} /> Saved posts only
          </label>
          {(() => {
            const base = savedOnly ? feed.filter((post) => workspace.myBookmarks.includes(post.id)) : feed;
            if (query.trim()) return postList(searchPosts(base as Post[], query) as WorkspacePost[], `No posts match "${query}".`);
            return postList(base, savedOnly ? "You have not saved any posts yet." : "No posts yet. Start the first conversation.");
          })()}
        </TabsContent>

        <TabsContent value="spaces" className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          <nav className="flex gap-2 overflow-x-auto md:flex-col" aria-label="Spaces">
            {workspace.spaces.map((space) => {
              const Icon = spaceIcon[space.kind];
              const active = activeSpace?.id === space.id;
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => setSpaceId(space.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg border-2 px-3 py-2 text-left text-sm ${active ? "border-[var(--ink)] bg-[#a855f7] text-white" : "border-transparent hover:border-[var(--ink)]"}`}
                >
                  <Icon size={16} /> <span className="truncate">{space.name}</span>
                  {space.visibility === "private" ? <Lock size={12} className="ml-auto" /> : null}
                </button>
              );
            })}
            {workspace.spaces.length === 0 ? <p className="text-sm text-[var(--muted)]">No spaces you can see.</p> : null}
          </nav>
          <section className="flex flex-col gap-3">
            {activeSpace ? (
              <div>
                <h2 className="text-xl font-black">{activeSpace.name}</h2>
                <p className="text-sm text-[var(--muted)]">
                  {activeSpace.description || `${activeSpace.kind} space`} · {activeSpace.visibility === "private" ? "Private — listed members only" : "Open to all members"}
                </p>
              </div>
            ) : null}
            {postList(spacePosts, "Nothing posted in this space yet.")}
          </section>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          {postList(events as WorkspacePost[], "No upcoming events. Create an events space and post one.")}
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <MembersDirectory workspace={workspace} onSave={(profile) => act({ type: "profile.update", ...profile }, "Profile saved.")} />
        </TabsContent>

        <TabsContent value="inbox" className="mt-4 flex flex-col gap-3">
          {workspace.myRemovedPosts.length ? (
            <section className={`${paperCard} flex flex-col gap-2 p-4`}>
              <h3 className="flex items-center gap-2 font-black"><Shield size={16} /> Moderation notices</h3>
              {workspace.myRemovedPosts.map((removed) => (
                <div key={removed.id} className="flex flex-col gap-2 border-t border-[var(--line)] pt-2 sm:flex-row sm:items-center">
                  <div className="flex-1 text-sm">
                    <strong>{removed.title}</strong> was removed{removed.removedReason ? `: ${removed.removedReason}` : "."}
                    {removed.appealStatus ? <span className="block text-xs text-[var(--muted)]">Appeal {removed.appealStatus === "open" ? "under review" : removed.appealStatus}</span> : null}
                  </div>
                  {removed.appealStatus !== "open" ? (
                    <Button size="sm" variant="outline" onClick={() => setAppealing({ postId: removed.id, title: removed.title })}>Appeal</Button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--muted)]">Replies to your posts and @mentions of you.</p>
            <Button variant="outline" size="sm" disabled={!unread} onClick={() => void act({ type: "notifications.read" }).catch(() => undefined)}>Mark all read</Button>
          </div>
          {workspace.notifications.length === 0 ? (
            <p className={`${paperCard} p-6 text-sm text-[var(--muted)]`}>Nothing yet. When someone replies to you or mentions @{workspace.me.email.split("@")[0]}, it shows up here.</p>
          ) : (
            workspace.notifications.map((item) => (
              <button key={item.id} type="button" onClick={() => setOpenPostId(item.postId)} className={`${paperCard} flex items-start gap-3 p-4 text-left`}>
                <Bell size={16} className={item.unread ? "text-[#a855f7]" : "text-[var(--muted)]"} />
                <span className="flex-1">
                  <strong>{item.actorName}</strong> {item.kind === "mention" ? "mentioned you in" : "replied to"} <strong>{item.postTitle}</strong>
                  <span className="mt-1 block text-sm text-[var(--muted)]">{item.excerpt}</span>
                </span>
                <span className="text-xs text-[var(--muted)]">{formatWhen(item.at)}</span>
              </button>
            ))
          )}
        </TabsContent>

        {isModerator(role) ? (
          <TabsContent value="admin" className="mt-4">
            <AdminPanel tenantId={tenantId} workspace={workspace} act={act} onNotice={setNotice} onOpenPost={setOpenPostId} refresh={refresh} />
          </TabsContent>
        ) : null}
      </Tabs>

      <Composer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        spaces={postable}
        defaultSpaceId={activeSpace && postable.some((space) => space.id === activeSpace.id) ? activeSpace.id : postable[0]?.id}
        onSubmit={async (action) => {
          await act(action, "Posted.");
          setComposerOpen(false);
        }}
      />

      <Dialog open={appealing !== null} onOpenChange={(open) => (!open ? setAppealing(null) : undefined)}>
        <DialogContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!appealing) return;
              const target = appealing;
              setAppealing(null);
              await act({ type: "post.appeal", postId: target.postId, message: appealMessage }, "Appeal sent. A moderator other than you will decide.").catch(() => undefined);
              setAppealMessage("");
            }}
          >
            <DialogHeader>
              <DialogTitle>Appeal the removal of &ldquo;{appealing?.title}&rdquo;</DialogTitle>
              <DialogDescription>Explain why the post should come back. Moderators see your message; the decision is recorded in the audit log.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="appeal-message">Your appeal</Label>
              <Textarea id="appeal-message" value={appealMessage} onChange={(event) => setAppealMessage(event.target.value)} maxLength={1000} rows={4} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAppealing(null)}>Cancel</Button>
              <Button type="submit" disabled={!appealMessage.trim()}>Send appeal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {openPostId ? (
        <ThreadDialog
          key={openPostId}
          tenantId={tenantId}
          postId={openPostId}
          workspace={workspace}
          onClose={() => setOpenPostId(null)}
          act={act}
        />
      ) : null}
    </Frame>
  );
}

function Frame({
  children,
  title,
  role,
  userEmail,
  otherCommunities,
  onSwitch,
  onSignOut,
}: {
  children: React.ReactNode;
  title: string;
  role?: string;
  userEmail: string;
  otherCommunities: boolean;
  onSwitch: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="fleet-app min-h-screen bg-[var(--paper)] px-4 py-6 text-[var(--ink)]">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--ink)] pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">SaaSassin Community</p>
            <h1 className="truncate text-2xl font-black sm:text-3xl">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {role ? <Badge variant="secondary" className="capitalize">{role}</Badge> : null}
            <span className="hidden text-sm text-[var(--muted)] md:inline">{userEmail}</span>
            {otherCommunities ? <Button variant="outline" size="sm" onClick={onSwitch}>Switch</Button> : <Button variant="outline" size="sm" onClick={onSwitch}>All communities</Button>}
            <Button variant="outline" size="sm" onClick={onSignOut}><LogOut /> Sign out</Button>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function PostCard({
  post,
  space,
  reacted,
  saved,
  onSave,
  onOpen,
  onReact,
}: {
  post: WorkspacePost;
  space?: WorkspaceSpace;
  reacted: Set<string>;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
  onReact: (reaction: (typeof REACTION_TYPES)[number]) => void;
}) {
  return (
    <article className={`${paperCard} p-4 ${post.removed ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        {post.pinned ? <Badge className="bg-[#a855f7] text-white"><Pin size={12} /> Pinned</Badge> : null}
        {post.removed ? <Badge variant="destructive">Removed{post.removedReason ? `: ${post.removedReason}` : ""}</Badge> : null}
        {space ? <span className="font-semibold">{space.name}</span> : null}
        <span>· {post.authorName}</span>
        <span>· {formatWhen(post.createdAt)}</span>
        {post.commentsClosed ? <span>· comments closed</span> : null}
      </div>
      <button type="button" onClick={onOpen} className="mt-2 block text-left">
        <h3 className="text-lg font-bold leading-snug">{post.title}</h3>
        {post.event ? (
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold"><CalendarDays size={14} /> {formatWhen(post.event.startsAt)}{post.event.location ? ` · ${post.event.location}` : ""}</p>
        ) : null}
        <p className="mt-1 line-clamp-3 text-sm whitespace-pre-line">{post.body}</p>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {REACTION_TYPES.map((reaction) => {
          const active = reacted.has(`${post.id}:${reaction}`);
          return (
            <Button key={reaction} size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={onReact.bind(null, reaction)} disabled={post.removed}>
              {REACTION_LABELS[reaction]} {post.reactionCounts?.[reaction] ? post.reactionCounts[reaction] : ""}
            </Button>
          );
        })}
        <Button size="sm" variant="ghost" onClick={onOpen}><MessageSquare /> {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</Button>
        <Button size="sm" variant="ghost" className="ml-auto" aria-pressed={saved} onClick={onSave} disabled={post.removed}>
          {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </article>
  );
}

function Composer({
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
        event: isEvent
          ? { startsAt: new Date(startsAt).toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : null, location }
          : null,
      });
      setTitle("");
      setBody("");
      setStartsAt("");
      setEndsAt("");
      setLocation("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>New post</DialogTitle>
            <DialogDescription>Mention people with @handle (their email name). Members only see spaces they belong to.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Space</Label>
            <Select value={selected?.id} onValueChange={(value) => setSpaceId(value ?? undefined)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a space" /></SelectTrigger>
              <SelectContent>
                {spaces.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-title">Title</Label>
            <Input id="post-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="post-body">Body</Label>
            <Textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={10000} required />
          </div>
          {selected?.kind === "events" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-start">Starts</Label>
                <Input id="event-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="event-end">Ends (optional)</Label>
                <Input id="event-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="event-location">Location or link</Label>
                <Input id="event-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-[var(--destructive)]" role="alert">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !selected}>{busy ? <LoaderCircle className="animate-spin" /> : null} Publish</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ThreadDialog({
  tenantId,
  postId,
  workspace,
  onClose,
  act,
}: {
  tenantId: string;
  postId: string;
  workspace: Workspace;
  onClose: () => void;
  act: (action: CommunityAction, success?: string) => Promise<unknown>;
}) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const role = workspace.me.role;

  const load = useCallback(async () => {
    try {
      setThread(await api<Thread>(`/api/community/tenants/${tenantId}/posts/${postId}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this post.");
    }
  }, [postId, tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the thread when the dialog opens
    void load();
  }, [load]);

  async function run(action: CommunityAction, success?: string) {
    setBusy(true);
    try {
      await act(action, success);
      await load();
    } catch {
      /* the workspace notice already explains the failure */
    } finally {
      setBusy(false);
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    await run({ type: "comment.create", postId, body: comment });
    setComment("");
  }

  const post = thread?.post;
  const myRsvp = workspace.myRsvps[postId] as RsvpStatus | undefined;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {error ? (
          <DialogHeader><DialogTitle>Unavailable</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader>
        ) : !post ? (
          <DialogHeader><DialogTitle>Loading</DialogTitle><DialogDescription>Fetching the thread.</DialogDescription></DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-2 pr-8">
                <DialogTitle className="text-xl">{post.title}</DialogTitle>
                {isModerator(role) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon-sm" variant="outline" aria-label="Moderation actions"><MoreHorizontal /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: post.pinned ? "unpin" : "pin", reason: "" }, post.pinned ? "Unpinned." : "Pinned to the top of its space.")}>
                        {post.pinned ? "Unpin" : "Pin"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: post.commentsClosed ? "reopen" : "close", reason: "" }, post.commentsClosed ? "Comments reopened." : "Comments closed.")}>
                        {post.commentsClosed ? "Reopen comments" : "Close comments"}
                      </DropdownMenuItem>
                      {post.removed ? (
                        <DropdownMenuItem onClick={() => void run({ type: "post.moderate", postId, operation: "restore", reason: "" }, "Post restored.")}>Restore post</DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoveTarget({ kind: "post", id: postId })}>Remove post</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <DialogDescription>
                {post.authorName} · {formatWhen(post.createdAt)}{post.removed ? ` · removed (${post.removedReason})` : ""}
              </DialogDescription>
            </DialogHeader>
            {post.event ? (
              <div className="rounded-lg border-2 border-[var(--ink)] p-3 text-sm">
                <p className="font-semibold"><CalendarDays className="mr-1 inline" size={14} />{formatWhen(post.event.startsAt)}{post.event.endsAt ? ` – ${formatWhen(post.event.endsAt)}` : ""}</p>
                {post.event.location ? <p>{post.event.location}</p> : null}
                <p className="mt-1 text-[var(--muted)]">
                  {thread.rsvps.summary.going} going · {thread.rsvps.summary.maybe} maybe{thread.rsvps.going.length ? ` — ${thread.rsvps.going.slice(0, 8).join(", ")}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a className="text-[var(--ink)]!" href={`/api/community/tenants/${tenantId}/posts/${postId}/calendar`} download><CalendarPlus /> Add to calendar</a>
                  </Button>
                  {(["going", "maybe", "not_going"] as const).map((status) => (
                    <Button key={status} size="sm" variant={myRsvp === status ? "default" : "outline"} disabled={busy} onClick={() => void run({ type: "rsvp.set", postId, status }, "RSVP saved.")}>
                      {status === "not_going" ? "Can't go" : status === "going" ? "Going" : "Maybe"}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-sm whitespace-pre-line">{post.body}</p>
            {post.authorUid !== workspace.me.uid && !post.removed ? (
              <div className="flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setReporting(true)}><Flag /> Report</Button>
              </div>
            ) : null}

            <section className="mt-2 flex flex-col gap-3 border-t-2 border-[var(--ink)] pt-3">
              <h4 className="font-bold">{thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}</h4>
              {thread.comments.map((entry) => (
                <div key={entry.id} className={`flex gap-3 ${entry.removed ? "opacity-50" : ""}`}>
                  <Avatar className="size-8"><AvatarFallback>{initials(entry.authorName)}</AvatarFallback></Avatar>
                  <div className="flex-1">
                    <p className="text-xs text-[var(--muted)]"><strong className="text-[var(--ink)]">{entry.authorName}</strong> · {formatWhen(entry.createdAt)}{entry.removed ? " · removed" : ""}</p>
                    <p className="text-sm whitespace-pre-line">{entry.body}</p>
                  </div>
                  {isModerator(role) && !entry.removed ? (
                    <Button size="sm" variant="ghost" onClick={() => setRemoveTarget({ kind: "comment", id: entry.id })}>Remove</Button>
                  ) : null}
                </div>
              ))}
              {post.commentsClosed && !isModerator(role) ? (
                <p className="text-sm text-[var(--muted)]">Comments are closed on this post.</p>
              ) : post.removed ? null : (
                <form onSubmit={submitComment} className="flex flex-col gap-2">
                  <Label htmlFor="comment-body" className="sr-only">Comment</Label>
                  <Textarea id="comment-body" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a reply. Use @handle to mention someone." rows={3} maxLength={4000} required />
                  <div className="flex justify-end"><Button type="submit" disabled={busy || !comment.trim()}>Reply</Button></div>
                </form>
              )}
            </section>
          </>
        )}
      </DialogContent>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => (!open ? setRemoveTarget(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this {removeTarget?.kind}?</DialogTitle>
            <DialogDescription>Members stop seeing it immediately. The removal and your reason are written to the audit log; posts can be restored.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="remove-reason">Reason</Label>
            <Input id="remove-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Spam, off-topic, harassment..." maxLength={280} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!removeTarget) return;
                const target = removeTarget;
                setRemoveTarget(null);
                await run(
                  target.kind === "post"
                    ? { type: "post.moderate", postId: target.id, operation: "remove", reason }
                    : { type: "comment.remove", commentId: target.id, reason },
                  "Removed and logged.",
                );
                setReason("");
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reporting} onOpenChange={setReporting}>
        <DialogContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setReporting(false);
              await run({ type: "post.report", postId, reason: reportReason }, "Reported. A moderator will review it.");
              setReportReason("");
            }}
          >
            <DialogHeader>
              <DialogTitle>Report this post</DialogTitle>
              <DialogDescription>Moderators see your report and reason. The author does not see who reported it.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-reason">What is wrong?</Label>
              <Textarea id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={280} rows={3} required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReporting(false)}>Cancel</Button>
              <Button type="submit" disabled={!reportReason.trim()}>Send report</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function MembersDirectory({
  workspace,
  onSave,
}: {
  workspace: Workspace;
  onSave: (profile: { displayName: string; headline: string; bio: string }) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    displayName: workspace.me.profile.displayName,
    headline: workspace.me.profile.headline,
    bio: workspace.me.profile.bio,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">{workspace.members.length} {workspace.members.length === 1 ? "member" : "members"}</p>
        <Button variant="outline" onClick={() => setEditing(true)}>Edit my profile</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workspace.members.map((member) => (
          <div key={member.uid} className={`${paperCard} flex gap-3 p-4`}>
            <Avatar className="size-10"><AvatarFallback>{initials(member.displayName)}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <p className="font-bold">{member.displayName} {member.uid === workspace.me.uid ? <span className="text-xs font-normal text-[var(--muted)]">(you)</span> : null}</p>
              <p className="text-xs text-[var(--muted)]">@{member.handle} · <span className="capitalize">{member.role}</span></p>
              {member.headline ? <p className="mt-1 text-sm font-semibold">{member.headline}</p> : null}
              {member.bio ? <p className="mt-1 line-clamp-3 text-sm">{member.bio}</p> : null}
            </div>
          </div>
        ))}
      </div>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSave(profile).then(() => setEditing(false)).catch(() => undefined);
            }}
          >
            <DialogHeader>
              <DialogTitle>Your profile in {workspace.community.name}</DialogTitle>
              <DialogDescription>Visible to every member of this community.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-name">Display name</Label>
              <Input id="profile-name" value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} maxLength={80} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-headline">Headline</Label>
              <Input id="profile-headline" value={profile.headline} onChange={(event) => setProfile({ ...profile, headline: event.target.value })} maxLength={120} placeholder="Founder at ..." />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-bio">Bio</Label>
              <Textarea id="profile-bio" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} maxLength={1000} rows={4} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit">Save profile</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminPanel({
  tenantId,
  workspace,
  act,
  onNotice,
  onOpenPost,
  refresh,
}: {
  tenantId: string;
  workspace: Workspace;
  act: (action: CommunityAction, success?: string) => Promise<unknown>;
  onNotice: (message: string) => void;
  onOpenPost: (postId: string) => void;
  refresh: () => Promise<void>;
}) {
  const manager = isManager(workspace.me.role);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [spaceDialog, setSpaceDialog] = useState<{ mode: "create" } | { mode: "edit"; space: WorkspaceSpace } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "moderator" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [origin, setOrigin] = useState("");
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the invite link needs the browser origin
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = workspace.invite?.code ? `${origin}/apps/community/join/${tenantId}/${workspace.invite.code}` : "";

  async function loadAudit() {
    try {
      const { events } = await api<{ events: AuditEvent[] }>(`/api/community/tenants/${tenantId}/audit`);
      setAudit(events);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not load the audit log.");
    }
  }

  async function inviteByEmail(event: FormEvent) {
    event.preventDefault();
    setInviting(true);
    try {
      await api(`/api/community/tenants/${tenantId}/members`, { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
      onNotice(`${inviteEmail} added as ${inviteRole}.`);
      setInviteEmail("");
      await refresh();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not add that member.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${paperCard} flex flex-col gap-3 p-4 lg:col-span-2`}>
        <h3 className="flex items-center gap-2 font-black"><Flag size={18} /> Reports queue {workspace.reports.length ? <Badge variant="destructive">{workspace.reports.length}</Badge> : null}</h3>
        {workspace.reports.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No open reports. When a member reports a post, it waits here until a moderator removes the post or dismisses the report.</p>
        ) : (
          workspace.reports.map((report) => (
            <div key={report.id} className="flex flex-col gap-2 rounded-lg border-2 border-[var(--line)] p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => onOpenPost(report.postId)}>{report.postTitle}</button>
                <p className="text-sm">&ldquo;{report.reason}&rdquo;</p>
                <p className="text-xs text-[var(--muted)]">Reported by {report.reporterName} · {formatWhen(report.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => void act({ type: "report.resolve", reportId: report.id, resolution: "actioned", note: "" }, "Post removed and report closed.").catch(() => undefined)}>Remove post</Button>
                <Button size="sm" variant="outline" onClick={() => void act({ type: "report.resolve", reportId: report.id, resolution: "dismissed", note: "" }, "Report dismissed.").catch(() => undefined)}>Dismiss</Button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={`${paperCard} flex flex-col gap-3 p-4 lg:col-span-2`}>
        <h3 className="flex items-center gap-2 font-black"><Shield size={18} /> Appeals {workspace.appeals.length ? <Badge variant="destructive">{workspace.appeals.length}</Badge> : null}</h3>
        {workspace.appeals.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No open appeals. Authors of removed posts can appeal once per removal; you cannot decide your own.</p>
        ) : (
          workspace.appeals.map((appeal) => (
            <div key={appeal.id} className="flex flex-col gap-2 rounded-lg border-2 border-[var(--line)] p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <button type="button" className="font-semibold underline-offset-2 hover:underline" onClick={() => onOpenPost(appeal.postId)}>{appeal.postTitle}</button>
                <p className="text-xs text-[var(--muted)]">Removed for: {appeal.removedReason ?? "no reason given"}</p>
                <p className="text-sm">&ldquo;{appeal.message}&rdquo; — {appeal.authorName}, {formatWhen(appeal.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void act({ type: "appeal.resolve", appealId: appeal.id, decision: "reinstated", note: "" }, "Post reinstated.").catch(() => undefined)}>Reinstate</Button>
                <Button size="sm" variant="outline" onClick={() => void act({ type: "appeal.resolve", appealId: appeal.id, decision: "upheld", note: "" }, "Removal upheld.").catch(() => undefined)}>Uphold removal</Button>
              </div>
            </div>
          ))
        )}
      </section>

      {manager ? (
        <section className={`${paperCard} flex flex-col gap-3 p-4`}>
          <h3 className="flex items-center gap-2 font-black"><Users size={18} /> Invite link</h3>
          {workspace.invite?.enabled && inviteUrl ? (
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(event) => event.target.select()} />
              <Button variant="outline" size="icon" aria-label="Copy invite link" onClick={() => void navigator.clipboard?.writeText(inviteUrl).then(() => onNotice("Invite link copied."))}><Copy /></Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Invite links are off. Nobody can join with an old link.</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={workspace.invite?.enabled ?? false} onCheckedChange={(checked) => void act({ type: "invite.toggle", enabled: checked }, checked ? "Invite link enabled." : "Invite link disabled.").catch(() => undefined)} />
              Accept new members by link
            </label>
            <Button variant="outline" size="sm" onClick={() => void act({ type: "invite.rotate" }, "New invite link created; the old one no longer works.").catch(() => undefined)}><RefreshCw /> New link</Button>
          </div>
          <form className="mt-2 flex flex-col gap-2 border-t-2 border-[var(--ink)] pt-3" onSubmit={inviteByEmail}>
            <Label htmlFor="invite-email">Add someone with a SaaSassin account</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" required />
              <Select value={inviteRole} onValueChange={(value) => setInviteRole((value as typeof inviteRole) ?? "member")}>
                <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="moderator">Moderator</SelectItem>
                  {workspace.me.role === "owner" ? <SelectItem value="admin">Admin</SelectItem> : null}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={inviting}>Add</Button>
            </div>
          </form>
        </section>
      ) : null}

      {manager ? (
        <section className={`${paperCard} flex flex-col gap-3 p-4`}>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-black"><Hash size={18} /> Spaces</h3>
            <Button size="sm" onClick={() => setSpaceDialog({ mode: "create" })}><Plus /> New space</Button>
          </div>
          {workspace.spaces.length === 0 ? <p className="text-sm text-[var(--muted)]">Create a discussion, announcements, or events space to get started.</p> : null}
          {workspace.spaces.map((space, index) => (
            <div key={space.id} className="flex items-center gap-2 rounded-lg border-2 border-[var(--line)] p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{space.name}</p>
                <p className="text-xs text-[var(--muted)] capitalize">{space.kind} · {space.visibility === "private" ? `private (${space.memberUids.length})` : "all members"}</p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0} onClick={() => void act({ type: "space.move", spaceId: space.id, direction: "up" }).catch(() => undefined)}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === workspace.spaces.length - 1} onClick={() => void act({ type: "space.move", spaceId: space.id, direction: "down" }).catch(() => undefined)}><ArrowDown /></Button>
              <Button size="sm" variant="outline" onClick={() => setSpaceDialog({ mode: "edit", space })}>Edit</Button>
            </div>
          ))}
        </section>
      ) : null}

      {manager ? (
        <section className={`${paperCard} flex flex-col gap-3 p-4`}>
          <h3 className="flex items-center gap-2 font-black"><Shield size={18} /> Roles</h3>
          {workspace.members.map((member) => (
            <div key={member.uid} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{member.displayName}</p>
                <p className="truncate text-xs text-[var(--muted)]">{member.email}</p>
              </div>
              {member.role === "owner" || member.uid === workspace.me.uid ? (
                <Badge variant="secondary" className="capitalize">{member.role}</Badge>
              ) : (
                <Select value={member.role} onValueChange={(value) => void act({ type: "member.role", uid: member.uid, role: value as "admin" | "moderator" | "member" }, "Role updated.").catch(() => undefined)}>
                  <SelectTrigger className="w-32" aria-label={`Role for ${member.displayName}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    {workspace.me.role === "owner" ? <SelectItem value="admin">Admin</SelectItem> : null}
                  </SelectContent>
                </Select>
              )}
              {canRemoveMember(workspace.me, member) ? (
                <Button size="sm" variant="ghost" aria-label={`Remove ${member.displayName}`} onClick={() => setRemoving(member)}>Remove</Button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section className={`${paperCard} flex flex-col gap-3 p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-black"><History size={18} /> Audit log</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadAudit()}>{audit ? "Refresh" : "Load"}</Button>
            {manager ? (
              <Button size="sm" asChild><a className="text-white!" href={`/api/community/tenants/${tenantId}/export`} download><Download /> Export JSON</a></Button>
            ) : null}
          </div>
        </div>
        {audit === null ? (
          <p className="text-sm text-[var(--muted)]">Every join, post, reaction, RSVP, moderation action, role change and export is recorded here.</p>
        ) : audit.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No events yet.</p>
        ) : (
          <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
            {audit.map((event) => (
              <li key={event.id} className="border-b border-[var(--line)] pb-1">
                <span className="font-mono text-xs">{event.action}</span> · {event.actor?.email} · {formatWhen(event.occurredAt)}
                {typeof event.details?.reason === "string" && event.details.reason ? <span className="block text-xs text-[var(--muted)]">Reason: {event.details.reason}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <Dialog open={removing !== null} onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.displayName}?</DialogTitle>
            <DialogDescription>They lose access immediately and cannot rejoin with the invite link. Their posts stay; the removal is written to the audit log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const target = removing;
                setRemoving(null);
                if (target) void act({ type: "member.remove", uid: target.uid }, `${target.displayName} was removed.`).catch(() => undefined);
              }}
            >
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {spaceDialog ? (
        <SpaceDialog
          key={spaceDialog.mode === "edit" ? spaceDialog.space.id : "new"}
          initial={spaceDialog.mode === "edit" ? spaceDialog.space : null}
          members={workspace.members}
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
    </div>
  );
}

function SpaceDialog({
  initial,
  members,
  onClose,
  onSubmit,
}: {
  initial: WorkspaceSpace | null;
  members: Workspace["members"];
  onClose: () => void;
  onSubmit: (space: { name: string; description: string; kind: SpaceKind; visibility: SpaceVisibility; memberUids: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<SpaceKind>(initial?.kind ?? "discussion");
  const [visibility, setVisibility] = useState<SpaceVisibility>(initial?.visibility ?? "members");
  const [memberUids, setMemberUids] = useState<string[]>(initial?.memberUids ?? []);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            await onSubmit({ name, description, kind, visibility, memberUids: visibility === "private" ? memberUids : [] }).catch(() => undefined);
            setBusy(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial ? "Edit space" : "New space"}</DialogTitle>
            <DialogDescription>Private spaces are visible only to the members you list (and to owners and admins).</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input id="space-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="space-description">Description</Label>
            <Input id="space-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={280} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(value) => setKind((value as SpaceKind) ?? "discussion")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discussion">Discussion</SelectItem>
                  <SelectItem value="announcements">Announcements</SelectItem>
                  <SelectItem value="events">Events</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Access</Label>
              <Select value={visibility} onValueChange={(value) => setVisibility((value as SpaceVisibility) ?? "members")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="members">All members</SelectItem>
                  <SelectItem value="private">Private (listed members)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {visibility === "private" ? (
            <fieldset className="flex flex-col gap-2 rounded-lg border-2 border-[var(--line)] p-3">
              <legend className="px-1 text-sm font-semibold">Members with access</legend>
              {members.map((member) => (
                <label key={member.uid} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={memberUids.includes(member.uid)}
                    onCheckedChange={(checked) =>
                      setMemberUids((current) => (checked ? [...current, member.uid] : current.filter((uid) => uid !== member.uid)))
                    }
                  />
                  {member.displayName} <span className="text-xs text-[var(--muted)]">@{member.handle}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{initial ? "Save" : "Create space"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
