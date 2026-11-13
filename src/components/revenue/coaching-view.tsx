"use client";

import { useState } from "react";
import { CheckCircle2, GraduationCap, ListVideo, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canCoach, isAdmin } from "@/lib/revenue/schemas";
import { formatTimestamp } from "@/lib/revenue/transcript";
import { cn } from "@/lib/utils";

import { api, shortDate, type Workspace } from "./client";
import { PersonAvatar, PersonChip, usePeople } from "./people";
import { EmptyState, ErrorText, PageHeader, Panel, PanelHeader } from "./ui";

export function CoachingView({ workspace, onOpenCall, onChanged }: { workspace: Workspace; onOpenCall: (id: string, at?: number | null) => void; onChanged: () => void }) {
  const coach = canCoach(workspace.role);
  const me = workspace.user.email.toLowerCase();
  const visible = workspace.assignments.filter((entry) => coach || entry.assigneeEmail.toLowerCase() === me);
  const openCount = visible.filter((entry) => entry.status === "assigned").length;
  const [tab, setTab] = useState(visible.length || !workspace.snippets.length ? "assignments" : "library");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Coaching"
        description={coach ? "Point reps at the exact moment worth hearing, and build a library of calls that show how it's done." : "Moments your managers asked you to review, and the team's library of great calls."}
      />
      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="assignments">{coach ? "Assignments" : "For you"}{openCount ? <span className="ml-1 rounded-full bg-brand-accent px-1.5 text-[0.7rem] font-semibold text-brand-accent-foreground">{openCount}</span> : null}</TabsTrigger>
          <TabsTrigger value="library">Library ({workspace.snippets.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments"><Assignments workspace={workspace} visible={visible} onOpenCall={onOpenCall} onChanged={onChanged} /></TabsContent>
        <TabsContent value="library"><Library workspace={workspace} onOpenCall={onOpenCall} onChanged={onChanged} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Assignments({
  workspace,
  visible,
  onOpenCall,
  onChanged,
}: {
  workspace: Workspace;
  visible: Workspace["assignments"];
  onOpenCall: (id: string, at?: number | null) => void;
  onChanged: () => void;
}) {
  const people = usePeople();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coach = canCoach(workspace.role);
  const me = workspace.user.email.toLowerCase();
  const callById = new Map(workspace.calls.map((call) => [call.id, call]));
  const dealName = new Map(workspace.deals.map((deal) => [deal.id, deal.name]));

  async function acknowledge(id: string) {
    setPending(id);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/assignments/${id}/acknowledge`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That wasn't saved. Try again.");
    } finally {
      setPending(null);
    }
  }

  if (!visible.length) {
    return (
      <EmptyState icon={GraduationCap} title={coach ? "Start a coaching loop" : "You're all caught up"}>
        {coach ? "Open any call, pick the moment that matters and choose “Assign coaching”. The rep sees it here and marks it reviewed." : "When a manager assigns you a call to review, it shows up here with the moment to listen to."}
      </EmptyState>
    );
  }

  return (
    <Panel>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-border">
        {visible.map((entry) => {
          const call = callById.get(entry.callId);
          const done = entry.status === "acknowledged";
          return (
            <li key={entry.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex min-w-0 gap-3">
                <span className="flex shrink-0 -space-x-2">
                  <PersonAvatar email={entry.createdBy} size="lg" className="ring-2 ring-card" />
                  <PersonAvatar email={entry.assigneeEmail} size="lg" className="ring-2 ring-card" />
                </span>
                <div className="grid min-w-0 gap-1">
                  <p className="text-sm"><span className="font-semibold">{people.name(entry.createdBy)}</span> <span className="text-muted-foreground">asked</span> <span className="font-semibold">{entry.assigneeEmail.toLowerCase() === me ? "you" : people.name(entry.assigneeEmail)}</span> <span className="text-muted-foreground">to review</span></p>
                  <p className="truncate text-sm font-medium">{call?.title ?? "A call"}{entry.at !== null ? <span className="font-normal text-muted-foreground"> at {formatTimestamp(entry.at)}</span> : null}<span className="font-normal text-muted-foreground"> · {dealName.get(entry.dealId) ?? "—"}</span></p>
                  <p className="rounded-md bg-muted px-3 py-2 text-sm">“{entry.note}”</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", done ? "bg-chart-3/10 text-foreground" : "bg-brand-accent/20 text-accent-foreground")}>
                  {done ? <><CheckCircle2 className="size-3.5 text-chart-3" aria-hidden="true" /> Reviewed {shortDate(entry.acknowledgedAt)}</> : `Assigned ${shortDate(entry.createdAt)}`}
                </span>
                <Button size="sm" variant="outline" onClick={() => onOpenCall(entry.callId, entry.at)}><Play /> Listen{entry.at !== null ? ` at ${formatTimestamp(entry.at)}` : ""}</Button>
                {!done && entry.assigneeEmail.toLowerCase() === me ? (
                  <Button size="sm" disabled={pending === entry.id} onClick={() => void acknowledge(entry.id)}><CheckCircle2 /> Mark reviewed</Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Library({ workspace, onOpenCall, onChanged }: { workspace: Workspace; onOpenCall: (id: string, at?: number | null) => void; onChanged: () => void }) {
  const [removing, setRemoving] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const callById = new Map(workspace.calls.map((call) => [call.id, call]));
  const playlists = new Map<string, Workspace["snippets"]>();
  for (const snippet of workspace.snippets) playlists.set(snippet.playlist, [...(playlists.get(snippet.playlist) ?? []), snippet]);
  const admin = isAdmin(workspace.role);

  async function remove() {
    if (!removing) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/revenue/tenants/${workspace.tenant.id}/snippets/${removing.id}`, { method: "DELETE" });
      setRemoving(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The clip wasn't removed. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.snippets.length) {
    return (
      <EmptyState icon={ListVideo} title="Build your team's playbook from real calls">
        On any call, choose “Clip” next to a line to save that moment to a playlist, like “Pricing objections” or “Great discovery”.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ErrorText>{error}</ErrorText>
      {[...playlists.entries()].map(([name, snippets]) => (
        <Panel key={name}>
          <PanelHeader title={name} icon={ListVideo} description={`${snippets.length} clip${snippets.length === 1 ? "" : "s"}`} />
          <ul className="divide-y divide-border">
            {snippets.map((snippet) => {
              const call = callById.get(snippet.callId);
              return (
                <li key={snippet.id} className="flex items-start gap-3 px-4 py-3">
                  <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:bg-primary/85" aria-label={`Play ${snippet.title}`} onClick={() => onOpenCall(snippet.callId, snippet.start)}>
                    <Play className="size-4" aria-hidden="true" />
                  </button>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="truncate text-sm font-medium">{snippet.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{call?.title ?? "Call"} · {formatTimestamp(snippet.start)}–{formatTimestamp(snippet.end)}</p>
                    {snippet.note ? <p className="text-sm text-muted-foreground">{snippet.note}</p> : null}
                    <PersonChip email={snippet.createdBy} size="xs" detail={undefined} nameClassName="text-xs font-normal text-muted-foreground" className="mt-1" />
                  </div>
                  {admin || snippet.createdBy === workspace.user.email ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${snippet.title}`} onClick={() => setRemoving({ id: snippet.id, title: snippet.title })}><Trash2 /></Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove “{removing?.title}”?</DialogTitle>
            <DialogDescription>Only the clip goes. The call and its transcript stay as they are.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void remove()}>Remove clip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
