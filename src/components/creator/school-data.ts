"use client";

import { useCallback, useEffect, useState } from "react";

import type { EnrollmentDoc, ProgressSummary } from "@/lib/creator/model";

import { apiJson } from "./client";

export type EnrollmentRow = EnrollmentDoc & { courseTitle: string; progress: ProgressSummary; photoURL: string | null };

/** Loads one list from a school endpoint (`{ [key]: T }`) with a reload. */
export function useSchoolList<T>(url: string, key: string) {
  const body = useSchoolBody<Record<string, unknown>>(url);
  return { ...body, data: body.data ? (body.data[key] as T) : null };
}

/** Loads a school endpoint's whole JSON body, with a reload. */
export function useSchoolBody<T>(url: string) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: "", loading: true });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    apiJson<T>(url)
      .then((body) => {
        if (active) setState({ data: body, error: "", loading: false });
      })
      .catch((caught) => {
        if (active) setState((current) => ({ ...current, error: caught instanceof Error ? caught.message : "This couldn't be loaded.", loading: false }));
      });
    return () => {
      active = false;
    };
  }, [url, version]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    setVersion((current) => current + 1);
  }, []);
  return { ...state, reload };
}

export function useEnrollments(tenantId: string) {
  return useSchoolList<EnrollmentRow[]>(`/api/creator/tenants/${tenantId}/enrollments`, "enrollments");
}

export function lessonCount(course: { modules: Array<{ lessons: unknown[] }> }) {
  return course.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}
