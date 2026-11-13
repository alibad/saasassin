"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LoaderCircle, Phone, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canWrite } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";

import { api, shortDate, type Workspace } from "./client";
import { repTalk } from "./home-view";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { EmptyState, ErrorText, PageHeader, Panel, TalkSplit } from "./ui";

type SearchResponse = {
  results: Array<{ callId: string; title: string; dealId: string; occurredAt: string; segmentIndex: number; start: number; speaker: string; text: string; charStart: number; charEnd: number }>;
  truncated: boolean;
};

const ALL = "__all__";

export function CallsView({
  workspace,
  initialQuery,
  onOpenCall,
  onLogCall,
}: {
  workspace: Workspace;
  initialQuery: string;
  onOpenCall: (id: string, at?: number | null) => void;
  onLogCall: () => void;
}) {
  const people = usePeople();
  const [rep, setRep] = useState(ALL);
  const dealById = useMemo(() => new Map(workspace.deals.map((deal) => [deal.id, deal])), [workspace.deals]);
  const accountName = useMemo(() => new Map(workspace.accounts.map((account) => [account.id, account.name])), [workspace.accounts]);
  const reps = [...new Set(workspace.calls.map((call) => call.repEmail.toLowerCase()))].sort((a, b) => people.name(a).localeCompare(people.name(b)));
  const calls = rep === ALL ? workspace.calls : workspace.calls.filter((call) => call.repEmail.toLowerCase() === rep);
  const minutes = Math.round(workspace.calls.reduce((sum, call) => sum + call.analysis.durationSeconds, 0) / 60);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Calls"
        description={workspace.calls.length ? `${workspace.calls.length} conversations · ${minutes.toLocaleString("en-US")} minutes analysed. Every number links back to the transcript.` : "Conversations your team has logged, analysed from the transcript."}
        actions={canWrite(workspace.role) ? <Button onClick={onLogCall}><Plus /> Log a call</Button> : null}
      />
      {!workspace.calls.length ? (
        <EmptyState icon={Phone} title="Log your first conversation" action={canWrite(workspace.role) ? <Button onClick={onLogCall}><Plus /> Log a call</Button> : null}>
          Export the transcript from Zoom, Meet or Teams (VTT or SRT) and paste it in. You&apos;ll see talk ratio, questions, trackers and next steps in seconds.
        </EmptyState>
      ) : (
        <>
          <TranscriptSearch workspace={workspace} initialQuery={initialQuery} onOpenCall={onOpenCall} />
          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">All calls</h2>
              <Select value={rep} onValueChange={setRep}>
                <SelectTrigger aria-label="Rep" size="sm" className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Every rep</SelectItem>
                  {reps.map((email) => <SelectItem key={email} value={email}><PersonAvatar email={email} size="xs" /> {people.name(email)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {calls.map((call) => {
                const deal = dealById.get(call.dealId);
                return (
                  <li key={call.id}>
                    <button type="button" className="grid w-full gap-2 px-4 py-3 text-left hover:bg-muted/60" onClick={() => onOpenCall(call.id)}>
                      <span className="flex items-center gap-3">
                        <PersonAvatar email={call.repEmail} size="lg" />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate font-medium">{call.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {deal ? accountName.get(deal.accountId) ?? deal.name : "Deal removed"} · {shortDate(call.occurredAt)} · {formatTimestamp(call.analysis.durationSeconds)}
                          </span>
                        </span>
                        {call.scorePercent !== null ? <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums text-secondary-foreground">{call.scorePercent}%</span> : null}
                      </span>
                      <TalkSplit rep={repTalk(call)} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="pl-4">Call</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead className="min-w-36">Talk ratio</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead>Trackers</TableHead>
                  <TableHead className="text-right">Next steps</TableHead>
                  <TableHead className="pr-4 text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => {
                  const deal = dealById.get(call.dealId);
                  return (
                    <TableRow key={call.id} className="cursor-pointer" onClick={() => onOpenCall(call.id)}>
                      <TableCell className="max-w-80 pl-4">
                        <button type="button" className="grid min-w-0 text-left" onClick={() => onOpenCall(call.id)}>
                          <span className="truncate font-medium hover:underline">{call.title}</span>
                          <span className="truncate text-xs text-muted-foreground">{deal ? `${accountName.get(deal.accountId) ?? deal.name}` : "Deal removed"} · {shortDate(call.occurredAt)}</span>
                        </button>
                      </TableCell>
                      <TableCell><PersonChip email={call.repEmail} size="sm" /></TableCell>
                      <TableCell className="tabular-nums">{formatTimestamp(call.analysis.durationSeconds)}</TableCell>
                      <TableCell><TalkSplit rep={repTalk(call)} className="w-32" /></TableCell>
                      <TableCell className="text-right tabular-nums">{call.analysis.questionCount}</TableCell>
                      <TableCell>
                        <span className="flex max-w-56 flex-wrap gap-1">
                          {call.analysis.trackerSummary.length ? call.analysis.trackerSummary.map((entry) => (
                            <span key={entry.trackerId} className={entry.kind === "competitor" ? "rounded-full bg-destructive/10 px-2 py-0.5 text-[0.7rem] font-medium text-destructive" : "rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground"}>
                              {entry.trackerName} {entry.count}
                            </span>
                          )) : <span className="text-xs text-muted-foreground">—</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{call.analysis.nextSteps.length}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{call.scorePercent === null ? <span className="text-muted-foreground">—</span> : `${call.scorePercent}%`}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}

function TranscriptSearch({ workspace, initialQuery, onOpenCall }: { workspace: Workspace; initialQuery: string; onOpenCall: (id: string, at?: number | null) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<(SearchResponse & { query: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(initialQuery.trim().length >= 2);
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));
  const repOf = new Map(workspace.calls.map((call) => [call.id, call.repEmail]));
  const searchUrl = (text: string) => `/api/revenue/tenants/${workspace.tenant.id}/search?q=${encodeURIComponent(text)}`;

  async function run(text: string) {
    setPending(true);
    setError(null);
    try {
      const response = await api<SearchResponse>(searchUrl(text));
      setResult({ ...response, query: text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search didn't work. Try again.");
    } finally {
      setPending(false);
    }
  }

  // A query that arrived in the link (the top-bar search) runs straight away.
  const tenantId = workspace.tenant.id;
  useEffect(() => {
    const text = initialQuery.trim();
    if (text.length < 2) return;
    let cancelled = false;
    api<SearchResponse>(`/api/revenue/tenants/${tenantId}/search?q=${encodeURIComponent(text)}`)
      .then((response) => !cancelled && setResult({ ...response, query: text }))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setPending(false));
    return () => {
      cancelled = true;
    };
  }, [initialQuery, tenantId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length >= 2) void run(query.trim());
  }

  return (
    <Panel className="grid gap-3 p-4">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit} role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="Search transcripts" className="h-9 pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every transcript: “pricing”, “security review”, a competitor…" maxLength={120} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="h-9" disabled={pending || query.trim().length < 2}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Search />} Search
          </Button>
          {result ? <Button type="button" variant="ghost" className="h-9" onClick={() => { setResult(null); setQuery(""); }}><X /> Clear</Button> : null}
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
      {result ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {result.results.length}{result.truncated ? "+" : ""} moment{result.results.length === 1 ? "" : "s"} matching <span className="font-medium text-foreground">“{result.query}”</span>
          </p>
          {result.results.length ? (
            <ul className="grid gap-2">
              {result.results.map((hit) => (
                <li key={`${hit.callId}-${hit.segmentIndex}`}>
                  <button type="button" className="grid w-full gap-1.5 rounded-lg border border-border bg-background p-3 text-left hover:border-ring/50" onClick={() => onOpenCall(hit.callId, hit.start)}>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <PersonAvatar email={repOf.get(hit.callId)} size="xs" />
                      <span className="font-medium text-foreground">{hit.title}</span>
                      <span>· {dealName.get(hit.dealId) ?? "—"} · {shortDate(hit.occurredAt)}</span>
                      <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 tabular-nums text-secondary-foreground">{formatTimestamp(hit.start)}</span>
                    </span>
                    <span className="text-sm">
                      <span className="font-medium">{hit.speaker}: </span>
                      {hit.charStart > 80 ? "…" : ""}{hit.text.slice(Math.max(0, hit.charStart - 80), hit.charStart)}
                      <mark className="rounded-sm bg-brand-accent/35 px-0.5 text-foreground">{hit.text.slice(hit.charStart, hit.charEnd)}</mark>
                      {hit.text.slice(hit.charEnd, hit.charEnd + 120)}{hit.text.length > hit.charEnd + 120 ? "…" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody said that on a logged call yet. Try a shorter phrase.</p>
          )}
        </div>
      ) : null}
    </Panel>
  );
}
