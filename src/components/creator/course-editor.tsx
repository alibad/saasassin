"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  ListChecks,
  Lock,
  PlayCircle,
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
  allowedCourseTransitions,
  courseTransitionProblems,
  formatPrice,
  moveItem,
  newId,
  toEmbedUrl,
  type CourseDoc,
  type CourseModule,
  type CourseState,
  type Lesson,
  type Quiz,
} from "@/lib/creator/model";

import { BulkEnrollCard } from "./bulk-enroll";
import { apiJson, formatDate, panelClass } from "./client";
import { CourseCover } from "./course-cover";
import { CourseStatusBadge } from "./courses-view";
import { LessonBody } from "./lesson-body";

const TRANSITION_COPY: Record<CourseState, { label: string; icon: typeof Send; description: string }> = {
  published: { label: "Publish", icon: Send, description: "The course page goes live and anyone signed in can enroll." },
  draft: { label: "Unpublish", icon: EyeOff, description: "The course page goes offline. Learners keep their progress but can't open lessons until you publish again." },
  archived: { label: "Archive", icon: Archive, description: "The course is retired and hidden. You can restore it to draft later." },
};

type Props = {
  tenantId: string;
  course: CourseDoc;
  canEdit: boolean;
  canPublish: boolean;
  onBack: () => void;
  onChange: (course: CourseDoc) => void;
  onDuplicated: (course: CourseDoc) => void;
};

