"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, EyeOff, LoaderCircle, MessagesSquare, RotateCcw, Send } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { orderedLessons, type CommentDoc, type CourseDoc } from "@/lib/creator/model";
import { cn } from "@/lib/utils";

import { apiJson, timeAgo } from "./client";

type LearnerComment = { id: string; name: string; photoURL: string | null; body: string; createdAt: string; mine: boolean };
type ModerationComment = CommentDoc & { photoURL: string | null };

/** The thread under a lesson, for enrolled learners. */
export function LessonDiscussion({ base, lessonId }: { base: string; lessonId: string }) {
  const [comments, setComments] = useState<LearnerComment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<{ comments: LearnerComment[] }>(`${base}/comments?lessonId=${encodeURIComponent(lessonId)}`)
      .then((result) => { if (active) setComments(result.comments); })
      .catch((caught) => { if (active) { setError(caught instanceof Error ? caught.message : "The discussion couldn't be loaded."); setComments([]); } });
    return () => { active = false; };
  }, [base, lessonId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const { comment } = await apiJson<{ comment: LearnerComment }>(`${base}/comments`, { method: "POST", body: JSON.stringify({ lessonId, body }) });
      setComments((current) => [...(current ?? []), comment]);
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your comment couldn't be posted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid gap-5 border-t border-border pt-8" aria-label="Lesson discussion">
      <h2 className="brand-heading flex items-center gap-2 text-2xl">
        <MessagesSquare className="size-5 text-primary" aria-hidden="true" /> Discussion
        {comments?.length ? <span className="text-base text-muted-foreground">({comments.length})</span> : null}
      </h2>
      {comments === null ? <div className="grid gap-3">{[0, 1].map((key) => <Skeleton key={key} className="h-16 rounded-xl" />)}</div> : null}
      {comments?.length === 0 ? <p className="text-sm text-muted-foreground">Be the first to say something. Ask a question, or share what you made.</p> : null}
      <ul className="grid gap-5">
        {comments?.map((comment) => (
          <li key={comment.id} className="flex gap-3">
            <UserAvatar person={{ uid: "", name: comment.name, photoURL: comment.photoURL }} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold">{comment.name}</span>
                {comment.mine ? <Badge variant="secondary" className="ml-2">You</Badge> : null}
                <span className="ml-2 text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="grid gap-2 rounded-2xl bg-brand-subtle p-3 ring-1 ring-border">
        <Textarea aria-label="Your comment" rows={3} value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="Share a question or something you learned" className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" />
        <div className="flex justify-end">
          <Button type="submit" className="rounded-xl" disabled={pending || !body.trim()}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Send />} Post
          </Button>
        </div>
      </form>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}

/** Every lesson thread in the school, for the team. */
export function DiscussionsModeration({ tenantId, courses, canModerate }: { tenantId: string; courses: CourseDoc[]; canModerate: boolean }) {
  const [comments, setComments] = useState<ModerationComment[] | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    let active = true;
    apiJson<{ comments: ModerationComment[] }>(`/api/creator/tenants/${tenantId}/comments`)
      .then((result) => { if (active) setComments(result.comments); })
      .catch((caught) => { if (active) { setError(caught instanceof Error ? caught.message : "Discussions couldn't be loaded."); setComments([]); } });
    return () => { active = false; };
  }, [tenantId]);

  async function toggle(comment: ModerationComment) {
    setPendingId(comment.id);
    setError("");
    try {
      const { comment: updated } = await apiJson<{ comment: CommentDoc }>(`/api/creator/tenants/${tenantId}/comments/${comment.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !comment.hidden }) });
      setComments((current) => current?.map((entry) => (entry.id === updated.id ? { ...entry, ...updated, name: entry.name, photoURL: entry.photoURL } : entry)) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That comment couldn't be updated.");
    } finally {
      setPendingId("");
    }
  }

  const courseTitle = new Map(courses.map((course) => [course.id, course.title]));
  const lessonTitle = new Map(courses.flatMap((course) => orderedLessons(course.modules).map((lesson) => [`${course.id}:${lesson.id}`, lesson.title] as const)));

  return (
    <div className="grid gap-4">
      {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {comments === null ? <div className="grid gap-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-24 rounded-2xl" />)}</div> : null}
      {comments?.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><MessagesSquare className="size-5" aria-hidden="true" /></span>
          <h2 className="brand-heading mt-4 text-xl">Quiet for now</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Every lesson has a discussion. When learners ask questions or share their work, it shows up here so you can reply in the lesson.</p>
        </div>
      ) : null}
      {comments && comments.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {comments.map((comment, index) => (
            <li key={comment.id} className={cn("flex gap-4 px-5 py-4", index && "border-t border-border", comment.hidden && "bg-muted/50")}>
              <UserAvatar person={{ uid: comment.uid, name: comment.name, photoURL: comment.photoURL }} size="lg" className={cn(comment.hidden && "opacity-50")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-semibold">{comment.name}</span>
                  <span className="text-xs text-muted-foreground">
                    in {lessonTitle.get(`${comment.courseId}:${comment.lessonId}`) ?? "a removed lesson"} · {courseTitle.get(comment.courseId) ?? "a removed course"} · {timeAgo(comment.createdAt)}
                  </span>
                  {comment.hidden ? <Badge variant="outline">Hidden from learners</Badge> : null}
                </div>
                <p className={cn("mt-1 whitespace-pre-wrap text-sm leading-relaxed", comment.hidden && "text-muted-foreground line-through decoration-muted-foreground/40")}>{comment.body}</p>
              </div>
              {canModerate ? (
                <Button size="sm" variant="ghost" className="shrink-0 self-start" disabled={pendingId === comment.id} onClick={() => void toggle(comment)}>
                  {pendingId === comment.id ? <LoaderCircle className="animate-spin" /> : comment.hidden ? <RotateCcw aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
                  {comment.hidden ? "Restore" : "Hide"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
