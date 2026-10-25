import { z } from "zod";

import type { CourseModule } from "./model";

/**
 * Kajabi migration mapper. Pure: turns a Kajabi-style export (CSV of products → categories →
 * posts, or the equivalent JSON) into draft courses plus a mapping report. Nothing is written
 * until the creator has seen the preview and confirmed.
 */

export const importRequestSchema = z.object({
  text: z.string().min(1, "Paste or upload an export first.").max(2_000_000, "That export is larger than 2 MB."),
  dryRun: z.boolean().default(true),
});

export type ImportedCourse = { title: string; description: string; modules: CourseModule[] };

export type ImportReport = {
  format: "csv" | "json";
  courses: number;
  modules: number;
  lessons: number;
  columnMapping: Record<string, string>;
  warnings: string[];
  errors: string[];
};

const MAX_BODY = 20_000;

const COLUMN_ALIASES: Record<string, string[]> = {
  course: ["product title", "product", "course title", "course", "product name"],
  courseDescription: ["product description", "course description"],
  module: ["category title", "category", "module title", "module", "section"],
  lesson: ["post title", "post", "lesson title", "lesson", "title"],
  body: ["post body", "body", "content", "post content", "lesson body", "description"],
  video: ["video url", "video", "video_url", "wistia url", "media url"],
  drip: ["drip days", "drip", "drip_days", "release after days", "unlock after days"],
  position: ["position", "order", "sort", "post position"],
};

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Kajabi post bodies are HTML; keep the words and paragraph breaks, drop the markup. */
export function htmlToText(value: string) {
  if (!/<[a-z!/][^>]*>/i.test(value)) return { text: value.trim(), stripped: false };
  const text = value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/\s*(p|div|h[1-6]|li|ul|ol)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, stripped: true };
}

function slugId(prefix: string, index: number) {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

type RawLesson = { course: string; courseDescription: string; module: string; lesson: string; body: string; video: string; drip: string; position: string; source: string };

function buildCourses(rows: RawLesson[], report: ImportReport): ImportedCourse[] {
  const courses = new Map<string, { description: string; modules: Map<string, RawLesson[]> }>();
  for (const row of rows) {
    const courseTitle = row.course.trim();
    if (!courseTitle) {
      report.errors.push(`${row.source}: missing course/product title — row skipped.`);
      continue;
    }
    const course = courses.get(courseTitle) ?? { description: "", modules: new Map() };
    if (!course.description && row.courseDescription.trim()) course.description = htmlToText(row.courseDescription).text;
    courses.set(courseTitle, course);
    if (!row.lesson.trim() && !row.body.trim() && !row.video.trim()) continue; // course-only row
    const moduleTitle = row.module.trim() || "Lessons";
    const list = course.modules.get(moduleTitle) ?? [];
    list.push(row);
    course.modules.set(moduleTitle, list);
  }

  return [...courses.entries()].map(([title, course]) => {
    const modules: CourseModule[] = [...course.modules.entries()].map(([moduleTitle, lessons], moduleIndex) => {
      const ordered = lessons
        .map((lesson, index) => ({ lesson, index, position: Number.parseInt(lesson.position, 10) }))
        .sort((a, b) => (Number.isFinite(a.position) && Number.isFinite(b.position) ? a.position - b.position : a.index - b.index));
      return {
        id: slugId("mod", moduleIndex),
        title: moduleTitle.slice(0, 140),
        lessons: ordered.map(({ lesson }, lessonIndex) => {
          const { text, stripped } = htmlToText(lesson.body);
          if (stripped) report.warnings.push(`${lesson.source}: HTML formatting in “${lesson.lesson || "untitled"}” was converted to plain text.`);
          let body = text;
          if (body.length > MAX_BODY) {
            body = body.slice(0, MAX_BODY);
            report.warnings.push(`${lesson.source}: lesson body was longer than ${MAX_BODY} characters and was truncated.`);
          }
          let videoUrl = lesson.video.trim();
          if (videoUrl && !/^https:\/\/[^\s]+$/.test(videoUrl)) {
            report.warnings.push(`${lesson.source}: video link “${videoUrl.slice(0, 80)}” is not an https URL and was dropped.`);
            videoUrl = "";
          }
          const dripRaw = lesson.drip.trim();
          let dripDays = 0;
          if (dripRaw) {
            const parsed = Number.parseInt(dripRaw, 10);
            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 365) dripDays = parsed;
            else report.warnings.push(`${lesson.source}: drip value “${dripRaw}” is not 0–365 days; lesson unlocks immediately.`);
          }
          let lessonTitle = lesson.lesson.trim();
          if (!lessonTitle) {
            lessonTitle = `Untitled lesson ${lessonIndex + 1}`;
            report.warnings.push(`${lesson.source}: lesson had no title; named “${lessonTitle}”.`);
          }
          return { id: `les_${moduleIndex + 1}_${lessonIndex + 1}`, title: lessonTitle.slice(0, 140), body, videoUrl, dripDays, quiz: null };
        }),
      };
    });
    if (modules.length === 0) report.warnings.push(`Course “${title}” has no lessons; it will import as an empty draft.`);
    return { title: title.slice(0, 140), description: course.description.slice(0, 5_000), modules: modules.slice(0, 50) };
  });
}

