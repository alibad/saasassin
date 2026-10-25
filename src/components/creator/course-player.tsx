"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleAlert, ExternalLink, Lock } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { lessonUnlockAt, toEmbedUrl, type ProgressSummary } from "@/lib/creator/model";

import { apiJson, formatDate } from "./client";

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
        if (next) setCurrentId(next.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save progress.");
    } finally {
      setPending(false);
    }
  }

  const embed = lesson?.videoUrl ? toEmbedUrl(lesson.videoUrl) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit space-y-4 border-2 border-neutral-900 bg-white p-4 shadow-[4px_4px_0_0_#171717]">
        <div className="space-y-2">
          <p className="font-bold">{courseTitle}</p>
          <Progress value={progress.percent} aria-label="Course progress" />
          <p className="text-xs text-neutral-600">{progress.completed} of {progress.total} lessons · {progress.percent}%</p>
          {progress.isComplete && (
            <Button asChild size="sm" className="w-full"><Link href={`/apps/creator/c/${tenantId}/${courseSlug}/certificate`}><Award aria-hidden="true" /> View certificate</Link></Button>
          )}
        </div>
        <nav aria-label="Lessons" className="space-y-3">
          {modules.map((courseModule) => (
            <div key={courseModule.id}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{courseModule.title}</p>
              <ul className="space-y-1">
                {courseModule.lessons.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setCurrentId(entry.id)}
                      aria-current={entry.id === currentId ? "true" : undefined}
                      className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm ${entry.id === currentId ? "bg-[#ff3d93]/15 font-semibold" : "hover:bg-neutral-100"}`}
                    >
                      {!entry.unlocked ? <Lock className="size-4 shrink-0 text-neutral-400" aria-label="Locked" /> : completed.has(entry.id) ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-label="Completed" /> : <Circle className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />}
                      <span className="truncate">{entry.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <section className="min-w-0 space-y-5 border-2 border-neutral-900 bg-white p-5 shadow-[4px_4px_0_0_#171717]">
        {!lesson ? (
          <p className="text-neutral-600">This course has no lessons yet.</p>
        ) : !lesson.unlocked ? (
          <div className="space-y-2 py-10 text-center">
            <Lock className="mx-auto size-8 text-neutral-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold">{lesson.title}</h1>
            <p className="text-neutral-600">Unlocks on {formatDate(lessonUnlockAt(enrolledAt, lesson.dripDays).toISOString(), true)} — day {lesson.dripDays} after you enrolled.</p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-neutral-500">{lesson.moduleTitle} · Lesson {index + 1} of {lessons.length}</p>
              <h1 className="text-2xl font-bold">{lesson.title}</h1>
            </div>
            {lesson.videoUrl && (embed ? (
              <div className="aspect-video w-full border-2 border-neutral-900 bg-black">
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
              <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline">Open the lesson video <ExternalLink className="size-3" aria-hidden="true" /></a>
            ))}
            {renderBody[lesson.id]}
            {lesson.quiz && lesson.quiz.questions.length > 0 && (
              <LessonQuiz key={lesson.id} base={base} lessonId={lesson.id} quiz={lesson.quiz} score={quizScores[lesson.id]} onScored={(score) => setQuizScores((current) => ({ ...current, [lesson.id]: score }))} />
            )}
            {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Progress not saved</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2 border-t-2 border-neutral-900 pt-4">
              <Button variant="outline" disabled={index <= 0} onClick={() => setCurrentId(lessons[index - 1].id)}><ChevronLeft aria-hidden="true" /> Previous</Button>
              <Button onClick={toggleComplete} disabled={pending} variant={completed.has(lesson.id) ? "outline" : "default"}>
                {completed.has(lesson.id) ? <><CheckCircle2 aria-hidden="true" /> Completed — mark incomplete</> : pending ? "Saving…" : <><CheckCircle2 aria-hidden="true" /> Mark complete</>}
              </Button>
              <Button variant="outline" className="ml-auto" disabled={index >= lessons.length - 1} onClick={() => setCurrentId(lessons[index + 1].id)}>Next <ChevronRight aria-hidden="true" /></Button>
            </div>
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
      setError(caught instanceof Error ? caught.message : "Could not submit the quiz.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 border-2 border-dashed border-neutral-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">Quiz</p>
        <Badge variant="outline">Pass mark {quiz.passPercent}%</Badge>
        {score && <Badge variant={score.passed ? "default" : "destructive"}>Last attempt {score.correct}/{score.total} · {score.percent}% {score.passed ? "passed" : "not passed"}</Badge>}
      </div>
      {quiz.questions.map((question, qi) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="font-medium">{qi + 1}. {question.prompt}</legend>
          <RadioGroup value={answers[question.id] !== undefined ? String(answers[question.id]) : ""} onValueChange={(value) => setAnswers((current) => ({ ...current, [question.id]: Number(value) }))}>
            {question.options.map((option, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <RadioGroupItem value={String(oi)} id={`${question.id}-${oi}`} />
                <Label htmlFor={`${question.id}-${oi}`} className="font-normal">{option}</Label>
              </div>
            ))}
          </RadioGroup>
        </fieldset>
      ))}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <Button onClick={submit} disabled={!complete || pending}>{pending ? "Scoring…" : score ? "Submit again" : "Submit answers"}</Button>
    </div>
  );
}
