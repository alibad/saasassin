"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CircleAlert, EyeOff, LoaderCircle, MessagesSquare, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { orderedLessons, type CommentDoc, type CourseDoc } from "@/lib/creator/model";

import { apiJson, formatDate, panelClass } from "./client";

type LearnerComment = { id: string; name: string; body: string; createdAt: string; mine: boolean };

/** Learner-side thread under a lesson. */
export function LessonDiscussion({ base, lessonId }: { base: string; lessonId: string }) {
  const [comments, setComments] = useState<LearnerComment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<{ comments: LearnerComment[] }>(`${base}/comments?lessonId=${encodeURIComponent(lessonId)}`)
      .then((result) => { if (active) setComments(result.comments); })
      .catch((caught) => { if (active) { setError(caught instanceof Error ? caught.message : "Could not load the discussion."); setComments([]); } });
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
      setError(caught instanceof Error ? caught.message : "Could not post your comment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 border-t-2 border-neutral-900 pt-4" aria-label="Lesson discussion">
      <h2 className="flex items-center gap-2 font-bold"><MessagesSquare className="size-4" aria-hidden="true" /> Discussion</h2>
      {comments === null && <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading…</p>}
      {comments?.length === 0 && <p className="text-sm text-neutral-600">No comments yet. Ask a question or share what you made.</p>}
      <ul className="space-y-2">
        {comments?.map((comment) => (
          <li key={comment.id} className="border border-neutral-300 bg-neutral-50 p-3 text-sm">
            <p className="text-xs text-neutral-500"><span className="font-semibold text-neutral-800">{comment.name}</span>{comment.mine ? " (you)" : ""} · {formatDate(comment.createdAt, true)}</p>
            <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="grid gap-2">
        <Textarea aria-label="Your comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Share a question or insight with other learners" />
        <div><Button type="submit" size="sm" disabled={pending || !body.trim()}>{pending ? "Posting…" : "Post comment"}</Button></div>
      </form>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}

/** Creator-side moderation of every lesson thread. */
export function DiscussionsModeration({ tenantId, courses, canModerate }: { tenantId: string; courses: CourseDoc[]; canModerate: boolean }) {
  const [comments, setComments] = useState<CommentDoc[] | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");

  useEffect(() => {
    let active = true;
    apiJson<{ comments: CommentDoc[] }>(`/api/creator/tenants/${tenantId}/comments`)
      .then((result) => { if (active) setComments(result.comments); })
      .catch((caught) => { if (active) { setError(caught instanceof Error ? caught.message : "Could not load discussions."); setComments([]); } });
    return () => { active = false; };
  }, [tenantId]);

  async function toggle(comment: CommentDoc) {
    setPendingId(comment.id);
    setError("");
    try {
      const { comment: updated } = await apiJson<{ comment: CommentDoc }>(`/api/creator/tenants/${tenantId}/comments/${comment.id}`, { method: "PATCH", body: JSON.stringify({ hidden: !comment.hidden }) });
      setComments((current) => current?.map((entry) => (entry.id === updated.id ? updated : entry)) ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the comment.");
    } finally {
      setPendingId("");
    }
  }

  const courseTitle = new Map(courses.map((course) => [course.id, course.title]));
  const lessonTitle = new Map(courses.flatMap((course) => orderedLessons(course.modules).map((lesson) => [`${course.id}:${lesson.id}`, lesson.title] as const)));

  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Lesson discussions</CardTitle>
        <CardDescription>Comments enrolled learners post under lessons, newest first. Hiding removes a comment from learners’ view and is recorded in the audit log; you can restore it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {comments === null && <p className="flex items-center gap-2 text-sm text-neutral-600"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading…</p>}
        {comments?.length === 0 && <p className="text-sm text-neutral-600">No learner comments yet.</p>}
        <ul className="space-y-2">
          {comments?.map((comment) => (
            <li key={comment.id} className={`border-2 p-3 text-sm ${comment.hidden ? "border-dashed border-neutral-400 bg-neutral-100 text-neutral-500" : "border-neutral-900 bg-white"}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span className="font-semibold text-neutral-800">{comment.name}</span>
                <span>{courseTitle.get(comment.courseId) ?? "Deleted course"} › {lessonTitle.get(`${comment.courseId}:${comment.lessonId}`) ?? "Deleted lesson"}</span>
                <span>{formatDate(comment.createdAt, true)}</span>
                {comment.hidden && <Badge variant="outline">Hidden</Badge>}
                {canModerate && (
                  <Button size="sm" variant="ghost" className="ml-auto" disabled={pendingId === comment.id} onClick={() => toggle(comment)}>
                    {comment.hidden ? <><RotateCcw aria-hidden="true" /> Restore</> : <><EyeOff aria-hidden="true" /> Hide</>}
                  </Button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
