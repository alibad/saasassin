"use client";

import { useState } from "react";
import { Award, BookOpen, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { courseProgress, isManager, type CommunityAction } from "@/lib/community/model";

import { formatWhen, paperCard, type Workspace } from "./api";

type Act = (action: CommunityAction, success?: string) => Promise<unknown>;

export function LearnPanel({ workspace, act }: { workspace: Workspace; act: Act }) {
  const manager = isManager(workspace.me.role);
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<{ courseId: string; lessonId: string } | null>(null);
  const spaceName = new Map(workspace.spaces.map((space) => [space.id, space.name]));
  const lesson = openLesson
    ? workspace.courses.find((course) => course.id === openLesson.courseId)?.lessons.find((entry) => entry.id === openLesson.lessonId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">Courses</h2>
        {manager ? <Button onClick={() => setCreating(true)} disabled={workspace.spaces.length === 0}><Plus /> New course</Button> : null}
      </div>
      {workspace.courses.length === 0 ? (
        <p className={`${paperCard} p-6 text-sm text-[var(--muted)]`}>
          {manager ? "Create a course inside a space; members who can see that space can take it." : "No courses are open to you yet."}
        </p>
      ) : null}
      {workspace.courses.map((course) => {
        const progress = workspace.myProgress[course.id];
        const summary = courseProgress(course, progress?.completedLessonIds ?? []);
        return (
          <section key={course.id} className={`${paperCard} flex flex-col gap-3 p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold"><BookOpen size={18} /> {course.title}</h3>
                <p className="text-xs text-[var(--muted)]">{spaceName.get(course.spaceId) ?? "Space"} · {course.lessons.length} {course.lessons.length === 1 ? "lesson" : "lessons"}</p>
              </div>
              {progress?.certificateId ? (
                <Badge className="bg-[#a855f7] text-white"><Award size={12} /> Certificate {progress.certificateId.slice(-8)} · {formatWhen(progress.completedAt)}</Badge>
              ) : null}
            </div>
            {course.description ? <p className="text-sm">{course.description}</p> : null}
            <div className="flex items-center gap-3">
              <Progress value={summary.percent} className="flex-1" aria-label={`${summary.percent}% complete`} />
              <span className="text-sm font-semibold">{summary.completed}/{summary.total}</span>
            </div>
            <ol className="flex flex-col gap-1">
              {course.lessons.map((entry, index) => {
                const done = progress?.completedLessonIds.includes(entry.id) ?? false;
                return (
                  <li key={entry.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={done}
                      aria-label={`Mark ${entry.title} complete`}
                      onCheckedChange={(checked) => void act({ type: "lesson.complete", courseId: course.id, lessonId: entry.id, completed: checked === true }).catch(() => undefined)}
                    />
                    <button type="button" className="text-left hover:underline" onClick={() => setOpenLesson({ courseId: course.id, lessonId: entry.id })}>
                      {index + 1}. {entry.title}
                    </button>
                  </li>
                );
              })}
            </ol>
            {manager ? <Button variant="outline" size="sm" className="self-start" onClick={() => setAddingTo(course.id)}><Plus /> Add lesson</Button> : null}
          </section>
        );
      })}

      <Dialog open={lesson !== null} onOpenChange={(open) => (!open ? setOpenLesson(null) : undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{lesson?.title}</DialogTitle>
            <DialogDescription>Mark the lesson complete from the course list when you are done.</DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-line">{lesson?.body}</p>
        </DialogContent>
      </Dialog>

      {creating ? <CourseDialog workspace={workspace} act={act} onClose={() => setCreating(false)} /> : null}
      {addingTo ? <LessonDialog courseId={addingTo} act={act} onClose={() => setAddingTo(null)} /> : null}
    </div>
  );
}

function CourseDialog({ workspace, act, onClose }: { workspace: Workspace; act: Act; onClose: () => void }) {
  const [spaceId, setSpaceId] = useState(workspace.spaces[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await act({ type: "course.create", spaceId, title, description }, "Course created.").then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>The course is visible to everyone who can see its space, including plan-gated private spaces.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>Space</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choose a space" /></SelectTrigger>
              <SelectContent>
                {workspace.spaces.map((space) => <SelectItem key={space.id} value={space.id}>{space.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="course-title">Title</Label>
            <Input id="course-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="course-description">Description</Label>
            <Textarea id="course-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!spaceId || !title.trim()}>Create course</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({ courseId, act, onClose }: { courseId: string; act: Act; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await act({ type: "lesson.add", courseId, title, body }, "Lesson added.").then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a lesson</DialogTitle>
            <DialogDescription>Lessons appear in the order you add them.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lesson-title">Title</Label>
            <Input id="lesson-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lesson-body">Content</Label>
            <Textarea id="lesson-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={20000} rows={8} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || !body.trim()}>Add lesson</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
