import { Eye, GripVertical, ListChecks, Lock, Play, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Sample school for the preview: a fictional watercolour course, shown inside the product UI only. */
const modules = [
  {
    title: "Getting started",
    lessons: [
      { title: "Welcome and supplies", day: 0 },
      { title: "Your first wash", day: 0, active: true },
      { title: "Mixing colours", day: 3, quiz: true },
    ],
  },
  {
    title: "Light and shadow",
    lessons: [
      { title: "Painting skies", day: 7 },
      { title: "Layering glazes", day: 10 },
      { title: "Your final piece", day: 14, quiz: true },
    ],
  },
];

const funnel = [
  ["Welcome", 100],
  ["First wash", 91],
  ["Mixing", 72],
  ["Skies", 58],
  ["Glazes", 49],
] as const;

/** The course builder: curriculum with drip days, a lesson with video and quiz, and learner progress. */
export function CreatorPreview() {
  return (
    <div className="bg-background text-[13px]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
        <span className="size-8 shrink-0 rounded-[10px] bg-[linear-gradient(135deg,var(--brand-accent),var(--chart-1))]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="brand-heading truncate text-[17px] leading-tight">Watercolour Basics</p>
          <p className="text-[11px] text-muted-foreground">6 lessons · 2 modules</p>
        </div>
        <Badge className="text-[10px]">Published</Badge>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden h-8 items-center gap-1.5 rounded-[10px] border border-border px-3 font-medium sm:inline-flex">
            <Eye className="size-3.5" aria-hidden="true" />
            Preview as learner
          </span>
          <span className="inline-flex h-8 items-center rounded-[10px] bg-primary px-3 font-medium text-primary-foreground">Save</span>
        </div>
      </div>

      <div className="grid md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)_220px]">
        <aside className="hidden border-r border-border p-4 md:block">
          {modules.map((module, moduleIndex) => (
            <div key={module.title} className={cn(moduleIndex > 0 && "mt-4")}>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Module {moduleIndex + 1} · {module.title}
              </p>
              <ul className="mt-2 grid gap-1">
                {module.lessons.map((lesson) => (
                  <li
                    key={lesson.title}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[10px] px-2 py-1.5",
                      lesson.active ? "bg-secondary font-semibold text-secondary-foreground" : "text-foreground/80",
                    )}
                  >
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                    <span className="truncate">{lesson.title}</span>
                    {lesson.quiz ? <ListChecks className="size-3.5 shrink-0 text-primary" aria-hidden="true" /> : null}
                    {lesson.day ? (
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-1.5 text-[10px] text-accent-foreground">
                        <Lock className="size-2.5" aria-hidden="true" />
                        Day {lesson.day}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="mt-4 flex items-center gap-1.5 px-2 text-[12px] font-medium text-primary">
            <Plus className="size-3.5" aria-hidden="true" />
            Add lesson
          </p>
        </aside>

        <section className="min-w-0 p-4 sm:p-5">
          <p className="text-[11px] font-semibold text-muted-foreground">Lesson 2 · unlocks on enrollment</p>
          <p className="brand-heading mt-1 text-2xl">Your first wash</p>
          <div className="relative mt-4 aspect-video overflow-hidden rounded-[14px] bg-[radial-gradient(120%_90%_at_20%_15%,var(--brand-accent)_0%,transparent_55%),radial-gradient(90%_80%_at_85%_80%,var(--chart-1)_0%,transparent_60%),linear-gradient(135deg,var(--brand-subtle),var(--secondary))]">
            <span className="absolute inset-0 m-auto flex size-14 items-center justify-center rounded-full bg-card/90 shadow-lg">
              <Play className="ml-0.5 size-6 fill-primary text-primary" aria-hidden="true" />
            </span>
            <span className="absolute bottom-3 left-3 rounded-full bg-card/90 px-2.5 py-0.5 text-[11px] font-medium">YouTube · 8:42</span>
          </div>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Wet the paper evenly, load your brush, and pull the colour across in one confident stroke. Tilt the board and let gravity do the rest.
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-border bg-card p-3">
            <span className="flex size-9 items-center justify-center rounded-[10px] bg-secondary text-secondary-foreground">
              <ListChecks className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Quick check</p>
              <p className="text-[11px] text-muted-foreground">3 questions · pass at 70% · scored on the server</p>
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-border bg-card p-4 lg:block">
          <p className="text-[11px] font-semibold text-muted-foreground">Learners</p>
          <p className="brand-heading mt-1 text-3xl">128</p>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Completion</span>
            <span className="font-semibold text-foreground">41%</span>
          </div>
          <Progress value={41} className="mt-1.5" />
          <p className="mt-5 text-[11px] font-semibold text-muted-foreground">Lesson funnel</p>
          <ul className="mt-2 grid gap-1.5">
            {funnel.map(([label, value]) => (
              <li key={label} className="grid grid-cols-[64px_minmax(0,1fr)_30px] items-center gap-2 text-[11px]">
                <span className="truncate text-muted-foreground">{label}</span>
                <span className="h-2 rounded-full bg-muted">
                  <span className="block h-2 rounded-full bg-[var(--chart-1)]" style={{ width: `${value}%` }} />
                </span>
                <span className="text-right tabular-nums">{value}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-[10px] bg-accent px-2.5 py-2 text-[11px] text-accent-foreground">
            Most learners stop after <strong>Mixing colours</strong>
          </p>
        </aside>
      </div>
    </div>
  );
}
