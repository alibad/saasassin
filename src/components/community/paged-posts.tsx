"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FEED_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/community/model";

import { api, paperCard, type FeedPage, type WorkspacePost } from "./api";

type FeedParams = { space?: string; filter?: "all" | "saved"; q?: string };

function feedUrl(tenantId: string, params: FeedParams, extra: { cursor?: string | null; limit?: number }) {
  const search = new URLSearchParams();
  if (params.space) search.set("space", params.space);
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.q) search.set("q", params.q);
  if (extra.cursor) search.set("cursor", extra.cursor);
  if (extra.limit) search.set("limit", String(extra.limit));
  return `/api/community/tenants/${tenantId}/feed?${search.toString()}`;
}

/**
 * A server-paginated list of posts with "Load more". When `version` changes (after any action),
 * it re-reads everything already loaded in one request so counts update without losing the reader's place.
 */
export function PagedPosts({
  tenantId,
  params,
  version,
  empty,
  renderPost,
}: {
  tenantId: string;
  params: FeedParams;
  version: number;
  empty: string;
  renderPost: (post: WorkspacePost) => ReactNode;
}) {
  const key = JSON.stringify(params);
  const [state, setState] = useState<{ key: string; pinned: WorkspacePost[]; posts: WorkspacePost[]; nextCursor: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(0);
  useEffect(() => {
    loaded.current = state?.key === key ? state.posts.length : 0;
  }, [state, key]);

  useEffect(() => {
    let cancelled = false;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(FEED_PAGE_SIZE, loaded.current));
    api<FeedPage>(feedUrl(tenantId, JSON.parse(key) as FeedParams, { limit }))
      .then((page) => {
        if (cancelled) return;
        setState({ key, pinned: page.pinned, posts: page.posts, nextCursor: page.nextCursor });
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load posts.");
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, key, version]);

  async function loadMore() {
    if (!state?.nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await api<FeedPage>(feedUrl(tenantId, params, { cursor: state.nextCursor }));
      setState((current) => {
        if (!current || current.key !== key) return current;
        const seen = new Set(current.posts.map((post) => post.id));
        return { ...current, posts: [...current.posts, ...page.posts.filter((post) => !seen.has(post.id))], nextCursor: page.nextCursor };
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load more posts.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (error && state?.key !== key) {
    return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  }
  if (!state || state.key !== key) {
    return <div className="flex items-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="animate-spin" size={16} /> Loading posts</div>;
  }
  const all = [...state.pinned, ...state.posts];
  if (all.length === 0) return <p className={`${paperCard} p-6 text-sm text-[var(--muted)]`}>{empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      {all.map((post) => <div key={post.id}>{renderPost(post)}</div>)}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {state.nextCursor ? (
        <Button variant="outline" className="self-center" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? <LoaderCircle className="animate-spin" /> : null} Load more
        </Button>
      ) : all.length > FEED_PAGE_SIZE ? (
        <p className="text-center text-xs text-[var(--muted)]">You have reached the end.</p>
      ) : null}
    </div>
  );
}