export function CourseEditor({ tenantId, course, canEdit, canPublish, onBack, onChange, onDuplicated }: Props) {
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
      setNotice("All changes saved.");
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
      setNotice(to === "published" ? "Published. Your course page is live." : to === "archived" ? "Archived." : "Back in draft.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the course state.");
    } finally {
      setSaving(false);
      setPendingTransition(null);
    }
  }

  async function duplicate() {
    setSaving(true);
    setError("");
    try {
      const { course: copy } = await apiJson<{ course: CourseDoc }>(`/api/creator/tenants/${tenantId}/courses/${course.id}/duplicate`, { method: "POST" });
      onDuplicated(copy);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not duplicate the course.");
    } finally {
      setSaving(false);
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

  const lessons = draft.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);

  return (
    <div className="grid gap-8">
      <div className="grid gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> All courses
        </Button>
        <div className="overflow-hidden rounded-3xl bg-card ring-1 ring-border md:grid md:grid-cols-[300px_minmax(0,1fr)]">
          <CourseCover seed={course.id} title={course.title} className="aspect-[16/9] md:aspect-auto md:min-h-56">
            <CourseStatusBadge status={course.status} className="absolute top-4 left-4" />
          </CourseCover>
          <div className="flex min-w-0 flex-col gap-4 p-6 sm:p-7">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {formatPrice(course.pricing)} · {draft.modules.length} {draft.modules.length === 1 ? "module" : "modules"} · {lessons} {lessons === 1 ? "lesson" : "lessons"} · updated {formatDate(course.updatedAt, true)}
              </p>
              <h1 className="brand-heading mt-1.5 text-3xl leading-tight sm:text-4xl">{course.title}</h1>
              <p className="mt-2 truncate text-sm text-muted-foreground">
                {course.status === "published" ? (
                  <Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={publicPath} target="_blank">
                    Course page is live <ExternalLink className="size-3.5" aria-hidden="true" />
                  </Link>
                ) : course.status === "archived" ? "Archived. Restore it to draft to work on it again." : "Draft. The course page goes live when you publish."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
          {editable && (
            <Button size="lg" className="rounded-xl" onClick={save} disabled={!dirty || saving}>
              <Save aria-hidden="true" /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </Button>
          )}
          {transitions.map((to) => {
            const copy = TRANSITION_COPY[to];
            const Icon = to === "draft" && course.status === "archived" ? RotateCcw : copy.icon;
            return (
              <Button key={to} size="lg" className="rounded-xl" variant={to === "published" ? "default" : "outline"} disabled={saving || (to === "published" && dirty)} onClick={() => setPendingTransition(to)}>
                <Icon aria-hidden="true" /> {to === "draft" && course.status === "archived" ? "Restore to draft" : copy.label}
              </Button>
            );
          })}
          {canEdit && (
            <Button size="lg" variant="outline" className="rounded-xl" onClick={duplicate} disabled={saving}><Copy aria-hidden="true" /> Duplicate</Button>
          )}
          {course.status === "published" && (
            <Button size="lg" variant="ghost" className="rounded-xl" asChild>
              <Link href={publicPath} target="_blank"><Eye aria-hidden="true" /> View as a visitor</Link>
            </Button>
          )}
            </div>
            {(error || notice || (dirty && course.status === "draft") || publishProblems.length > 0 || !canEdit) && (
              <div className="grid gap-2">
                {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                {notice && <p className="text-sm font-medium text-primary" role="status">{notice}</p>}
                {!canEdit && <p className="text-sm text-muted-foreground">You can look around this course; your role can&apos;t change it.</p>}
                {dirty && course.status === "draft" && <p className="text-sm text-muted-foreground">Save your changes before publishing.</p>}
                {canPublish && publishProblems.length > 0 && (
                  <p className="rounded-xl bg-accent px-3 py-2 text-sm text-accent-foreground">Before you publish: {publishProblems.join(" ")}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
      <div className="grid gap-6 xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1">
      <Card className={panelClass}>
        <CardHeader>
          <CardTitle className="brand-heading text-xl">Course page and price</CardTitle>
          <CardDescription>What visitors read before they enroll.</CardDescription>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid gap-2">
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
                  <PriceInput
                    amountCents={draft.pricing.amountCents}
                    disabled={!editable}
                    onChange={(amountCents) => draft.pricing.type === "paid" && update({ pricing: { ...draft.pricing, amountCents } })}
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
            <Alert className="rounded-xl border-0 bg-accent text-accent-foreground">
              <CircleAlert />
              <AlertTitle>Payments aren&apos;t connected yet</AlertTitle>
              <AlertDescription className="text-accent-foreground/85">
                The price shows on the course page, but nobody can be charged until a payment provider is connected, so paid enrollment stays closed. Visitors can still join the email list. Switch to free to accept learners today.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {course.status === "published" && canPublish && <BulkEnrollCard tenantId={tenantId} courseId={course.id} />}
      </div>

      <Card className={`${panelClass} xl:col-start-1 xl:row-start-1`}>
        <CardHeader>
          <CardTitle className="brand-heading text-xl">Curriculum</CardTitle>
          <CardDescription>Modules and lessons in the order learners take them. A drip delay counts days from each learner&apos;s enrollment.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.modules.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Start with a module (a chapter), then add lessons to it. Each lesson can have a video, text and a quiz.</p>
          )}
          {draft.modules.map((courseModule, moduleIndex) => (
            <section key={courseModule.id} className="space-y-3 rounded-2xl bg-brand-subtle p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid min-w-0 flex-1 gap-1">
                  <Label htmlFor={`module-${courseModule.id}`} className="text-xs font-medium text-muted-foreground">Module {moduleIndex + 1}</Label>
                  <Input
                    id={`module-${courseModule.id}`}
                    value={courseModule.title}
                    disabled={!editable}
                    className="h-10 rounded-xl bg-card font-heading text-lg"
                    onChange={(e) => updateModules((modules) => modules.map((entry, i) => i === moduleIndex ? { ...entry, title: e.target.value } : entry))}
                  />
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button size="icon-lg" variant="ghost" aria-label="Move module up" disabled={moduleIndex === 0} onClick={() => updateModules((modules) => moveItem(modules, moduleIndex, -1))}><ArrowUp /></Button>
                    <Button size="icon-lg" variant="ghost" aria-label="Move module down" disabled={moduleIndex === draft.modules.length - 1} onClick={() => updateModules((modules) => moveItem(modules, moduleIndex, 1))}><ArrowDown /></Button>
                    <Button size="icon-lg" variant="ghost" aria-label="Delete module" onClick={() => setPendingDelete({ moduleIndex })}><Trash2 /></Button>
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
      </div>

      <Dialog open={pendingTransition !== null} onOpenChange={(open) => !open && setPendingTransition(null)}>
        <DialogContent>
          {pendingTransition && (
            <>
              <DialogHeader>
                <DialogTitle>{pendingTransition === "draft" && course.status === "archived" ? "Restore to draft" : TRANSITION_COPY[pendingTransition].label} “{course.title}”?</DialogTitle>
                <DialogDescription>{TRANSITION_COPY[pendingTransition].description} This is recorded in the activity log.</DialogDescription>
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

/** Keeps the typed text locally so partial input like "49." is not reformatted mid-typing. */
function PriceInput({ amountCents, disabled, onChange }: { amountCents: number; disabled: boolean; onChange: (amountCents: number) => void }) {
  const [text, setText] = useState((amountCents / 100).toFixed(2));
  return (
    <Input
      id="course-price"
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9.]/g, "");
        setText(next);
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(Math.round(parsed * 100));
      }}
    />
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
  const [preview, setPreview] = useState(false);
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-semibold text-secondary-foreground tabular-nums">{position + 1}</span>
        <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:text-primary" onClick={() => setOpen(!open)} aria-expanded={open}>
          {lesson.title || "Untitled lesson"}
        </button>
        {lesson.videoUrl && <Badge variant="secondary"><PlayCircle /> Video</Badge>}
        {lesson.quiz && <Badge variant="secondary"><ListChecks /> Quiz · {lesson.quiz.questions.length}</Badge>}
        {lesson.dripDays > 0 && <Badge className="bg-accent text-accent-foreground"><Lock /> Day {lesson.dripDays}</Badge>}
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
          <div>
            <Button size="sm" variant="ghost" onClick={() => setPreview(!preview)} aria-expanded={preview}><Eye aria-hidden="true" /> {preview ? "Hide learner preview" : "Preview as learner"}</Button>
            {preview && (
              <div className="mt-2 space-y-3 rounded-xl bg-background p-5 ring-1 ring-border">
                {lesson.videoUrl && (
                  <p className="text-xs text-muted-foreground">
                    {toEmbedUrl(lesson.videoUrl) ? "Video will be embedded from this link." : "This video host cannot be embedded; learners will get a link instead."}
                  </p>
                )}
                <LessonBody body={lesson.body} />
              </div>
            )}
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
    <div className="space-y-3 rounded-xl border border-dashed border-border bg-brand-subtle p-4">
      <div className="flex flex-wrap items-end gap-3">
        <p className="flex flex-1 items-center gap-2 font-semibold"><ListChecks className="size-4 text-primary" aria-hidden="true" /> Quiz</p>
        <div className="grid gap-1">
          <Label htmlFor="quiz-pass" className="text-xs">Pass mark (%)</Label>
          <Input id="quiz-pass" className="w-24" type="number" min={0} max={100} value={quiz.passPercent} disabled={!editable} onChange={(e) => onChange({ ...quiz, passPercent: Math.max(0, Math.min(100, Math.floor(Number(e.target.value) || 0))) })} />
        </div>
        {editable && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 aria-hidden="true" /> Remove quiz</Button>}
      </div>
      {quiz.questions.map((question, qi) => {
        const setQuestion = (patch: Partial<Quiz["questions"][number]>) => onChange({ ...quiz, questions: quiz.questions.map((entry, i) => i === qi ? { ...entry, ...patch } : entry) });
        return (
          <div key={question.id} className="grid gap-2 border-t border-border pt-3">
            <Label htmlFor={`q-${question.id}`}>Question {qi + 1}</Label>
            <Input id={`q-${question.id}`} value={question.prompt} disabled={!editable} onChange={(e) => setQuestion({ prompt: e.target.value })} placeholder="What is…?" />
            <Label htmlFor={`q-opts-${question.id}`} className="text-xs text-muted-foreground">Options, one per line</Label>
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
