"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Bookmark, CalendarDays, CircleAlert, Home, Lock, MessagesSquare, Search, Shield } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, toast } from "@/components/ui/toast";
import { isManager, isModerator, type CommunityAction } from "@/lib/community/model";
import { cn } from "@/lib/utils";

import { api, peopleIndex, personFor, runCommunityAction, surface, timeAgo, type Workspace, type WorkspacePost } from "./api";
import type { CommunityNavigate } from "./community-app";
import { ModerationPanel, PeoplePanel, SettingsPanel } from "./admin";
import { Composer, ComposerPrompt, DateBlock, FeedRail, PostCard, RichText } from "./feed";
import { LearnPanel } from "./learn-panel";
import { MembersDirectory } from "./members";
import { PagedPosts } from "./paged-posts";
import { PlansPanel } from "./plans-panel";
import { CommunityShell, spaceIcon, ViewHeader, type CommunityView } from "./shell";
import { ThreadDialog } from "./thread-dialog";

function EmptyInvite({ icon: Icon, title, body, action }: { icon: typeof Home; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-[var(--radius)] border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><Icon className="size-5" aria-hidden="true" /></span>
      <h2 className="brand-heading mt-4 text-xl">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function CommunityWorkspace({
  tenantId,
  view,
  spaceId,
  navigate,
  onSwitchCommunity,
  onLeft,
}: {
  tenantId: string;
  userEmail: string;
  view: CommunityView;
  spaceId: string | null;
  navigate: CommunityNavigate;
  onSwitchCommunity: (tenantId: string) => void;
  onLeft: () => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; status?: number } | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [composer, setComposer] = useState<{ open: boolean; spaceId?: string }>({ open: false });
  const [activeQuery, setActiveQuery] = useState("");
  const [version, setVersion] = useState(0);
  const [savedOnly, setSavedOnly] = useState(false);
  const [appealing, setAppealing] = useState<{ postId: string; title: string } | null>(null);
  const [appealMessage, setAppealMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = await api<Workspace>(`/api/community/tenants/${tenantId}/workspace`);
      setWorkspace(data);
      setVersion((current) => current + 1);
      setLoadError(null);
    } catch (error) {
      setLoadError({ message: error instanceof Error ? error.message : "This community couldn't be loaded.", status: (error as { status?: number }).status });
    }
  }, [tenantId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial workspace fetch
    void refresh();
  }, [refresh]);

  const notify = useCallback((message: string, destructive = false) => {
    toast({ title: message, variant: destructive ? "destructive" : undefined });
  }, []);

  const act = useCallback(
    async (action: CommunityAction, success?: string) => {
      try {
        const result = await runCommunityAction(tenantId, action);
        if (success) notify(success);
        await refresh();
        return result;
      } catch (error) {
        notify(error instanceof Error ? error.message : "That didn't work. Try again.", true);
        throw error;
      }
    },
    [notify, refresh, tenantId],
  );

  const people = useMemo(() => (workspace ? peopleIndex(workspace) : new Map()), [workspace]);
  const spacesById = useMemo(() => new Map((workspace?.spaces ?? []).map((space) => [space.id, space])), [workspace]);
  const role = workspace?.me.role ?? "member";
  const postable = (workspace?.spaces ?? []).filter((space) => space.canPost);
  const unread = (workspace?.notifications ?? []).filter((item) => item.unread).length;
  const activeSpace = spaceId ? spacesById.get(spaceId) ?? null : null;
  const me = workspace ? personFor(people, workspace.me.uid, workspace.me.profile.displayName) : null;

  function search(query: string) {
    setActiveQuery(query);
    if (query) navigate({ view: "feed" });
  }

  const shell = (children: React.ReactNode) => (
    <CommunityShell
      tenantId={tenantId}
      spaces={workspace?.spaces ?? []}
      nav={{ view, spaceId, onNavigate: (next, space) => navigate({ view: next, space: space ?? null }) }}
      counts={{ unread, moderation: (workspace?.reports.length ?? 0) + (workspace?.appeals.length ?? 0), members: workspace?.members.length ?? 0 }}
      access={{
        moderate: isModerator(role),
        manage: isManager(role),
        hasCourses: (workspace?.courses.length ?? 0) > 0,
        hasPlans: (workspace?.plans.length ?? 0) > 0,
        canPost: postable.length > 0,
      }}
      onSwitchCommunity={onSwitchCommunity}
      onSearch={search}
      onNewPost={() => setComposer({ open: true, spaceId: activeSpace && activeSpace.canPost ? activeSpace.id : undefined })}
    >
      <Toaster />
      {children}
    </CommunityShell>
  );

  if (loadError && !workspace) {
    return shell(
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlert />
        <AlertTitle>{loadError.status === 404 ? "You're not a member of this community" : "This community didn't load"}</AlertTitle>
        <AlertDescription>{loadError.message}</AlertDescription>
      </Alert>,
    );
  }

  if (!workspace || !me) {
    return shell(
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]" aria-busy="true">
        <div className="grid content-start gap-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-16 rounded-[var(--radius)]" />
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-48 rounded-[var(--radius)]" />)}
        </div>
        <div className="hidden content-start gap-4 xl:grid">
          <Skeleton className="h-48 rounded-[var(--radius)]" />
          <Skeleton className="h-32 rounded-[var(--radius)]" />
        </div>
      </div>,
    );
  }

  const reacted = new Set(workspace.myReactions);
  const renderPost = (post: WorkspacePost) => (
    <PostCard
      post={post}
      space={spacesById.get(post.spaceId)}
      people={people}
      reacted={reacted}
      saved={workspace.myBookmarks.includes(post.id)}
      onSave={() => void act({ type: "bookmark.toggle", postId: post.id }).catch(() => undefined)}
      onOpen={() => setOpenPostId(post.id)}
      onReact={(reaction) => void act({ type: "reaction.toggle", postId: post.id, reaction }).catch(() => undefined)}
    />
  );

  let content: React.ReactNode;
  if (view === "space" && activeSpace) {
    const Icon = spaceIcon[activeSpace.kind];
    content = (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 content-start gap-4">
          <ViewHeader
            icon={Icon}
            title={activeSpace.name}
            description={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {activeSpace.description || (activeSpace.kind === "events" ? "Gatherings for members." : activeSpace.kind === "announcements" ? "News from the team." : "A place to talk.")}
                {activeSpace.visibility === "private" ? <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"><Lock className="size-3" aria-hidden="true" /> Private</span> : null}
              </span>
            }
          />
          {activeSpace.canPost ? (
            <ComposerPrompt me={me} placeholder={activeSpace.kind === "events" ? `Plan something for ${activeSpace.name}…` : `Share something with ${activeSpace.name}…`} onOpen={() => setComposer({ open: true, spaceId: activeSpace.id })} />
          ) : null}
          <PagedPosts tenantId={tenantId} version={version} params={{ space: activeSpace.id }} renderPost={renderPost} empty={activeSpace.canPost ? "Nothing here yet. Be the one who gets it going." : "Nothing has been posted here yet."} />
        </div>
        <FeedRail workspace={workspace} people={people} onOpenPost={setOpenPostId} onMembers={() => navigate({ view: "members" })} onEvents={() => navigate({ view: "events" })} />
      </div>
    );
  } else if (view === "events") {
    content = (
      <>
        <ViewHeader icon={CalendarDays} title="Events" description="What's coming up. Open one to RSVP or add it to your calendar." />
        {workspace.events.length === 0 ? (
          <EmptyInvite icon={CalendarDays} title="Nothing on the calendar yet" body={isManager(role) ? "Create an events space in Settings, then post your first gathering. Members can RSVP and add it to their calendar." : "When someone plans a gathering, it shows up here."} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {workspace.events.map((event) => {
              const host = personFor(people, event.authorUid, event.authorName);
              return (
                <li key={event.id}>
                  <button type="button" onClick={() => setOpenPostId(event.id)} className={cn(surface, "flex h-full w-full gap-4 p-5 text-left transition hover:ring-primary/30")}>
                    {event.event ? <DateBlock iso={event.event.startsAt} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-lg leading-snug font-semibold">{event.title}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {event.event ? new Date(event.event.startsAt).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" }) : ""}
                        {event.event?.location ? ` · ${event.event.location}` : ""}
                      </span>
                      <RichText text={event.body} className="mt-2 line-clamp-2 text-sm" />
                      <span className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <UserAvatar person={host} size="sm" /> Hosted by {host.name}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  } else if (view === "members") {
    content = <MembersDirectory workspace={workspace} act={act} />;
  } else if (view === "courses") {
    content = <LearnPanel workspace={workspace} act={act} />;
  } else if (view === "plans") {
    content = <PlansPanel workspace={workspace} act={act} />;
  } else if (view === "inbox") {
    content = (
      <>
        <ViewHeader
          icon={Bell}
          title="Inbox"
          description="Replies to your posts and times someone @mentioned you."
          actions={<Button variant="outline" className="rounded-full" disabled={!unread} onClick={() => void act({ type: "notifications.read" }).catch(() => undefined)}>Mark all as read</Button>}
        />
        {workspace.myRemovedPosts.length ? (
          <section className={cn(surface, "mb-5 grid gap-3 p-5")}>
            <h2 className="flex items-center gap-2 font-heading font-semibold"><Shield className="size-4 text-primary" aria-hidden="true" /> From the moderators</h2>
            {workspace.myRemovedPosts.map((removed) => (
              <div key={removed.id} className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                <div className="flex-1 text-sm">
                  <strong>{removed.title}</strong> was removed{removed.removedReason ? `: ${removed.removedReason}` : "."}
                  {removed.appealStatus ? <span className="block text-xs text-muted-foreground">Your appeal is {removed.appealStatus === "open" ? "being reviewed" : removed.appealStatus}.</span> : null}
                </div>
                {removed.appealStatus !== "open" ? <Button size="sm" variant="outline" className="rounded-full" onClick={() => setAppealing({ postId: removed.id, title: removed.title })}>Appeal</Button> : null}
              </div>
            ))}
          </section>
        ) : null}
        {workspace.notifications.length === 0 ? (
          <EmptyInvite
            icon={Bell}
            title="You're all caught up"
            body={workspace.me.profile.handle ? `When someone replies to you or mentions @${workspace.me.profile.handle}, you'll see it here.` : "When someone replies to you, you'll see it here. Choose a handle in Members so people can @mention you too."}
          />
        ) : (
          <ul className={cn(surface, "overflow-hidden")}>
            {workspace.notifications.map((item, index) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpenPostId(item.postId)} className={cn("flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted/60", index && "border-t border-border", item.unread && "bg-primary/[0.04]")}>
                  <UserAvatar person={personFor(people, item.actorUid, item.actorName)} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm"><strong>{item.actorName}</strong> {item.kind === "mention" ? "mentioned you in" : "replied to"} <strong>{item.postTitle}</strong></span>
                    <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">{item.excerpt}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {timeAgo(item.at)}
                    {item.unread ? <span className="size-2 rounded-full bg-primary" aria-label="Unread" /> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } else if (view === "moderation" && isModerator(role)) {
    content = <ModerationPanel tenantId={tenantId} workspace={workspace} people={people} act={act} onOpenPost={setOpenPostId} onError={(message) => notify(message, true)} />;
  } else if (view === "people" && isManager(role)) {
    content = <PeoplePanel tenantId={tenantId} workspace={workspace} act={act} onLeft={onLeft} onNotice={notify} />;
  } else if (view === "settings" && isManager(role)) {
    content = <SettingsPanel tenantId={tenantId} workspace={workspace} act={act} onNotice={notify} refresh={refresh} />;
  } else {
    content = (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">{workspace.community.name}</p>
              <h1 className="brand-heading text-3xl leading-tight">{activeQuery ? `Results for “${activeQuery}”` : savedOnly ? "Saved posts" : "Home"}</h1>
            </div>
            <div className="flex rounded-full bg-muted p-1 text-sm" role="group" aria-label="Show">
              <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)} className={cn("rounded-full px-3 py-1", !savedOnly ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}>Latest</button>
              <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1", savedOnly ? "bg-card font-semibold shadow-xs" : "text-muted-foreground")}><Bookmark className="size-3.5" aria-hidden="true" /> Saved</button>
            </div>
          </div>
          {activeQuery ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="size-4" aria-hidden="true" /> Best matches among recent posts you can see.
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setActiveQuery("")}>Clear search</Button>
            </p>
          ) : null}
          {workspace.spaces.length === 0 ? (
            <EmptyInvite
              icon={MessagesSquare}
              title={isManager(role) ? "Open your first space" : "Spaces are on their way"}
              body={isManager(role) ? "Spaces are where conversations happen. Start with a welcome space, then share the invite link." : "The team hasn't opened a space to you yet."}
              action={isManager(role) ? <Button className="rounded-full" onClick={() => navigate({ view: "settings" })}>Create a space</Button> : null}
            />
          ) : postable.length ? (
            <ComposerPrompt me={me} placeholder={`What's on your mind, ${me.name.split(/\s+/)[0] || "friend"}?`} onOpen={() => setComposer({ open: true })} />
          ) : null}
          <PagedPosts
            tenantId={tenantId}
            version={version}
            params={{ filter: savedOnly ? "saved" : "all", q: activeQuery || undefined }}
            renderPost={renderPost}
            empty={activeQuery ? `Nothing matches “${activeQuery}”.` : savedOnly ? "Tap the bookmark on any post to keep it here." : "No posts yet. Start the first conversation."}
          />
        </div>
        <FeedRail workspace={workspace} people={people} onOpenPost={setOpenPostId} onMembers={() => navigate({ view: "members" })} onEvents={() => navigate({ view: "events" })} />
      </div>
    );
  }

  return shell(
    <>
      {content}
      <Composer
        key={composer.spaceId ?? "any"}
        open={composer.open}
        onOpenChange={(open) => setComposer((current) => ({ ...current, open }))}
        spaces={postable}
        defaultSpaceId={composer.spaceId ?? postable[0]?.id}
        onSubmit={async (action) => {
          await act(action, "Posted.");
          setComposer({ open: false });
        }}
      />
      <Dialog open={appealing !== null} onOpenChange={(open) => (!open ? setAppealing(null) : undefined)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!appealing) return;
              const target = appealing;
              setAppealing(null);
              await act({ type: "post.appeal", postId: target.postId, message: appealMessage }, "Appeal sent. A moderator other than the one who removed it will decide.").catch(() => undefined);
              setAppealMessage("");
            }}
          >
            <DialogHeader>
              <DialogTitle>Appeal the removal of “{appealing?.title}”</DialogTitle>
              <DialogDescription>Explain why the post should come back. Moderators see your message, and the decision is logged.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
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
        <ThreadDialog key={openPostId} tenantId={tenantId} postId={openPostId} workspace={workspace} people={people} onClose={() => setOpenPostId(null)} act={act} />
      ) : null}
    </>,
  );
}
