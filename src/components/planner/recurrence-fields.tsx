"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isDateKey, type Recurrence, type RecurrenceFrequency } from "@/lib/planner/recurrence";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type RecurrenceForm = {
  freq: "none" | RecurrenceFrequency;
  interval: string;
  weekdays: number[];
  monthDay: string;
  startDate: string;
  end: "never" | "until" | "count";
  until: string;
  count: string;
};

export function recurrenceForm(rule: Recurrence | null, today: string): RecurrenceForm {
  if (!rule) return { freq: "none", interval: "1", weekdays: [], monthDay: "", startDate: today, end: "never", until: "", count: "" };
  return {
    freq: rule.freq,
    interval: String(rule.interval ?? 1),
    weekdays: rule.weekdays ?? [],
    monthDay: rule.monthDay ? String(rule.monthDay) : "",
    startDate: rule.startDate,
    end: rule.count ? "count" : rule.until ? "until" : "never",
    until: rule.until ?? "",
    count: rule.count ? String(rule.count) : "",
  };
}

/** Converts the form into a rule, or returns an error message. `null` = does not repeat. */
export function toRecurrence(form: RecurrenceForm): Recurrence | null | { error: string } {
  if (form.freq === "none") return null;
  const interval = Number(form.interval || "1");
  if (!Number.isInteger(interval) || interval < 1 || interval > 12) return { error: "Repeat every 1 to 12." };
  if (!isDateKey(form.startDate)) return { error: "Choose the date the series starts." };
  const rule: Recurrence = { freq: form.freq, interval, startDate: form.startDate, weekdays: null, monthDay: null, until: null, count: null };
  if (form.freq === "weekly") {
    if (form.weekdays.length === 0) return { error: "Pick at least one weekday." };
    rule.weekdays = [...form.weekdays].sort();
  }
  if (form.freq === "monthly" && form.monthDay) {
    const day = Number(form.monthDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { error: "Day of month must be 1 to 31." };
    rule.monthDay = day;
  }
  if (form.end === "until") {
    if (!isDateKey(form.until)) return { error: "Choose the last date of the series." };
    if (form.until < form.startDate) return { error: "The series must end on or after its start." };
    rule.until = form.until;
  }
  if (form.end === "count") {
    const count = Number(form.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) return { error: "Repeat 1 to 500 times." };
    rule.count = count;
  }
  return rule;
}

const UNIT: Record<RecurrenceFrequency, string> = { daily: "days", weekdays: "", weekly: "weeks", monthly: "months" };

export function RecurrenceFields({ value, onChange }: { value: RecurrenceForm; onChange: (next: RecurrenceForm) => void }) {
  const set = (patch: Partial<RecurrenceForm>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="grid gap-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Repeat</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label>Repeats</Label>
          <Select value={value.freq} onValueChange={(freq) => set({ freq: freq as RecurrenceForm["freq"] })}>
            <SelectTrigger className="w-full" aria-label="Repeats"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Does not repeat</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekdays">Every weekday (Mon–Fri)</SelectItem>
              <SelectItem value="weekly">Weekly on chosen days</SelectItem>
              <SelectItem value="monthly">Monthly on a day</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value.freq !== "none" && (
          <div className="grid gap-1">
            <Label htmlFor="r-start">Starts</Label>
            <Input id="r-start" type="date" value={value.startDate} onChange={(event) => set({ startDate: event.target.value })} />
          </div>
        )}
      </div>
      {value.freq !== "none" && (
        <>
          {value.freq !== "weekdays" && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="r-interval">Every</Label>
              <Input id="r-interval" className="w-20" type="number" min={1} max={12} value={value.interval} onChange={(event) => set({ interval: event.target.value })} />
              <span>{UNIT[value.freq]}</span>
            </div>
          )}
          {value.freq === "weekly" && (
            <div className="flex flex-wrap gap-3" role="group" aria-label="Weekdays">
              {WEEKDAYS.map((label, index) => (
                <label key={label} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={value.weekdays.includes(index)}
                    onCheckedChange={(checked) => set({ weekdays: checked ? [...value.weekdays, index] : value.weekdays.filter((day) => day !== index) })}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          {value.freq === "monthly" && (
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="r-monthday">On day</Label>
              <Input id="r-monthday" className="w-20" type="number" min={1} max={31} placeholder={value.startDate.slice(8, 10)} value={value.monthDay} onChange={(event) => set({ monthDay: event.target.value })} />
              <span className="text-muted-foreground">Shorter months use their last day.</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Ends</Label>
              <Select value={value.end} onValueChange={(end) => set({ end: end as RecurrenceForm["end"] })}>
                <SelectTrigger className="w-full" aria-label="Ends"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="until">On a date</SelectItem>
                  <SelectItem value="count">After a number of times</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.end === "until" && (
              <div className="grid gap-1"><Label htmlFor="r-until">Last date</Label><Input id="r-until" type="date" value={value.until} onChange={(event) => set({ until: event.target.value })} /></div>
            )}
            {value.end === "count" && (
              <div className="grid gap-1"><Label htmlFor="r-count">Times</Label><Input id="r-count" type="number" min={1} max={500} value={value.count} onChange={(event) => set({ count: event.target.value })} /></div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Each occurrence is planned on its own day and due by the end of that working day. Completing one occurrence keeps the series going.</p>
        </>
      )}
    </fieldset>
  );
}
