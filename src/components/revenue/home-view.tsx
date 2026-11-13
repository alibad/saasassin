"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, GraduationCap, Handshake, Phone, Target, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEAL_STAGE_LABELS, OPEN_STAGES } from "@/lib/revenue/deals";
import { canCoach, canWrite, ROLE_LABELS } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { cn } from "@/lib/utils";

import { daysAgo, money, shortDate, type Workspace } from "./client";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import type { Navigate } from "./routing";
import { compactMoney, EmptyState, minutesLabel, Panel, PanelHeader, RiskChip, StageBadge, stageDot, StatTile, TalkSplit } from "./ui";

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function greeting(date: Date) {
  const hour = date.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function repTalk(call: Workspace["calls"][number]) {
  return call.analysis.speakers.find((speaker) => speaker.speaker === call.repSpeaker)?.talkRatio ?? null;
}

export function HomeView({ workspace, navigate, fallbackName }: { workspace: Workspace; navigate: Navigate; fallbackName: string }) {
  const people = usePeople();
  const me = people.teammate(workspace.user.email);
  const firstName = (me.current ? me.name : workspace.user.name || fallbackName).split(" ")[0];
  const now = useMemo(() => new Date(), []);
  const accountName = useMemo(() => new Map(workspace.accounts.map((account) => [account.id, account.name])), [workspace.accounts]);
  const dealById = useMemo(() => new Map(workspace.deals.map((deal) => [deal.id, deal])), [workspace.deals]);

  const open = workspace.deals.filter((deal) => OPEN_STAGES.includes(deal.stage));
  const openPipeline = open.reduce((sum, deal) => sum + deal.amount, 0);
  const atRisk = open
    .filter((deal) => deal.risks.some((risk) => risk.severity !== "low"))
    .sort((a, b) => {
      const sa = Math.min(...a.risks.map((risk) => SEVERITY_RANK[risk.severity] ?? 3));
      const sb = Math.min(...b.risks.map((risk) => SEVERITY_RANK[risk.severity] ?? 3));
      return sa - sb || b.amount - a.amount;
    });
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const recentCalls = workspace.calls.filter((call) => new Date(call.occurredAt).getTime() >= weekAgo);
  const recentMinutes = recentCalls.reduce((sum, call) => sum + call.analysis.durationSeconds, 0);
  const myEmail = workspace.user.email.toLowerCase();
  const coach = canCoach(workspace.role);
  const queue = workspace.assignments.filter((entry) => entry.status === "assigned" && (coach || entry.assigneeEmail.toLowerCase() === myEmail));
  const callById = new Map(workspace.calls.map((call) => [call.id, call]));
  const upcoming = open
    .filter((deal) => deal.closeDate)
    .sort((a, b) => (a.closeDate ?? "").localeCompare(b.closeDate ?? ""))
    .slice(0, 4);

  const byStage = OPEN_STAGES.map((stage) => {
    const deals = open.filter((deal) => deal.stage === stage);
    return { stage, count: deals.length, amount: deals.reduce((sum, deal) => sum + deal.amount, 0) };
  });
  const maxStage = Math.max(1, ...byStage.map((entry) => entry.amount));
  const total = workspace.forecast.total;

  if (!workspace.deals.length && !workspace.calls.length) {
    return (
      <div className="grid gap-6">
        <Header firstName={firstName} now={now} workspace={workspace} />
        <EmptyState
          icon={Handshake}
          title="Start with the deals your team is working"
          action={
            canWrite(workspace.role) ? (
              <>
                <Button onClick={() => navigate({ view: "deals" })}><Handshake /> Add your first deal</Button>
                <Button variant="outline" onClick={() => navigate({ view: "team" })}>Invite your team</Button>
              </>
            ) : null
          }
        >
          Add an account and a deal, then log calls against it. Home fills in with pipeline, deals that need attention and the calls worth reviewing.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <Header firstName={firstName} now={now} workspace={workspace} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile label="Open pipeline" value={compactMoney(openPipeline)} detail={`${open.length} open deal${open.length === 1 ? "" : "s"}`} icon={Handshake} />
        <StatTile label="Weighted forecast" value={compactMoney(total.weighted)} detail={`Commit ${compactMoney(total.commit)} · Best case ${compactMoney(total.bestCase)}`} icon={TrendingUp} tone="accent" />
        <StatTile label="Calls this week" value={recentCalls.length} detail={recentCalls.length ? `${minutesLabel(recentMinutes)} of conversation analysed` : "No calls logged in the last 7 days"} icon={Phone} />
        <StatTile label="Deals at risk" value={atRisk.length} detail={atRisk.length ? `${compactMoney(atRisk.reduce((sum, deal) => sum + deal.amount, 0))} needs attention` : "Every open deal looks healthy"} icon={AlertTriangle} tone={atRisk.length ? "warning" : "default"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
        <div className="grid content-start gap-6">
          <Panel>
            <PanelHeader
              title="Deals that need attention"
              description="Open deals with a risk signal, most urgent first. Every signal links to the moment that raised it."
              icon={AlertTriangle}
              actions={<Button size="sm" variant="ghost" onClick={() => navigate({ view: "deals" })}>All deals <ArrowRight /></Button>}
            />
            {atRisk.length ? (
              <ul className="divide-y divide-border">
                {atRisk.slice(0, 6).map((deal) => (
                  <li key={deal.id}>
                    <button type="button" className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_auto]" onClick={() => navigate({ view: "deal", deal: deal.id })}>
                      <span className="grid min-w-0 gap-1.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-foreground">{deal.name}</span>
                          <StageBadge stage={deal.stage} className="h-5" />
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {deal.risks.map((risk) => <RiskChip key={risk.code} code={risk.code} severity={risk.severity} />)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 sm:justify-end">
                        <span className="grid text-right">
                          <span className="font-semibold tabular-nums">{money(deal.amount, deal.currency)}</span>
                          <span className="text-xs text-muted-foreground">{accountName.get(deal.accountId) ?? "—"}</span>
                        </span>
                        <PersonAvatar email={deal.ownerEmail} size="md" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">No open deal has a risk signal right now. Signals appear here as soon as a call or a date raises one.</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Recent calls"
              description="Talk ratio, questions and next steps, computed from each transcript."
              icon={Phone}
              actions={<Button size="sm" variant="ghost" onClick={() => navigate({ view: "calls" })}>All calls <ArrowRight /></Button>}
            />
            {workspace.calls.length ? (
              <ul className="divide-y divide-border">
                {workspace.calls.slice(0, 6).map((call) => {
                  const deal = dealById.get(call.dealId);
                  return (
                    <li key={call.id}>
                      <button type="button" className="grid w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_150px_128px]" onClick={() => navigate({ view: "call", call: call.id })}>
                        <span className="flex min-w-0 items-center gap-3">
                          <PersonAvatar email={call.repEmail} size="lg" />
                          <span className="grid min-w-0">
                            <span className="truncate font-medium text-foreground">{call.title}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {deal ? accountName.get(deal.accountId) ?? deal.name : "Deal removed"} · {people.firstName(call.repEmail)} · {daysAgo(call.occurredAt)} · {formatTimestamp(call.analysis.durationSeconds)}
                            </span>
                          </span>
                        </span>
                        <TalkSplit rep={repTalk(call)} />
                        <span className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground sm:justify-end">
                          {call.analysis.nextSteps.length ? (
                            <span className="inline-flex items-center gap-1 text-foreground"><CalendarClock className="size-3.5 text-chart-3" aria-hidden="true" />{call.analysis.nextSteps.length} next</span>
                          ) : (
                            <span>No next step</span>
                          )}
                          {call.scorePercent !== null ? <span className="rounded bg-secondary px-1.5 py-0.5 font-medium tabular-nums text-secondary-foreground">{call.scorePercent}%</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">Log your first call from a transcript to see its analysis here.</p>
            )}
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel>
            <PanelHeader title="Pipeline by stage" icon={Target} />
            <div className="grid gap-3 p-4">
              {byStage.map((entry) => (
                <button key={entry.stage} type="button" className="grid gap-1 text-left" onClick={() => navigate({ view: "deals" })}>
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", stageDot(entry.stage))} aria-hidden="true" />{DEAL_STAGE_LABELS[entry.stage]}</span>
                    <span className="tabular-nums text-muted-foreground"><span className="font-medium text-foreground">{compactMoney(entry.amount)}</span> · {entry.count}</span>
                  </span>
                  <span className="block h-2 overflow-hidden rounded-full bg-muted">
                    <span className={cn("block h-full rounded-full", stageDot(entry.stage))} style={{ width: `${Math.max(entry.amount ? 4 : 0, (entry.amount / maxStage) * 100)}%` }} />
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title={coach ? "Coaching in progress" : "Your coaching queue"}
              icon={GraduationCap}
              actions={<Button size="sm" variant="ghost" onClick={() => navigate({ view: "coaching" })}>Open <ArrowRight /></Button>}
            />
            {queue.length ? (
              <ul className="divide-y divide-border">
                {queue.slice(0, 4).map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="grid w-full gap-1.5 px-4 py-3 text-left hover:bg-muted/60" onClick={() => navigate({ view: "call", call: entry.callId, at: entry.at })}>
                      <span className="flex items-center justify-between gap-2">
                        <PersonChip email={entry.assigneeEmail} size="sm" detail={`from ${people.firstName(entry.createdBy)}`} />
                        {entry.at !== null ? <span className="text-xs tabular-nums text-muted-foreground">at {formatTimestamp(entry.at)}</span> : null}
                      </span>
                      <span className="line-clamp-2 text-sm text-muted-foreground">“{entry.note}”</span>
                      <span className="truncate text-xs text-muted-foreground">{callById.get(entry.callId)?.title ?? "Call"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">{coach ? "Assign a moment from any call to start a coaching loop with a rep." : "Nothing waiting for you. Managers can assign you calls to review."}</p>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Closing soonest" icon={CalendarClock} />
            {upcoming.length ? (
              <ul className="divide-y divide-border">
                {upcoming.map((deal) => {
                  const overdue = deal.closeDate !== null && deal.closeDate < now.toISOString().slice(0, 10);
                  return (
                    <li key={deal.id}>
                      <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60" onClick={() => navigate({ view: "deal", deal: deal.id })}>
                        <PersonAvatar email={deal.ownerEmail} size="md" />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">{deal.name}</span>
                          <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {overdue ? "Was due " : "Closes "}{shortDate(deal.closeDate)}
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular-nums">{compactMoney(deal.amount, deal.currency)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">Give open deals a close date to see what&apos;s landing next.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Header({ firstName, now, workspace }: { firstName: string; now: Date; workspace: Workspace }) {
  return (
    <div className="grid gap-1">
      <p className="text-sm text-muted-foreground">
        {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {workspace.tenant.name} · {ROLE_LABELS[workspace.role] ?? workspace.role}
      </p>
      <h1 className="brand-heading text-2xl sm:text-[1.7rem]">{greeting(now)}{firstName ? `, ${firstName}` : ""}</h1>
    </div>
  );
}
