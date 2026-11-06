"use client";

import { useState } from "react";
import { Award, BookOpen, CalendarClock, Lock, Plus, Users } from "lucide-react";

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
import { courseProgress, isManager, type CommunityAction } from "@/lib/community/model";

import { formatWhen, paperCard, type Workspace } from "./api";

type Act = (action: CommunityAction, success?: string) => Promise<unknown>;
type WorkspaceCohort = Workspace["cohorts"][number];

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

export function LearnPanel({ workspace, act }: { workspace: Workspace; act: Act }) {
  const manager = isManager(workspace.me.role);
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [cohortDialog, setCohortDialog] = useState<{ mode: "create" } | { mode: "edit"; cohort: WorkspaceCohort } | null>(null);
  const [rosterFor, setRosterFor] = useState<WorkspaceCohort | null>(null);
  const [openLesson, setOpenLesson] = useState<{ courseId: string; lessonId: string } | null>(null);
  const spaceName = new Map(workspace.spaces.map((space) => [space.id, space.name]));
  const lesson = openLesson
    ? workspace.courses.find((course) => course.id === openLesson.courseId)?.lessons.find((entry) => entry.id === openLesson.lessonId) ?? null
    : null;
  const myCohorts = workspace.cohorts.filter((cohort) => cohort.memberUids.includes(workspace.me.uid));

  return (
    <div className="flex flex-col gap-4">
      <section className={`${paperCard} flex flex-col gap-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-black"><Users size={18} /> Cohorts</h2>
          {manager ? <Button size="sm" onClick={() => setCohortDialog({ mode: "create" })}><Plus /> New cohort</Button> : null}
        </div>
        {workspace.cohorts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            {manager ? "Group members into cohorts with a start date. Cohorts can open private spaces and pace course lessons from their start." : "You are not in a cohort."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {workspace.cohorts.map((cohort) => (
              <li key={cohort.id} className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{cohort.name}</strong>
                <span className="text-[var(--muted)]">starts {day(cohort.startsAt)}</span>
                {manager ? <Badge variant="secondary">{cohort.memberUids.length} members</Badge> : <Badge className="bg-[#a855f7] text-white">You</Badge>}
                {manager ? (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setRosterFor(cohort)}>Members</Button>
                    <Button size="sm" variant="ghost" onClick={() => setCohortDialog({ mode: "edit", cohort })}>Edit</Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

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
                <p className="text-xs text-[var(--muted)]">
                  {spaceName.get(course.spaceId) ?? "Space"} · {course.lessons.length} {course.lessons.length === 1 ? "lesson" : "lessons"}
                  {course.dripByCohort ? " · paced from your cohort's start" : ""}
                </p>
              </div>
              {progress?.certificateId ? (
                <Badge className="bg-[#a855f7] text-white"><Award size={12} /> Certificate {progress.certificateId.slice(-8)} · {formatWhen(progress.completedAt)}</Badge>
              ) : null}
            </div>
            {course.description ? <p className="text-sm">{course.description}</p> : null}
            {manager ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={course.dripByCohort === true}
                  onCheckedChange={(checked) => void act({ type: "course.drip", courseId: course.id, dripByCohort: checked }, checked ? "Lessons now unlock on their day after each member's cohort start." : "Every lesson is open again.").catch(() => undefined)}
                />
                Drip lessons by cohort start
              </label>
            ) : course.dripByCohort && myCohorts.length === 0 ? (
              <p className="text-xs text-[var(--muted)]">Later lessons unlock once you are added to a cohort.</p>
            ) : null}
            <div className="flex items-center gap-3">
              <Progress value={summary.percent} className="flex-1" aria-label={`${summary.percent}% complete`} />
              <span className="text-sm font-semibold">{summary.completed}/{summary.total}</span>
            </div>
            <ol className="flex flex-col gap-1">
              {course.lessons.map((entry, index) => {
                const done = progress?.completedLessonIds.includes(entry.id) ?? false;
                const locked = !entry.access.unlocked;
                return (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Checkbox
                      checked={done}
                      disabled={locked}
                      aria-label={`Mark ${entry.title} complete`}
                      onCheckedChange={(checked) => void act({ type: "lesson.complete", courseId: course.id, lessonId: entry.id, completed: checked === true }).catch(() => undefined)}
                    />
                    {locked ? (
                      <span className="flex items-center gap-1 text-[var(--muted)]">
                        <Lock size={12} /> {index + 1}. {entry.title} · {entry.access.unlocksAt ? `unlocks ${day(entry.access.unlocksAt)}` : "unlocks when you join a cohort"}
                      </span>
                    ) : (
                      <button type="button" className="text-left hover:underline" onClick={() => setOpenLesson({ courseId: course.id, lessonId: entry.id })}>
                        {index + 1}. {entry.title}
                      </button>
                    )}
                    {manager && course.dripByCohort ? (
                      <LessonDayInput
                        value={entry.unlockDay ?? 0}
                        label={`Unlock day for ${entry.title}`}
                        onSave={(unlockDay) => void act({ type: "lesson.schedule", courseId: course.id, lessonId: entry.id, unlockDay }, `${entry.title} now unlocks on day ${unlockDay}.`).catch(() => undefined)}
                      />
                    ) : null}
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
      {addingTo ? (
        <LessonDialog courseId={addingTo} drip={workspace.courses.find((course) => course.id === addingTo)?.dripByCohort === true} act={act} onClose={() => setAddingTo(null)} />
      ) : null}
      {cohortDialog ? (
        <CohortDialog key={cohortDialog.mode === "edit" ? cohortDialog.cohort.id : "new"} initial={cohortDialog.mode === "edit" ? cohortDialog.cohort : null} act={act} onClose={() => setCohortDialog(null)} />
      ) : null}
      {rosterFor ? <CohortMembersDialog key={rosterFor.id} cohort={rosterFor} members={workspace.members} act={act} onClose={() => setRosterFor(null)} /> : null}
    </div>
  );
}

function LessonDayInput({ value, label, onSave }: { value: number; label: string; onSave: (day: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 365;
  return (
    <span className="ml-auto flex items-center gap-1 text-xs">
      <CalendarClock size={12} /> Day
      <Input
        aria-label={label}
        aria-invalid={!valid}
        type="number"
        min={0}
        max={365}
        className="h-7 w-16"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (valid && parsed !== value) onSave(parsed);
        }}
      />
    </span>
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
            <DialogDescription>The course is visible to everyone who can see its space, including plan- and cohort-gated private spaces.</DialogDescription>
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

function LessonDialog({ courseId, drip, act, onClose }: { courseId: string; drip: boolean; act: Act; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [unlockDay, setUnlockDay] = useState("0");
  const parsedDay = Number(unlockDay);
  const dayValid = Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 365;
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await act({ type: "lesson.add", courseId, title, body, unlockDay: dayValid ? parsedDay : 0 }, "Lesson added.").then(onClose).catch(() => undefined);
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lesson-day">Unlocks on day (after cohort start)</Label>
            <Input id="lesson-day" type="number" min={0} max={365} className="w-28" value={unlockDay} aria-invalid={!dayValid} onChange={(event) => setUnlockDay(event.target.value)} />
            <p className="text-xs text-[var(--muted)]">{drip ? "Day 0 is open from the cohort's first day." : "Only applies once you turn on drip for this course."}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title.trim() || !body.trim() || !dayValid}>Add lesson</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CohortDialog({ initial, act, onClose }: { initial: WorkspaceCohort | null; act: Act; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [startsAt, setStartsAt] = useState(initial?.startsAt.slice(0, 10) ?? "");
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const action: CommunityAction = initial ? { type: "cohort.update", cohortId: initial.id, name, startsAt } : { type: "cohort.create", name, startsAt };
            await act(action, initial ? "Cohort updated." : "Cohort created. Add members next.").then(onClose).catch(() => undefined);
          }}
        >
          <DialogHeader>
            <DialogTitle>{initial ? `Edit ${initial.name}` : "New cohort"}</DialogTitle>
            <DialogDescription>Dripped lessons unlock counting from this start date. Changing it re-paces every member of the cohort.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cohort-name">Name</Label>
            <Input id="cohort-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Spring 2027" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cohort-start">Start date</Label>
            <Input id="cohort-start" type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || !startsAt}>{initial ? "Save" : "Create cohort"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CohortMembersDialog({ cohort, members, act, onClose }: { cohort: WorkspaceCohort; members: Workspace["members"]; act: Act; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(cohort.memberUids);
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Members of {cohort.name}</DialogTitle>
          <DialogDescription>Members only learn which cohorts they are in, never who else is. Changes are logged.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <label key={member.uid} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(member.uid)}
                onCheckedChange={(checked) => setSelected((current) => (checked ? [...current, member.uid] : current.filter((uid) => uid !== member.uid)))}
              />
              {member.displayName} {member.handle ? <span className="text-xs text-[var(--muted)]">@{member.handle}</span> : null}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void act({ type: "cohort.members", cohortId: cohort.id, memberUids: selected }, "Cohort members saved.").then(onClose).catch(() => undefined)}>Save members</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
