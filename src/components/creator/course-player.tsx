"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleAlert, ExternalLink, ListChecks, LoaderCircle, Lock, PlayCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { lessonUnlockAt, toEmbedUrl, type ProgressSummary } from "@/lib/creator/model";
import { cn } from "@/lib/utils";

import { apiJson, formatDate } from "./client";
import { LessonDiscussion } from "./discussions";

type PlayerQuiz = { passPercent: number; questions: Array<{ id: string; prompt: string; options: string[] }> };
type PlayerLesson = { id: string; title: string; dripDays: number; unlocked: boolean; body: string; videoUrl: string; quiz: PlayerQuiz | null };
type PlayerModule = { id: string; title: string; lessons: PlayerLesson[] };
type QuizScore = { correct: number; total: number; percent: number; passed: boolean; submittedAt: string };

type Props = {
  tenantId: string;
  courseSlug: string;
  courseTitle: string;
  modules: PlayerModule[];
  enrolledAt: string;
  initialCompleted: string[];
  initialProgress: ProgressSummary;
  initialQuizScores: Record<string, QuizScore>;
  renderBody: Record<string, ReactNode>;
};

/** The learner's classroom: the curriculum with progress on the left, the lesson on the right. */
export function CoursePlayer({ tenantId, courseSlug, courseTitle, modules, enrolledAt, initialCompleted, initialProgress, initialQuizScores, renderBody }: Props) {
  const lessons = useMemo(() => modules.flatMap((courseModule) => courseModule.lessons.map((lesson) => ({ ...lesson, moduleTitle: courseModule.title }))), [modules]);
  const firstOpen = lessons.find((lesson) => lesson.unlocked && !initialCompleted.includes(lesson.id)) ?? lessons.find((lesson) => lesson.unlocked) ?? lessons[0];
  const [currentId, setCurrentId] = useState(firstOpen?.id ?? "");
  const [completed, setCompleted] = useState(new Set(initialCompleted));
  const [progress, setProgress] = useState(initialProgress);
  const [quizScores, setQuizScores] = useState(initialQuizScores);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const index = lessons.findIndex((lesson) => lesson.id === currentId);
  const lesson = lessons[index];
  const base = `/api/creator/public/${tenantId}/${courseSlug}`;

  function open(id: string) {
    setCurrentId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggleComplete() {
    if (!lesson) return;
    setPending(true);
    setError("");
    try {
      const result = await apiJson<{ completedLessonIds: string[]; progress: ProgressSummary }>(`${base}/progress`, {
        method: "POST",
        body: JSON.stringify({ lessonId: lesson.id, complete: !completed.has(lesson.id) }),
      });
      setCompleted(new Set(result.completedLessonIds));
      setProgress(result.progress);
      if (!completed.has(lesson.id)) {
        const next = lessons.slice(index + 1).find((entry) => entry.unlocked);
        if (next) open(next.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your progress couldn't be saved.");
    } finally {
      setPending(false);
    }
  }

  const embed = lesson?.videoUrl ? toEmbedUrl(lesson.videoUrl) : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:py-10">
      <aside className="order-last h-fit overflow-hidden rounded-2xl bg-card ring-1 ring-border lg:sticky lg:top-24 lg:order-first">
        <div className="grid gap-3 border-b border-border bg-brand-subtle p-5">
          <p className="brand-heading text-xl leading-snug">{courseTitle}</p>
          <Progress value={progress.percent} aria-label="Course progress" />
          <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{progress.percent}% complete</span> · {progress.completed} of {progress.total} lessons</p>
          {progress.isComplete ? (
            <Button asChild className="rounded-xl"><Link href={`/apps/creator/c/${tenantId}/${courseSlug}/certificate`}><Award aria-hidden="true" /> Your certificate</Link></Button>
          ) : null}
        </div>
        <nav aria-label="Lessons" className="grid max-h-[60vh] gap-4 overflow-y-auto p-3 lg:max-h-[calc(100dvh-16rem)]">
          {modules.map((courseModule, moduleIndex) => (
            <div key={courseModule.id}>
              <p className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">Module {moduleIndex + 1} · {courseModule.title}</p>
              <ul className="grid gap-0.5">
                {courseModule.lessons.map((entry) => {
                  const active = entry.id === currentId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => open(entry.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                          active ? "bg-secondary font-semibold text-secondary-foreground" : "hover:bg-muted",
                          !entry.unlocked && "text-muted-foreground",
                        )}
                      >
                        {!entry.unlocked ? (
                          <Lock className="size-4 shrink-0" aria-label="Locked" />
                        ) : completed.has(entry.id) ? (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-label="Completed" />
                        ) : (
                          <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                        {entry.unlocked && entry.videoUrl ? <PlayCircle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <section className="grid min-w-0 content-start gap-7">
        {!lesson ? (
          <p className="rounded-2xl bg-card p-10 text-center text-muted-foreground ring-1 ring-border">This course doesn&apos;t have lessons yet. Check back soon.</p>
        ) : !lesson.unlocked ? (
          <div className="grid place-items-center gap-3 rounded-3xl bg-card px-6 py-20 text-center ring-1 ring-border">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-foreground"><Lock className="size-6" aria-hidden="true" /></span>
            <h1 className="brand-heading text-3xl">{lesson.title}</h1>
            <p className="max-w-md text-muted-foreground">This lesson opens on {formatDate(lessonUnlockAt(enrolledAt, lesson.dripDays).toISOString(), true)}, {lesson.dripDays} days after you enrolled. Keep going with what&apos;s open in the meantime.</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm text-muted-foreground">{lesson.moduleTitle} · Lesson {index + 1} of {lessons.length}</p>
              <h1 className="brand-heading mt-1 text-4xl leading-tight">{lesson.title}</h1>
            </div>
            {lesson.videoUrl ? (embed ? (
              <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_30px_60px_-36px_rgb(0_0_0/0.6)]">
                <iframe
                  src={embed}
                  title={`Video: ${lesson.title}`}
                  className="size-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            ) : (
              <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex w-fit items-center gap-2 rounded-xl bg-secondary px-4 py-3 font-medium text-secondary-foreground">
                <PlayCircle className="size-5" aria-hidden="true" /> Watch the lesson video <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )) : null}
            <div>{renderBody[lesson.id]}</div>
            {lesson.quiz && lesson.quiz.questions.length > 0 ? (
              <LessonQuiz key={lesson.id} base={base} lessonId={lesson.id} quiz={lesson.quiz} score={quizScores[lesson.id]} onScored={(score) => setQuizScores((current) => ({ ...current, [lesson.id]: score }))} />
            ) : null}
            {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Progress not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 ring-1 ring-border">
              <Button variant="ghost" size="lg" className="rounded-xl" disabled={index <= 0} onClick={() => open(lessons[index - 1].id)}><ChevronLeft aria-hidden="true" /> Previous</Button>
              <Button size="lg" className="mx-auto rounded-xl" onClick={toggleComplete} disabled={pending} variant={completed.has(lesson.id) ? "secondary" : "default"}>
                {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 aria-hidden="true" />}
                {completed.has(lesson.id) ? "Completed" : "Mark complete and continue"}
              </Button>
              <Button variant="ghost" size="lg" className="rounded-xl" disabled={index >= lessons.length - 1} onClick={() => open(lessons[index + 1].id)}>Next <ChevronRight aria-hidden="true" /></Button>
            </div>
            <LessonDiscussion key={`discussion-${lesson.id}`} base={base} lessonId={lesson.id} />
          </>
        )}
      </section>
    </div>
  );
}

function LessonQuiz({ base, lessonId, quiz, score, onScored }: { base: string; lessonId: string; quiz: PlayerQuiz; score?: QuizScore; onScored: (score: QuizScore) => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const complete = quiz.questions.every((question) => answers[question.id] !== undefined);

  async function submit() {
    setPending(true);
    setError("");
    try {
      const result = await apiJson<{ score: QuizScore }>(`${base}/quiz`, { method: "POST", body: JSON.stringify({ lessonId, answers }) });
      onScored(result.score);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your answers couldn't be submitted.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 rounded-2xl bg-brand-subtle p-6 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ListChecks className="size-4" aria-hidden="true" /></span>
        <p className="brand-heading text-xl">Check your understanding</p>
        <Badge variant="outline" className="ml-auto">Pass mark {quiz.passPercent}%</Badge>
      </div>
      {score ? (
        <p className={cn("rounded-xl px-3 py-2 text-sm font-medium", score.passed ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground")}>
          Last attempt: {score.correct} of {score.total} right ({score.percent}%) — {score.passed ? "passed. Nicely done." : "not quite. Have another go."}
        </p>
      ) : null}
      {quiz.questions.map((question, questionIndex) => (
        <fieldset key={question.id} className="grid gap-3">
          <legend className="mb-2 font-medium">{questionIndex + 1}. {question.prompt}</legend>
          <RadioGroup value={answers[question.id] !== undefined ? String(answers[question.id]) : ""} onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: Number(value) }))}>
            {question.options.map((option, optionIndex) => (
              <Label key={optionIndex} htmlFor={`${question.id}-${optionIndex}`} className="flex cursor-pointer items-center gap-3 rounded-xl bg-card px-3 py-2.5 font-normal ring-1 ring-border has-data-[state=checked]:ring-2 has-data-[state=checked]:ring-primary">
                <RadioGroupItem value={String(optionIndex)} id={`${question.id}-${optionIndex}`} />
                {option}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
      ))}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <Button className="w-fit rounded-xl" size="lg" onClick={submit} disabled={!complete || pending}>{pending ? <LoaderCircle className="animate-spin" /> : null} {score ? "Try again" : "Submit answers"}</Button>
    </div>
  );
}