function fromCsv(text: string, report: ImportReport): RawLesson[] {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    report.errors.push("The CSV needs a header row and at least one data row.");
    return [];
  }
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const indexFor: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = header.findIndex((column) => aliases.includes(column));
    if (index >= 0) {
      indexFor[field] = index;
      report.columnMapping[rows[0][index].trim()] = field;
    }
  }
  const unmapped = rows[0].filter((_, index) => !Object.values(indexFor).includes(index)).map((cell) => cell.trim()).filter(Boolean);
  if (unmapped.length) report.warnings.push(`Ignored columns: ${unmapped.join(", ")}.`);
  if (indexFor.course === undefined) {
    report.errors.push("No course column found. Expected one of: Product Title, Course Title, Product, Course.");
    return [];
  }
  if (indexFor.lesson === undefined) report.warnings.push("No lesson column found (Post Title / Lesson Title); only courses will be created.");
  const cell = (row: string[], field: string) => (indexFor[field] === undefined ? "" : row[indexFor[field]] ?? "");
  return rows.slice(1).map((row, index) => ({
    course: cell(row, "course"),
    courseDescription: cell(row, "courseDescription"),
    module: cell(row, "module"),
    lesson: cell(row, "lesson"),
    body: cell(row, "body"),
    video: cell(row, "video"),
    drip: cell(row, "drip"),
    position: cell(row, "position"),
    source: `Row ${index + 2}`,
  }));
}

type JsonLesson = { title?: unknown; name?: unknown; body?: unknown; content?: unknown; description?: unknown; video_url?: unknown; videoUrl?: unknown; video?: unknown; drip_days?: unknown; dripDays?: unknown; position?: unknown };
type JsonModule = { title?: unknown; name?: unknown; posts?: JsonLesson[]; lessons?: JsonLesson[] };
type JsonCourse = { title?: unknown; name?: unknown; description?: unknown; categories?: JsonModule[]; modules?: JsonModule[] };

const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

function fromJson(text: string, report: ImportReport): RawLesson[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    report.errors.push("The JSON could not be parsed.");
    return [];
  }
  const root = parsed as { products?: JsonCourse[]; courses?: JsonCourse[] } | JsonCourse[];
  const list: JsonCourse[] = Array.isArray(root) ? root : root.products ?? root.courses ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    report.errors.push("No products or courses found. Expected { products: [...] }, { courses: [...] } or an array.");
    return [];
  }
  report.columnMapping = { "products[].title": "course", "categories[].title": "module", "posts[].title": "lesson", "posts[].body": "body", "posts[].video_url": "video", "posts[].drip_days": "drip" };
  const rows: RawLesson[] = [];
  list.forEach((course, courseIndex) => {
    const courseTitle = str(course.title ?? course.name);
    const courseDescription = str(course.description);
    const modules = course.categories ?? course.modules ?? [];
    if (!modules.length) rows.push({ course: courseTitle, courseDescription, module: "", lesson: "", body: "", video: "", drip: "", position: "", source: `Course ${courseIndex + 1}` });
    modules.forEach((courseModule, moduleIndex) => {
      const lessons = courseModule.posts ?? courseModule.lessons ?? [];
      lessons.forEach((lesson, lessonIndex) => {
        rows.push({
          course: courseTitle,
          courseDescription,
          module: str(courseModule.title ?? courseModule.name) || `Module ${moduleIndex + 1}`,
          lesson: str(lesson.title ?? lesson.name),
          body: str(lesson.body ?? lesson.content ?? lesson.description),
          video: str(lesson.video_url ?? lesson.videoUrl ?? lesson.video),
          drip: str(lesson.drip_days ?? lesson.dripDays),
          position: str(lesson.position),
          source: `Course ${courseIndex + 1} › module ${moduleIndex + 1} › lesson ${lessonIndex + 1}`,
        });
      });
    });
  });
  return rows;
}

export function mapKajabiExport(text: string): { courses: ImportedCourse[]; report: ImportReport } {
  const trimmed = text.trim();
  const format = trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "csv";
  const report: ImportReport = { format, courses: 0, modules: 0, lessons: 0, columnMapping: {}, warnings: [], errors: [] };
  const rows = format === "json" ? fromJson(trimmed, report) : fromCsv(trimmed, report);
  const courses = report.errors.length && rows.length === 0 ? [] : buildCourses(rows, report);
  report.courses = courses.length;
  report.modules = courses.reduce((n, course) => n + course.modules.length, 0);
  report.lessons = courses.reduce((n, course) => n + course.modules.reduce((m, courseModule) => m + courseModule.lessons.length, 0), 0);
  if (courses.length > 25) report.errors.push("Import at most 25 courses at a time.");
  return { courses, report };
}
