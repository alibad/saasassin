"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FocusWindow, FocusWindows } from "@/lib/planner/scheduler";
import { formatMinuteOfDay, parseMinuteOfDay } from "@/lib/planner/time";

export type FocusForm = { deepStart: string; deepEnd: string; shallowStart: string; shallowEnd: string };

export function focusForm(focus: FocusWindows | null | undefined): FocusForm {
  const time = (window: FocusWindow | null | undefined, key: keyof FocusWindow) => (window ? formatMinuteOfDay(window[key]) : "");
  return {
    deepStart: time(focus?.deep, "startMinute"),
    deepEnd: time(focus?.deep, "endMinute"),
    shallowStart: time(focus?.shallow, "startMinute"),
    shallowEnd: time(focus?.shallow, "endMinute"),
  };
}

/** Empty pairs mean "no preference". Returns an error message for half-filled or inverted pairs. */
export function toFocus(form: FocusForm): FocusWindows | { error: string } {
  const pair = (start: string, end: string, label: string): FocusWindow | null | string => {
    if (!start && !end) return null;
    const startMinute = parseMinuteOfDay(start);
    const endMinute = parseMinuteOfDay(end);
    if (startMinute === null || endMinute === null) return `Give both a start and an end for ${label} hours, or leave both empty.`;
    if (endMinute <= startMinute) return `${label[0].toUpperCase()}${label.slice(1)} hours must end after they start.`;
    return { startMinute, endMinute };
  };
  const deep = pair(form.deepStart, form.deepEnd, "deep-work");
  if (typeof deep === "string") return { error: deep };
  const shallow = pair(form.shallowStart, form.shallowEnd, "shallow-work");
  if (typeof shallow === "string") return { error: shallow };
  return { deep, shallow };
}

export function describeFocus(focus: FocusWindows | null | undefined) {
  const part = (window: FocusWindow | null | undefined, label: string) =>
    window ? `${label} ${formatMinuteOfDay(window.startMinute)}–${formatMinuteOfDay(window.endMinute)}` : null;
  const parts = [part(focus?.deep, "deep"), part(focus?.shallow, "shallow")].filter(Boolean);
  return parts.length ? parts.join(" · ") : "no preferred hours";
}

export function FocusFields({ id, value, onChange }: { id: string; value: FocusForm; onChange: (next: FocusForm) => void }) {
  const field = (key: keyof FocusForm, label: string) => (
    <div className="grid gap-1">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type="time" value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {field("deepStart", "Deep work from")}
      {field("deepEnd", "Deep work until")}
      {field("shallowStart", "Shallow work from")}
      {field("shallowEnd", "Shallow work until")}
    </div>
  );
}
