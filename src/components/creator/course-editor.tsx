"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  COURSE_STATE_LABELS,
  allowedCourseTransitions,
  courseTransitionProblems,
  formatPrice,
  moveItem,
  newId,
  type CourseDoc,
  type CourseModule,
  type CourseState,
  type Lesson,
  type Quiz,
} from "@/lib/creator/model";

import { apiJson, formatDate, panelClass } from "./client";

const TRANSITION_COPY: Record<CourseState, { label: string; icon: typeof Send; description: string }> = {
  published: { label: "Publish", icon: Send, description: "The landing page goes live and signed-in learners can enroll." },
  draft: { label: "Move to draft", icon: EyeOff, description: "The landing page stops resolving. Existing learners keep their progress but cannot open lessons until you publish again." },
  archived: { label: "Archive", icon: Archive, description: "The course is retired and hidden. You can restore it to draft later." },
};

type Props = {
  tenantId: string;
  course: CourseDoc;
  canEdit: boolean;
  canPublish: boolean;
  onChange: (course: CourseDoc) => void;
};

export function CourseEditor({ tenantId, course, canEdit, canPublish, onChange }: Props) {
  const [draft, setDraft] = useState(() => ({
    title: course.title,
    subtitle: course.subtitle,
    description: course.description,
    pricing: course.pricing,
    modules: course.modules,
  }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingTransition, setPendingTransition] = useState<CourseState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ moduleIndex: number; lessonIndex?: number } | null>(null);
  const editable = canEdit && course.status !== "archived";
  const publicPath = `/apps/creator/c/${tenantId}/${course.slug}`;

  function update(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    setNotice("");
  }

  function updateModules(mutator: (modules: CourseModule[]) => CourseModule[]) {
    update({ modules: mutator(draft.modules) });
  }

  function updateLesson(moduleIndex: number, lessonIndex: number, patch: Partial<Lesson>) {
    updateModules((modules) => modules.map((courseModule, mi) => mi !== moduleIndex ? courseModule : {
      ...courseModule,
      lessons: courseModule.lessons.map((lesson, li) => li === lessonIndex ? { ...lesson, ...patch } : lesson),
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const { course: saved } = await apiJson<{ course: CourseDoc }>(`/api/creator/tenants/${tenantId}/courses/${course.id}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      onChange(saved);
      setDirty(false);
      setNotice("Saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the course.");
    } finally {
      setSaving(false);
    }
  }

  async function transition(to: CourseState) {
    setSaving(true);
    setError("");
    try {
      const { course: updated } = await apiJson<{ course: CourseDoc }>(`/api/creator/tenants/${tenantId}/courses/${course.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ to }),
      });
      onChange(updated);
      setNotice(`Course is now ${COURSE_STATE_LABELS[to].toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the course state.");
    } finally {
      setSaving(false);
      setPendingTransition(null);
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const { moduleIndex, lessonIndex } = pendingDelete;
    if (lessonIndex === undefined) updateModules((modules) => modules.filter((_, i) => i !== moduleIndex));
    else updateModules((modules) => modules.map((courseModule, mi) => mi !== moduleIndex ? courseModule : { ...courseModule, lessons: courseModule.lessons.filter((_, li) => li !== lessonIndex) }));
    setPendingDelete(null);
  }

  const transitions = allowedCourseTransitions(course.status).filter((to) => to === "draft" ? canEdit : canPublish);
  const publishProblems = course.status === "draft" ? courseTransitionProblems({ ...course, ...draft }, "published") : [];

  return (
    <div className="space-y-5">
      <Card className={panelClass}>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={course.status === "published" ? "default" : "outline"}>{COURSE_STATE_LABELS[course.status]}</Badge>
            <Badge variant="secondary">{formatPrice(course.pricing)}</Badge>
            <span className="text-xs text-neutral-500">Updated {formatDate(course.updatedAt, true)}{course.publishedAt ? ` · Last published ${formatDate(course.publishedAt)}` : ""}</span>
          </div>
          <CardTitle className="text-xl">{course.title}</CardTitle>
          <CardDescription>
            Landing page: {course.status === "published"
              ? <Link className="inline-flex items-center gap-1 underline" href={publicPath} target="_blank">{publicPath} <ExternalLink className="size-3" aria-hidden="true" /></Link>
              : <span>{publicPath} (live once published)</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {editable && (
            <Button onClick={save} disabled={!dirty || saving}>
              <Save aria-hidden="true" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          )}
          {transitions.map((to) => {
            const copy = TRANSITION_COPY[to];
            const Icon = to === "draft" && course.status === "archived" ? RotateCcw : copy.icon;
            return (
              <Button key={to} variant={to === "published" ? "default" : "outline"} disabled={saving || (to === "published" && dirty)} onClick={() => setPendingTransition(to)}>
                <Icon aria-hidden="true" /> {to === "draft" && course.status === "archived" ? "Restore to draft" : copy.label}
              </Button>
            );
          })}
          {course.status === "published" && (
            <Button variant="ghost" asChild>
              <Link href={publicPath} target="_blank"><Eye aria-hidden="true" /> View landing page</Link>
            </Button>
          )}
        </CardContent>
        {(error || notice || (dirty && course.status === "draft") || publishProblems.length > 0 || !canEdit) && (
          <CardContent className="space-y-2">
            {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
            {!canEdit && <p className="text-sm text-neutral-600">Your role can view this course but not change it.</p>}
            {dirty && course.status === "draft" && <p className="text-sm text-neutral-600">Save your changes before publishing.</p>}
            {canPublish && publishProblems.length > 0 && <p className="text-sm text-neutral-600">Before publishing: {publishProblems.join(" ")}</p>}
          </CardContent>
        )}
      </Card>

      <Card className={panelClass}>
        <CardHeader>
          <CardTitle>Landing page and offer</CardTitle>
          <CardDescription>What visitors read before enrolling.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="course-title">Title</Label>
            <Input id="course-title" value={draft.title} disabled={!editable} onChange={(e) => update({ title: e.target.value })} maxLength={140} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="course-subtitle">Subtitle</Label>
            <Input id="course-subtitle" value={draft.subtitle} disabled={!editable} onChange={(e) => update({ subtitle: e.target.value })} maxLength={240} placeholder="One sentence promise" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="course-description">Description</Label>
            <Textarea id="course-description" value={draft.description} disabled={!editable} onChange={(e) => update({ description: e.target.value })} rows={4} placeholder="Who it is for and what they will be able to do. Supports **bold**, lists and links." />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Pricing</Label>
              <Select
                value={draft.pricing.type}
                disabled={!editable}
                onValueChange={(value) => update({ pricing: value === "paid" ? { type: "paid", amountCents: 4900, currency: "USD" } : { type: "free" } })}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free enrollment</SelectItem>
                  <SelectItem value="paid">Paid (price only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {draft.pricing.type === "paid" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="course-price">Price</Label>
                  <Input
                    id="course-price"
                    type="number"
                    min={1}
                    step="0.01"
                    disabled={!editable}
                    value={(draft.pricing.amountCents / 100).toString()}
                    onChange={(e) => draft.pricing.type === "paid" && update({ pricing: { ...draft.pricing, amountCents: Math.round(Number(e.target.value || 0) * 100) } })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Currency</Label>
                  <Select
                    value={draft.pricing.currency}
                    disabled={!editable}
                    onValueChange={(value) => draft.pricing.type === "paid" && update({ pricing: { ...draft.pricing, currency: value as "USD" } })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "CAD", "AUD"].map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          {draft.pricing.type === "paid" && (
            <Alert>
              <CircleAlert />
              <AlertTitle>Payments not connected</AlertTitle>
              <AlertDescription>
                The price is stored and shown, but no payment provider is connected to this school, so nobody can be charged and paid enrollment stays closed. Switch to free enrollment to accept learners today.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card className={panelClass}>
        <CardHeader>
          <CardTitle>Curriculum</CardTitle>
          <CardDescription>Modules and lessons in the order learners take them. Drip delays count days from each learner’s enrollment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.modules.length === 0 && (
            <p className="rounded border-2 border-dashed border-neutral-300 p-4 text-sm text-neutral-600">No modules yet. Add a module, then add lessons to it.</p>
          )}
          {draft.modules.map((courseModule, moduleIndex) => (
            <section key={courseModule.id} className="space-y-3 border-2 border-neutral-900 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <Label htmlFor={`module-${courseModule.id}`} className="text-xs uppercase tracking-wide text-neutral-500">Module {moduleIndex + 1}</Label>
                  <Input
                    id={`module-${courseModule.id}`}
                    value={courseModule.title}
                    disabled={!editable}
                    onChange={(e) => updateModules((modules) => modules.map((entry, i) => i === moduleIndex ? { ...entry, title: e.target.value } : entry))}
                  />
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="outline" aria-label="Move module up" disabled={moduleIndex === 0} onClick={() => updateModules((modules) => moveItem(modules, moduleIndex, -1))}><ArrowUp /></Button>
                    <Button size="icon" variant="outline" aria-label="Move module down" disabled={moduleIndex === draft.modules.length - 1} onClick={() => updateModules((modules) => moveItem(modules, moduleIndex, 1))}><ArrowDown /></Button>
                    <Button size="icon" variant="outline" aria-label="Delete module" onClick={() => setPendingDelete({ moduleIndex })}><Trash2 /></Button>
                  </div>
                )}
              </div>

              {courseModule.lessons.map((lesson, lessonIndex) => (
                <LessonEditor
                  key={lesson.id}
                  lesson={lesson}
                  position={lessonIndex}
                  count={courseModule.lessons.length}
                  editable={editable}
                  onChange={(patch) => updateLesson(moduleIndex, lessonIndex, patch)}
                  onMove={(direction) => updateModules((modules) => modules.map((entry, i) => i === moduleIndex ? { ...entry, lessons: moveItem(entry.lessons, lessonIndex, direction) } : entry))}
                  onDelete={() => setPendingDelete({ moduleIndex, lessonIndex })}
                />
              ))}

              {editable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateModules((modules) => modules.map((entry, i) => i === moduleIndex ? {
                    ...entry,
                    lessons: [...entry.lessons, { id: newId("les"), title: `Lesson ${entry.lessons.length + 1}`, body: "", videoUrl: "", dripDays: 0, quiz: null }],
                  } : entry))}
                >
                  <Plus aria-hidden="true" /> Add lesson
                </Button>
              )}
            </section>
          ))}
          {editable && (
            <Button
              variant="secondary"
              onClick={() => updateModules((modules) => [...modules, { id: newId("mod"), title: `Module ${modules.length + 1}`, lessons: [] }])}
            >
              <Plus aria-hidden="true" /> Add module
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={pendingTransition !== null} onOpenChange={(open) => !open && setPendingTransition(null)}>
        <DialogContent>
          {pendingTransition && (
            <>
              <DialogHeader>
                <DialogTitle>{pendingTransition === "draft" && course.status === "archived" ? "Restore to draft" : TRANSITION_COPY[pendingTransition].label} “{course.title}”?</DialogTitle>
                <DialogDescription>{TRANSITION_COPY[pendingTransition].description} This is recorded in the audit log.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPendingTransition(null)}>Cancel</Button>
                <Button onClick={() => transition(pendingTransition)} disabled={saving}>{saving ? "Working…" : "Confirm"}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this {pendingDelete?.lessonIndex === undefined ? "module and its lessons" : "lesson"}?</DialogTitle>
            <DialogDescription>It disappears from the curriculum when you save. Learner progress on removed lessons stops counting toward completion.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LessonEditor({
  lesson,
  position,
  count,
  editable,
  onChange,
  onMove,
  onDelete,
}: {
  lesson: Lesson;
  position: number;
  count: number;
  editable: boolean;
  onChange: (patch: Partial<Lesson>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-neutral-300 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-500">{position + 1}.</span>
        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium underline-offset-2 hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {lesson.title || "Untitled lesson"}
        </button>
        {lesson.dripDays > 0 && <Badge variant="outline">Day {lesson.dripDays}</Badge>}
        {lesson.videoUrl && <Badge variant="outline">Video</Badge>}
        {lesson.quiz && <Badge variant="outline">Quiz · {lesson.quiz.questions.length}</Badge>}
        {editable && (
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" aria-label="Move lesson up" disabled={position === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Move lesson down" disabled={position === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Delete lesson" onClick={onDelete}><Trash2 /></Button>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</Button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor={`lesson-title-${lesson.id}`}>Lesson title</Label>
            <Input id={`lesson-title-${lesson.id}`} value={lesson.title} disabled={!editable} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="grid gap-1">
              <Label htmlFor={`lesson-video-${lesson.id}`}>Video link (YouTube, Vimeo or Loom)</Label>
              <Input id={`lesson-video-${lesson.id}`} value={lesson.videoUrl} disabled={!editable} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => onChange({ videoUrl: e.target.value.trim() })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`lesson-drip-${lesson.id}`}>Unlock after (days)</Label>
              <Input id={`lesson-drip-${lesson.id}`} type="number" min={0} max={365} value={lesson.dripDays} disabled={!editable} onChange={(e) => onChange({ dripDays: Math.max(0, Math.min(365, Math.floor(Number(e.target.value) || 0))) })} />
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`lesson-body-${lesson.id}`}>Lesson text</Label>
            <Textarea id={`lesson-body-${lesson.id}`} rows={8} value={lesson.body} disabled={!editable} onChange={(e) => onChange({ body: e.target.value })} placeholder={"# Heading\nWrite the lesson. Use - for bullets, **bold**, *italic* and [links](https://example.com)."} />
          </div>
          <QuizEditor quiz={lesson.quiz} editable={editable} onChange={(quiz) => onChange({ quiz })} />
        </div>
      )}
    </div>
  );
}

function QuizEditor({ quiz, editable, onChange }: { quiz: Quiz | null; editable: boolean; onChange: (quiz: Quiz | null) => void }) {
  if (!quiz) {
    return editable ? (
      <div>
        <Button size="sm" variant="outline" onClick={() => onChange({ passPercent: 70, questions: [{ id: newId("q"), prompt: "", options: ["", ""], correctIndex: 0 }] })}>
          <ListChecks aria-hidden="true" /> Add a quiz
        </Button>
      </div>
    ) : null;
  }
  return (
    <div className="space-y-3 border border-dashed border-neutral-400 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <p className="flex-1 font-semibold">Quiz</p>
        <div className="grid gap-1">
          <Label htmlFor="quiz-pass" className="text-xs">Pass mark (%)</Label>
          <Input id="quiz-pass" className="w-24" type="number" min={0} max={100} value={quiz.passPercent} disabled={!editable} onChange={(e) => onChange({ ...quiz, passPercent: Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))) })} />
        </div>
        {editable && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 aria-hidden="true" /> Remove quiz</Button>}
      </div>
      {quiz.questions.map((question, qi) => {
        const setQuestion = (patch: Partial<Quiz["questions"][number]>) => onChange({ ...quiz, questions: quiz.questions.map((entry, i) => i === qi ? { ...entry, ...patch } : entry) });
        return (
          <div key={question.id} className="grid gap-2 border-t border-neutral-200 pt-3">
            <Label htmlFor={`q-${question.id}`}>Question {qi + 1}</Label>
            <Input id={`q-${question.id}`} value={question.prompt} disabled={!editable} onChange={(e) => setQuestion({ prompt: e.target.value })} placeholder="What is…?" />
            <Label htmlFor={`q-opts-${question.id}`} className="text-xs text-neutral-600">Options, one per line</Label>
            <Textarea
              id={`q-opts-${question.id}`}
              rows={3}
              value={question.options.join("\n")}
              disabled={!editable}
              onChange={(e) => {
                const options = e.target.value.split("\n").slice(0, 6);
                setQuestion({ options, correctIndex: Math.min(question.correctIndex, Math.max(0, options.length - 1)) });
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Correct answer</span>
              <Select value={String(question.correctIndex)} disabled={!editable} onValueChange={(value) => setQuestion({ correctIndex: Number(value) })}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {question.options.map((option, oi) => <SelectItem key={oi} value={String(oi)}>{option || `Option ${oi + 1}`}</SelectItem>)}
                </SelectContent>
              </Select>
              {editable && quiz.questions.length > 1 && (
                <Button size="sm" variant="ghost" onClick={() => onChange({ ...quiz, questions: quiz.questions.filter((_, i) => i !== qi) })}>Remove question</Button>
              )}
            </div>
          </div>
        );
      })}
      {editable && quiz.questions.length < 20 && (
        <Button size="sm" variant="outline" onClick={() => onChange({ ...quiz, questions: [...quiz.questions, { id: newId("q"), prompt: "", options: ["", ""], correctIndex: 0 }] })}>
          <Plus aria-hidden="true" /> Add question
        </Button>
      )}
    </div>
  );
}
