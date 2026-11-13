"use client";

import { useMemo } from "react";
import { Activity, BarChart3, BookOpen, Radar, ShieldAlert, Users } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_DEFINITIONS } from "@/lib/revenue/coaching";
import { RISK_RULE_DEFINITIONS } from "@/lib/revenue/deals";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { cn } from "@/lib/utils";

import { percent, type Workspace } from "./client";
import { PersonChip } from "./people";
import { EmptyState, PageHeader, Panel, PanelHeader, riskLabel, StatTile } from "./ui";

const WEEKS = 8;

export function InsightsView({ workspace }: { workspace: Workspace; onOpenCall: (id: string, at?: number | null) => void }) {
  const calls = workspace.calls;
  const totalMinutes = workspace.repStats.reduce((sum, rep) => sum + rep.totalMinutes, 0);
  const withNextStep = calls.filter((call) => call.analysis.nextSteps.length).length;
  const competitorCalls = calls.filter((call) => call.analysis.competitorMentioned).length;
  const scored = calls.filter((call) => call.scorePercent !== null);

  const trackers = useMemo(() => {
    const byTracker = new Map<string, { name: string; kind: string; calls: number; mentions: number }>();
    for (const call of calls) {
      for (const entry of call.analysis.trackerSummary) {
        const current = byTracker.get(entry.trackerId) ?? { name: entry.trackerName, kind: entry.kind, calls: 0, mentions: 0 };
        current.calls += 1;
        current.mentions += entry.count;
        byTracker.set(entry.trackerId, current);
      }
    }
    return [...byTracker.values()].sort((a, b) => b.calls - a.calls || b.mentions - a.mentions);
  }, [calls]);

  const weeks = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    return Array.from({ length: WEEKS }, (_, index) => {
      const from = new Date(start.getTime() + index * 7 * 86_400_000);
      const to = new Date(from.getTime() + 7 * 86_400_000);
      const inWeek = calls.filter((call) => {
        const at = new Date(call.occurredAt).getTime();
        return at >= from.getTime() && at < to.getTime();
      });
      return { label: from.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: inWeek.length, minutes: Math.round(inWeek.reduce((sum, call) => sum + call.analysis.durationSeconds, 0) / 60) };
    });
  }, [calls]);
  const maxWeek = Math.max(1, ...weeks.map((week) => week.count));
  const maxTracker = Math.max(1, ...trackers.map((tracker) => tracker.calls));

  return (
    <div className="grid gap-6">
      <PageHeader title="Insights" description="How the team sells, measured the same way on every call. Each number is computed from transcripts in this workspace and nothing else." />
      {!calls.length ? (
        <EmptyState icon={BarChart3} title="Insights appear after the first few calls">
          Log calls for your reps and this page compares talk ratio, questions, monologues and next steps across the team.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatTile label="Calls analysed" value={calls.length} detail={`${Math.round(totalMinutes).toLocaleString("en-US")} minutes of conversation`} icon={Activity} />
            <StatTile label="Calls with a next step" value={percent(withNextStep / calls.length)} detail={`${withNextStep} of ${calls.length} calls`} icon={BarChart3} tone="accent" />
            <StatTile label="Competitor mentioned" value={competitorCalls} detail={`${percent(competitorCalls / calls.length)} of calls`} icon={ShieldAlert} tone={competitorCalls ? "warning" : "default"} />
            <StatTile label="Average scorecard" value={scored.length ? `${Math.round(scored.reduce((sum, call) => sum + (call.scorePercent ?? 0), 0) / scored.length)}%` : "—"} detail={`${scored.length} call${scored.length === 1 ? "" : "s"} scored`} icon={Users} />
          </div>

          <Panel className="overflow-hidden">
            <PanelHeader title="Team" icon={Users} description="Averages per rep, from the calls where they were identified as the rep speaker." />
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Rep</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="min-w-40">Talk ratio</TableHead>
                  <TableHead className="text-right">Longest monologue</TableHead>
                  <TableHead className="text-right">Questions / call</TableHead>
                  <TableHead className="text-right">Interactivity</TableHead>
                  <TableHead className="text-right">Next-step rate</TableHead>
                  <TableHead className="pr-4 text-right">Avg score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.repStats.map((rep) => (
                  <TableRow key={rep.repEmail}>
                    <TableCell className="pl-4"><PersonChip email={rep.repEmail} size="md" detail={`${Math.round(rep.totalMinutes)} min`} /></TableCell>
                    <TableCell className="text-right tabular-nums">{rep.calls}</TableCell>
                    <TableCell>
                      {rep.avgRepTalkRatio === null ? <span className="text-muted-foreground">—</span> : (
                        <span className="flex items-center gap-2">
                          <span className="relative block h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                            <span className={cn("block h-full rounded-full", rep.avgRepTalkRatio > 0.6 ? "bg-destructive" : "bg-chart-1")} style={{ width: `${rep.avgRepTalkRatio * 100}%` }} />
                          </span>
                          <span className="tabular-nums">{percent(rep.avgRepTalkRatio)}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{rep.avgLongestRepMonologueSeconds === null ? "—" : formatTimestamp(rep.avgLongestRepMonologueSeconds)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rep.avgQuestionsPerCall}</TableCell>
                    <TableCell className="text-right tabular-nums">{rep.avgInteractivity}/10</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(rep.nextStepRate)}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">{rep.avgScorePercent === null ? <span className="text-muted-foreground">—</span> : <>{rep.avgScorePercent}% <span className="text-xs text-muted-foreground">({rep.scoredCalls})</span></>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="What customers bring up" icon={Radar} description="Calls where each tracker matched at least once." />
              {trackers.length ? (
                <ul className="grid gap-3 p-4">
                  {trackers.map((tracker) => (
                    <li key={tracker.name} className="grid gap-1">
                      <span className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{tracker.name}{tracker.kind === "competitor" ? <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 text-[0.65rem] font-medium text-destructive">competitor</span> : null}</span>
                        <span className="tabular-nums text-muted-foreground"><span className="font-medium text-foreground">{tracker.calls}</span> calls · {tracker.mentions} mentions</span>
                      </span>
                      <span className="block h-2 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", tracker.kind === "competitor" ? "bg-destructive/70" : "bg-chart-2")} style={{ width: `${(tracker.calls / maxTracker) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-4 py-6 text-sm text-muted-foreground">No tracker has matched yet. Add the words your buyers use in Settings.</p>}
            </Panel>
            <Panel>
              <PanelHeader title="Calls per week" icon={Activity} description={`Last ${WEEKS} weeks`} />
              <div className="grid gap-2 p-4">
                <div className="flex h-44 items-end gap-2 border-b border-border" role="img" aria-label="Calls logged per week">
                  {weeks.map((week) => (
                    <div key={week.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs tabular-nums text-muted-foreground">{week.count || ""}</span>
                      <span className="w-full max-w-10 rounded-t-md bg-chart-1" style={{ height: `${(week.count / maxWeek) * 80}%` }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">{weeks.map((week) => <span key={week.label} className="flex-1 truncate text-center text-[0.7rem] text-muted-foreground">{week.label}</span>)}</div>
              </div>
            </Panel>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="How each metric is measured" icon={BookOpen} />
          <dl className="grid gap-2 p-4 text-sm">
            {METRIC_DEFINITIONS.map((entry) => <div key={entry.metric}><dt className="inline font-medium">{entry.metric}: </dt><dd className="inline text-muted-foreground">{entry.definition}</dd></div>)}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="When a deal is flagged" icon={ShieldAlert} />
          <dl className="grid gap-2 p-4 text-sm">
            {Object.entries(RISK_RULE_DEFINITIONS).map(([code, definition]) => <div key={code}><dt className="inline font-medium">{riskLabel(code)}: </dt><dd className="inline text-muted-foreground">{definition}</dd></div>)}
            <p className="pt-1 text-xs text-muted-foreground">Gone quiet after {workspace.settings.staleAfterDays} days · stalled after {workspace.settings.stalledAfterDays ?? 30} days in one stage. Admins change both in Settings.</p>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
