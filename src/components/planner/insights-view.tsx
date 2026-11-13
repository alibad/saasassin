"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlanningAnalytics } from "@/lib/planner/analytics";
import type { PlannerSnapshot } from "@/lib/planner/model";

import { apiJson, formatDateTime, formatDayHeading, minutesLabel } from "./format";
import styles from "./planner.module.css";

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

export function InsightsView({ snapshot, base }: { snapshot: PlannerSnapshot; base: string }) {
  const [data, setData] = useState<PlanningAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = snapshot.settings.timeZone;

  useEffect(() => {
    let cancelled = false;
    apiJson<PlanningAnalytics>(`${base}/analytics`)
      .then((body) => !cancelled && setData(body))
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => { cancelled = true; };
  }, [base, snapshot]);

  if (error) return <Alert variant="destructive"><AlertTitle>Could not load insights</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (!data) return <div className="grid gap-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>;

  const peak = Math.max(60, ...data.weeks.flatMap((week) => [week.plannedMinutes, week.completedMinutes]));
  const nothingYet = data.weeks.every((week) => week.plannedMinutes === 0 && week.completedMinutes === 0);
  // Start the chart at the first week with any planning, so a new workspace is not a column of zeros.
  const firstActive = data.weeks.findIndex((week) => week.plannedMinutes > 0 || week.completedMinutes > 0);
  const weeks = firstActive > 0 ? data.weeks.slice(firstActive) : data.weeks;

  return (
    <div className="grid gap-4">
      <Card className={styles.panel}>
        <CardHeader>
          <CardTitle>Planned vs completed, per week</CardTitle>
          <CardDescription>
            Planned is what your plan scheduled that week; completed is the time recorded when work was ticked off (or its estimate). Weeks start on Monday, {tz}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {nothingYet ? (
            <p className={styles.muted}>No plans or completions in the last 8 weeks yet. Run the scheduler and mark work done to see your trend.</p>
          ) : (
            <ul className={styles.weekBars} aria-label="Planned and completed hours per week">
              {weeks.map((week) => (
                <li key={week.weekStart}>
                  <span className={styles.weekLabel}>{formatDayHeading(week.weekStart).replace(/^\w+ /, "")}</span>
                  <span className={styles.barPair}>
                    <span className={styles.barPlanned} style={{ width: `${(week.plannedMinutes / peak) * 100}%` }} />
                    <span className={styles.barDone} style={{ width: `${(week.completedMinutes / peak) * 100}%` }} />
                  </span>
                  <span className={styles.weekValues}>{minutesLabel(week.plannedMinutes)} planned · {minutesLabel(week.completedMinutes)} done ({week.completions})</span>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.legend}><span className={styles.barPlanned} /> planned <span className={styles.barDone} /> completed</p>
        </CardContent>
      </Card>

      <div className={styles.statGrid}>
        <Card className={styles.panel}>
          <CardHeader><CardDescription>Deadline hit rate</CardDescription><CardTitle className={styles.bigNumber}>{percent(data.deadlines.rate)}</CardTitle></CardHeader>
          <CardContent className={styles.muted}>
            {data.deadlines.rate === null
              ? "No deadlines have come due yet."
              : `${data.deadlines.hit} on time, ${data.deadlines.missed} missed or overdue, ${data.deadlines.upcoming} still ahead.`}
          </CardContent>
        </Card>
        <Card className={styles.panel}>
          <CardHeader><CardDescription>Estimate accuracy (actual ÷ estimate, median)</CardDescription><CardTitle className={styles.bigNumber}>{data.estimates.medianRatio === null ? "—" : `${data.estimates.medianRatio}×`}</CardTitle></CardHeader>
          <CardContent className={styles.muted}>
            {data.estimates.samples === 0
              ? "Record actual time when marking work done to measure your estimates."
              : `${percent(data.estimates.withinQuarter)} of ${data.estimates.samples} within ±25% · ${minutesLabel(data.estimates.estimateMinutes)} estimated vs ${minutesLabel(data.estimates.actualMinutes)} actual.`}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Pushed most often</CardTitle><CardDescription>Each “Push to next working day” counts.</CardDescription></CardHeader>
          <CardContent>
            {data.pushed.length === 0 ? <p className={styles.muted}>Nothing has been pushed.</p> : (
              <ul className={styles.simpleList}>{data.pushed.map((entry) => <li key={entry.id}><span><strong>{entry.title}</strong><small>pushed {entry.pushCount}×</small></span></li>)}</ul>
            )}
          </CardContent>
        </Card>
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Biggest estimate misses</CardTitle></CardHeader>
          <CardContent>
            {data.estimates.biggestMisses.length === 0 ? <p className={styles.muted}>No misses recorded.</p> : (
              <ul className={styles.simpleList}>
                {data.estimates.biggestMisses.map((entry) => (
                  <li key={entry.id}><span><strong>{entry.title}</strong><small>{minutesLabel(entry.estimate)} estimated → {minutesLabel(entry.actual)} actual ({entry.ratio}×)</small></span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className={styles.panel}>
          <CardHeader><CardTitle>Missed deadlines</CardTitle></CardHeader>
          <CardContent>
            {data.deadlines.missedTasks.length === 0 ? <p className={styles.muted}>None missed.</p> : (
              <ul className={styles.simpleList}>
                {data.deadlines.missedTasks.map((entry) => (
                  <li key={entry.id}><span><strong>{entry.title}</strong><small>due {formatDateTime(entry.deadline, tz)} · {entry.completedAt ? `done ${formatDateTime(entry.completedAt, tz)}` : "still open"}</small></span></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
