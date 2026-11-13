"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, CircleDollarSign, DatabaseZap, Phone, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildCrmFieldPreview } from "@/lib/revenue/crm";
import { allowedNextStages, DEAL_STAGE_LABELS } from "@/lib/revenue/deals";
import { canWrite, isAdmin } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";

import { api, daysAgo, money, shortDate, type Workspace, type WorkspaceDeal } from "./client";
import { DealPeople } from "./contacts-panel";
import { DealActivity, DealForecastControls, DealStageTime, useDealTimeline } from "./deal-insights";
import { repTalk } from "./home-view";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { ErrorText, Panel, PanelHeader, riskTone, StageBadge, TalkSplit } from "./ui";

export function DealView({
  workspace,
  deal,
  version,
  onChanged,
  onOpenCall,
  onBack,
  onLogCall,
}: {
  workspace: Workspace;
  deal: WorkspaceDeal;
  version: number;
  onChanged: () => void;
  onOpenCall: (id: string, at?: number | null) => void;
  onBack: () => void;
  onLogCall: (dealId: string) => void;
}) {
  const people = usePeople();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const writer = canWrite(workspace.role);
  const nextStages = allowedNextStages(deal.stage, { privileged: isAdmin(workspace.role) });
  const account = workspace.accounts.find((entry) => entry.id === deal.accountId);
  const calls = workspace.calls.filter((call) => call.dealId === deal.id);
  const { timeline, error: timelineError } = useDealTimeline(workspace.tenant.id, deal.id, version);
  const crmPreview = buildCrmFieldPreview(
    deal,
    calls.map((call) => ({
      id: call.id,
      occurredAt: call.occurredAt,
      nextSteps: call.analysis.nextSteps,
      competitorKeywords: call.analysis.competitorHits.map((hit) => hit.keyword),
      firstCompetitorAt: call.analysis.competitorHits[0]?.start ?? null,
    })),
  );
  const probability = workspace.forecast.probabilities[deal.stage];

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That change wasn't saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={onBack}><ArrowLeft /> Deals</Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 gap-2">
            <p className="text-sm text-muted-foreground">{account?.name ?? "Account removed"}{account?.domain ? ` · ${account.domain}` : ""}</p>
            <h1 className="brand-heading text-2xl sm:text-[1.7rem]">{deal.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <StageBadge stage={deal.stage} />
              <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums"><CircleDollarSign className="size-4 text-muted-foreground" aria-hidden="true" />{money(deal.amount, deal.currency)}</span>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{deal.closeDate ? `Closes ${shortDate(deal.closeDate)}` : "No close date"}</span>
              <PersonChip email={deal.ownerEmail} size="sm" detail="Owner" />
            </div>
          </div>
          {writer ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value="" onValueChange={(value) => void patch({ stage: value })} disabled={pending || !nextStages.length}>
                <SelectTrigger aria-label="Move stage" className="w-48 bg-card"><SelectValue placeholder={nextStages.length ? "Move to stage…" : "Closed · admins can reopen"} /></SelectTrigger>
                <SelectContent>{nextStages.map((stage) => <SelectItem key={stage} value={stage}>{DEAL_STAGE_LABELS[stage]}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={() => onLogCall(deal.id)}><Plus /> Log call</Button>
            </div>
          ) : null}
        </div>
        <ErrorText>{error}</ErrorText>
      </div>

      {deal.risks.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {deal.risks.map((risk) => (
            <div key={risk.code} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${riskTone(risk.severity)}`}>
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="grid gap-1">
                <span>{risk.message}</span>
                {risk.callId ? (
                  <button type="button" className="w-fit text-xs font-semibold underline underline-offset-2" onClick={() => onOpenCall(risk.callId!, risk.at ?? null)}>
                    Hear it{risk.at !== undefined ? ` at ${formatTimestamp(risk.at)}` : ""}
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-chart-3/30 bg-chart-3/10 p-3 text-sm text-foreground">
          <CheckCircle2 className="size-4 text-chart-3" aria-hidden="true" /> No risk signals on this deal.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="grid content-start gap-6">
          <Panel>
            <PanelHeader
              title={`Calls (${calls.length})`}
              icon={Phone}
              actions={writer ? <Button size="sm" variant="outline" onClick={() => onLogCall(deal.id)}><Plus /> Log call</Button> : null}
            />
            {calls.length ? (
              <ul className="divide-y divide-border">
                {calls.map((call) => (
                  <li key={call.id}>
                    <button type="button" className="grid w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 sm:grid-cols-[minmax(0,1fr)_160px]" onClick={() => onOpenCall(call.id)}>
                      <span className="flex min-w-0 items-center gap-3">
                        <PersonAvatar email={call.repEmail} size="lg" />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">{call.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {shortDate(call.occurredAt)} · {formatTimestamp(call.analysis.durationSeconds)} · {call.analysis.questionCount} questions · {call.analysis.nextSteps.length} next step{call.analysis.nextSteps.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                      <TalkSplit rep={repTalk(call)} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">No calls logged on this deal yet. The first transcript turns on talk ratio, next steps and risk signals.</p>
            )}
          </Panel>

          <DealActivity timeline={timeline} error={timelineError} onOpenCall={onOpenCall} />

          <Panel>
            <PanelHeader
              title="CRM update preview"
              icon={DatabaseZap}
              description="What an approved sync would write to your CRM, with the transcript evidence for each field."
            />
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent"><TableHead className="pl-4">Field</TableHead><TableHead>Would write</TableHead><TableHead className="pr-4">Evidence</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {crmPreview.map((proposal) => (
                  <TableRow key={proposal.field}>
                    <TableCell className="pl-4 text-xs font-medium">{proposal.field}</TableCell>
                    <TableCell className="max-w-72 text-xs whitespace-normal">{proposal.proposed || "—"}</TableCell>
                    <TableCell className="pr-4 text-xs">
                      {proposal.evidence ? (
                        <button type="button" className="font-medium text-primary underline-offset-2 hover:underline dark:text-foreground" onClick={() => onOpenCall(proposal.evidence!.callId, proposal.evidence!.at)}>
                          {proposal.evidence.at === null ? "Open call" : `Call at ${formatTimestamp(proposal.evidence.at)}`}
                        </button>
                      ) : <span className="text-muted-foreground">Deal record</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">No CRM is connected to this workspace yet, so nothing is written. Connecting one will ask for approval before any field changes.</p>
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel>
            <PanelHeader title="Deal details" description={`${probability}% win probability at this stage · ${deal.daysInStage} days in stage`} />
            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="deal-amount-edit">Amount ({deal.currency})</Label>
                <Input
                  id="deal-amount-edit"
                  type="number"
                  min={0}
                  defaultValue={deal.amount}
                  disabled={!writer}
                  onBlur={(event) => Number(event.target.value) !== deal.amount && event.target.value !== "" && void patch({ amount: Number(event.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="deal-close-edit">Close date</Label>
                <Input
                  id="deal-close-edit"
                  type="date"
                  defaultValue={deal.closeDate ?? ""}
                  disabled={!writer}
                  onBlur={(event) => event.target.value !== (deal.closeDate ?? "") && void patch({ closeDate: event.target.value || null })}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                <Label>Owner</Label>
                <Select value={deal.ownerEmail} onValueChange={(value) => value !== deal.ownerEmail && void patch({ ownerEmail: value })} disabled={pending || !writer}>
                  <SelectTrigger aria-label="Owner" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...new Set([deal.ownerEmail, ...workspace.members.map((member) => member.email)])].map((email) => (
                      <SelectItem key={email} value={email}><PersonAvatar email={email} size="xs" /> {people.name(email)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                {deal.lastCall ? `Last call ${daysAgo(deal.lastCall.occurredAt)}: ${deal.lastCall.title}` : "No calls yet"}
              </p>
            </div>
          </Panel>
          <DealForecastControls workspace={workspace} deal={deal} onChanged={onChanged} />
          <DealPeople workspace={workspace} deal={deal} onChanged={onChanged} />
          <DealStageTime timeline={timeline} error={timelineError} />
        </div>
      </div>
    </div>
  );
}
