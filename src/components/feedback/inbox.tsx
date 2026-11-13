"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Inbox as InboxIcon, Lock, MessageSquare, Search, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterPosts, POST_STATUSES, segmentVoteCounts, sortPosts, type PostFilter, type PostSort, type PostStatus } from "@/lib/feedback/model";
import { cn } from "@/lib/utils";

import type { AdminData } from "./feedback-workspace";
import { PostDetail } from "./post-detail";
import { AvatarStack, EmptyState, PersonAvatar, STATUS_DISPLAY, StatusDot, TagChip, timeAgo, VoteCount } from "./shared";

type StatusFilter = NonNullable<PostFilter["status"]>;

const wideQuery = "(min-width: 1024px)";
function subscribeWide(listener: () => void) {
  const query = window.matchMedia(wideQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** True on screens wide enough to show the post beside the list. */
function useWide() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);
}

/**
 * The team's triage inbox: filter by board and status on the left, every request with its
 * votes, faces and tags in the middle, and the selected post on the right (a dialog on phones).
 */
export function InboxView({
  data,
  isAdmin,
  canTriage,
  selectedId,
  onSelect,
  reload,
  onCreateBoard,
}: {
  data: AdminData;
  isAdmin: boolean;
  canTriage: boolean;
  selectedId: string | null;
  onSelect: (postId: string | null) => void;
  reload: () => Promise<void>;
  onCreateBoard: () => void;
}) {
  const wide = useWide();
  const [board, setBoard] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PostSort>("votes");
  const [owner, setOwner] = useState("all");
  const [segment, setSegment] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const segmentCounts = useMemo(() => segmentVoteCounts(data.votes, data.profiles), [data.votes, data.profiles]);
  const segments = useMemo(() => [...new Set(data.profiles.map((profile) => profile.segment).filter(Boolean))].sort(), [data.profiles]);
  const tagsById = useMemo(() => new Map(data.tags.map((tag) => [tag.id, tag])), [data.tags]);
  // Companies behind each post, biggest accounts first.
  const companyRank = useMemo(() => {
    const order = ["Enterprise", "Pro", "Education", "Starter"];
    return new Map(data.profiles.filter((profile) => profile.company).map((profile) => {
      const rank = order.indexOf(profile.segment);
      return [profile.company, rank === -1 ? order.length : rank];
    }));
  }, [data.profiles]);
  const boardsById = useMemo(() => new Map(data.boards.map((entry) => [entry.id, entry])), [data.boards]);
  const votersByPost = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const vote of data.votes) map.set(vote.postId, [...(map.get(vote.postId) ?? []), vote.uid]);
    return map;
  }, [data.votes]);

  const inBoard = useMemo(() => data.posts.filter((post) => board === "all" || post.boardId === board), [data.posts, board]);
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: inBoard.length, active: inBoard.filter((post) => post.status !== "duplicate" && post.status !== "declined" && post.status !== "completed").length };
    for (const value of POST_STATUSES) counts[value] = inBoard.filter((post) => post.status === value).length;
    return counts;
  }, [inBoard]);

  const posts = useMemo(() => {
    const scoped = inBoard.filter((post) =>
      (owner === "all" || (owner === "none" ? !post.owner : post.owner?.uid === owner)) &&
      (segment === "all" || (segmentCounts.get(post.id)?.segments[segment] ?? 0) > 0));
    const sorted = sortPosts(filterPosts(scoped, { status, query }), sort);
    return segment === "all" ? sorted : [...sorted].sort((a, b) => (segmentCounts.get(b.id)?.segments[segment] ?? 0) - (segmentCounts.get(a.id)?.segments[segment] ?? 0));
  }, [inBoard, owner, segment, status, query, sort, segmentCounts]);

  const selected = data.posts.find((post) => post.id === selectedId) ?? (wide ? posts[0] ?? null : null);

  if (data.boards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<InboxIcon />}
          title="Your inbox fills up from your boards"
          action={isAdmin ? <Button onClick={onCreateBoard}>Create your first board</Button> : null}
        >
          Create a board, share its link, and every idea and vote lands here for your team to triage.
          {isAdmin ? null : " Ask a workspace admin to create one."}
        </EmptyState>
      </div>
    );
  }

  const rail = (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="px-2 pb-1 text-xs font-bold text-muted-foreground">Boards</p>
        {[{ id: "all", name: "All boards", isPublic: true }, ...data.boards].map((entry) => {
          const count = entry.id === "all" ? data.posts.length : data.posts.filter((post) => post.boardId === entry.id).length;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setBoard(entry.id)}
              aria-pressed={board === entry.id}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
                board === entry.id ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {!entry.isPublic ? <Lock className="size-3 text-muted-foreground" aria-label="Private board" /> : null}
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-1">
        <p className="px-2 pb-1 text-xs font-bold text-muted-foreground">Status</p>
        {(["active", ...POST_STATUSES, "all"] as StatusFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-medium",
              status === value ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
          >
            {value === "active" || value === "all" ? <span className="inline-block size-2 rounded-full border border-muted-foreground/50" aria-hidden="true" /> : <StatusDot status={value as PostStatus} />}
            <span className="min-w-0 flex-1 truncate">{value === "active" ? "Needs attention" : value === "all" ? "Everything" : STATUS_DISPLAY[value as PostStatus]}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{statusCounts[value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-2 px-2">
        <p className="text-xs font-bold text-muted-foreground">Owner</p>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger className="h-9 w-full bg-card" aria-label="Filter by owner"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="none">Unassigned</SelectItem>
            {data.members.map((member) => (
              <SelectItem key={member.uid} value={member.uid}>
                <PersonAvatar person={{ uid: member.uid, name: member.name || member.email }} people={data.people} size="xs" />
                {data.people[member.uid]?.name || member.name || member.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="pt-2 text-xs font-bold text-muted-foreground">Customer segment</p>
        <Select value={segment} onValueChange={setSegment}>
          <SelectTrigger className="h-9 w-full bg-card" aria-label="Filter by customer segment"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            {segments.map((entry) => <SelectItem key={entry} value={entry}>Voted by {entry}</SelectItem>)}
          </SelectContent>
        </Select>
        {segments.length === 0 ? <p className="text-xs text-muted-foreground">Add a voter&apos;s company and segment from any post to rank requests by who wants them.</p> : null}
      </div>
    </div>
  );

  return (
    <div className="grid w-full gap-0 lg:grid-cols-[232px_minmax(0,1fr)_minmax(0,1.15fr)]">
      <aside className={cn("border-border px-4 pt-5 lg:block lg:border-r lg:px-3", showFilters ? "block pb-4" : "hidden")} aria-label="Filters">
        {rail}
      </aside>

      <section className="min-w-0 border-border lg:border-r" aria-label="Posts">
        <div className="sticky top-16 z-10 flex items-center gap-2 border-b border-border bg-brand-subtle/95 px-4 py-3 backdrop-blur max-lg:top-[7.25rem]">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input className="h-9 bg-card pl-9" placeholder="Search posts" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search posts" />
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as PostSort)}>
            <SelectTrigger className="h-9 w-36 bg-card" aria-label="Sort posts"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="votes">Top votes</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="comments">Most discussed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon-lg" className="bg-card lg:hidden" onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters} aria-label="Filters">
            <SlidersHorizontal />
          </Button>
        </div>

        {posts.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<InboxIcon />} title={data.posts.length === 0 ? "No ideas yet" : "Nothing matches these filters"}>
              {data.posts.length === 0 ? "Share a board link with your customers. Their ideas and votes arrive here." : "Try another status or board, or clear the search."}
            </EmptyState>
          </div>
        ) : (
          <ul className="grid gap-2 p-3">
            {posts.map((post) => {
              const voterUids = votersByPost.get(post.id) ?? [];
              const faces = voterUids.filter((uid) => data.people[uid]).slice(0, 3).map((uid) => ({ uid, name: data.people[uid].name || "Voter", photoURL: data.people[uid].photoURL }));
              const companies = [...(segmentCounts.get(post.id)?.companies ?? [])].sort((a, b) => (companyRank.get(a) ?? 9) - (companyRank.get(b) ?? 9));
              const active = selected?.id === post.id;
              return (
                <li key={post.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(post.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full gap-3 rounded-xl border bg-card p-3 text-left transition-shadow",
                      active ? "border-primary/60 shadow-[0_0_0_3px] shadow-primary/15" : "border-border hover:border-foreground/20 hover:shadow-sm",
                      post.hidden && "opacity-60",
                    )}
                  >
                    <VoteCount votes={post.voteCount} className="h-14 self-start" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-bold leading-snug">{post.title}</span>
                        <StatusDot status={post.status} className="mt-1.5" />
                      </span>
                      {post.description ? <span className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{post.description}</span> : null}
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <PersonAvatar person={post.author} people={data.people} size="xs" />
                          <span className="font-medium text-foreground/80">{data.people[post.author.uid]?.name || post.author.name}</span>
                        </span>
                        <span>{timeAgo(post.createdAt)}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" aria-hidden="true" />{post.commentCount}</span>
                        <span className="truncate">{boardsById.get(post.boardId)?.name}</span>
                        {post.hidden ? <Badge variant="destructive">Hidden</Badge> : null}
                      </span>
                      {(post.tags.length || faces.length || post.owner || companies.length) ? (
                        <span className="mt-2 flex flex-wrap items-center gap-1.5">
                          {post.tags.map((id) => { const tag = tagsById.get(id); return tag ? <TagChip key={id} tag={tag} className="h-5 text-[11px]" /> : null; })}
                          {companies.slice(0, 2).map((company) => <Badge key={company} variant="secondary" className="h-5 text-[11px]">{company}</Badge>)}
                          {companies.length > 2 ? <span className="text-[11px] font-medium text-muted-foreground">+{companies.length - 2} companies</span> : null}
                          <span className="ml-auto flex items-center gap-2">
                            <AvatarStack people={faces} extra={Math.max(0, post.voteCount - faces.length)} label={`${post.voteCount} voters`} />
                            {post.owner ? <PersonAvatar person={post.owner} people={data.people} size="xs" className="ring-2 ring-secondary" /> : null}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {wide ? (
        <section className="min-w-0" aria-label="Selected post">
          <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto bg-background">
            {selected ? (
              <PostDetail
                key={selected.id}
                tenantId={data.tenant.id}
                post={selected}
                data={data}
                isAdmin={isAdmin}
                canTriage={canTriage}
                onChanged={reload}
                onOpenPost={onSelect}
              />
            ) : (
              <div className="p-6"><EmptyState title="Pick a post">Its thread, voters and status controls open here.</EmptyState></div>
            )}
          </div>
        </section>
      ) : (
        <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) onSelect(null); }}>
          <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
            <DialogTitle className="sr-only">{selected ? `#${selected.number} ${selected.title}` : "Post"}</DialogTitle>
            {selected ? (
              <PostDetail
                key={selected.id}
                tenantId={data.tenant.id}
                post={selected}
                data={data}
                isAdmin={isAdmin}
                canTriage={canTriage}
                onChanged={reload}
                onOpenPost={onSelect}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
