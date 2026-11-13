"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Highlighter,
  History,
  Lightbulb,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Quote,
  Search,
  Settings2,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { MappingReport } from "@/lib/research/dovetail";
import { canEdit, canManage, retentionState, tagFrequency, type Highlight, type Insight, type ProjectSnapshot, type ResearchRole } from "@/lib/research/model";
import type { SearchResult } from "@/lib/research/search";
import { formatTimestamp } from "@/lib/research/transcript";
import { cn } from "@/lib/utils";

import { api, errorMessage, postAction } from "./api";
import { InsightHistoryDialog } from "./insight-history";
import { Byline, type ResearchPerson } from "./people";
import { AddInterviewDialog } from "./source-dialogs";
import { TranscriptView } from "./transcript-view";
import { EmptyState, PageHeader } from "./workspace-shell";

type Snapshot = ProjectSnapshot & { role: ResearchRole; hiddenSources: number };
type FolderDraft = { id: string | null; name: string; restricted: boolean; memberUids: string[] };
type Focus = { sourceId: string; highlightId: string | null; segmentId: string | null };

/** A quote from a transcript, set like a pull quote. */
export function QuoteText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <blockquote className={cn("border-l-[3px] border-brand-accent pl-3 font-heading text-[15.5px] leading-relaxed text-foreground/90 italic break-words", className)}>
      “{children}”
    </blockquote>
  );
}

export function ProjectView({
  tenantId,
  projectId,
  initialSourceId = null,
  members = [],
  onBack,
  onSourceChange,
}: {
  tenantId: string;
  projectId: string;
  initialSourceId?: string | null;
  members?: ResearchPerson[];
  onBack: () => void;
  onSourceChange?: (sourceId: string | null) => void;
}) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState("interviews");
  const [focus, setFocusState] = useState<Focus | null>(initialSourceId ? { sourceId: initialSourceId, highlightId: null, segmentId: null } : null);
  const [addOpen, setAddOpen] = useState(false);
  const [folderEditor, setFolderEditor] = useState<FolderDraft | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  const setFocus = useCallback((next: Focus | null) => {
    setFocusState(next);
    onSourceChange?.(next?.sourceId ?? null);
  }, [onSourceChange]);

  const load = useCallback(async (message?: string) => {
    try {
      const snapshot = await api<Snapshot>(`/api/research/tenants/${tenantId}/projects/${projectId}`);
      setData(snapshot);
      setLoadError(null);
      if (message) setNotice(message);
    } catch (caught) {
      setLoadError(errorMessage(caught));
    }
  }, [tenantId, projectId]);

  useEffect(() => {
    let active = true;
    api<Snapshot>(`/api/research/tenants/${tenantId}/projects/${projectId}`)
      .then((snapshot) => { if (active) setData(snapshot); })
      .catch((caught) => { if (active) setLoadError(errorMessage(caught)); });
    return () => { active = false; };
  }, [tenantId, projectId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveFolder(remove = false) {
    if (!folderEditor) return;
    setFolderBusy(true);
    setFolderError(null);
    try {
      if (remove && folderEditor.id) await postAction(tenantId, projectId, { type: "folder.delete", folderId: folderEditor.id });
      else if (folderEditor.id) await postAction(tenantId, projectId, { type: "folder.update", folderId: folderEditor.id, name: folderEditor.name, restricted: folderEditor.restricted, memberUids: folderEditor.memberUids });
      else await postAction(tenantId, projectId, { type: "folder.create", name: folderEditor.name, restricted: folderEditor.restricted, memberUids: folderEditor.memberUids });
      setFolderEditor(null);
      await load(remove ? "Folder removed. Its interviews moved out of it." : "Folder saved.");
    } catch (caught) {
      setFolderError(errorMessage(caught));
    } finally {
      setFolderBusy(false);
    }
  }

  const editable = data ? canEdit(data.role) : false;
  const manageable = data ? canManage(data.role) : false;
  const sourceById = useMemo(() => new Map((data?.sources ?? []).map((source) => [source.id, source])), [data]);
  const activeSourceId = focus?.sourceId && sourceById.has(focus.sourceId) ? focus.sourceId : data?.sources[0]?.id ?? null;
  const activeSource = activeSourceId ? sourceById.get(activeSourceId) ?? null : null;
  const restrictable = members.filter((member) => member.role !== "owner" && member.role !== "admin");

  function openEvidence(sourceId: string, highlightId: string | null, segmentId: string | null = null) {
    setFocus({ sourceId, highlightId, segmentId });
    setTab("interviews");
  }

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 rounded-sm hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden="true" /> Projects
    </button>
  );

  if (loadError && !data) {
    return (
      <div className="grid gap-4">
        <div className="text-sm text-muted-foreground">{back}</div>
        <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
      </div>
    );
  }
  if (!data) {
    return <div className="grid gap-4"><Skeleton className="h-5 w-24" /><Skeleton className="h-10 w-80" /><Skeleton className="h-96 w-full" /></div>;
  }

  const activeHighlights = activeSource ? data.highlights.filter((highlight) => highlight.sourceId === activeSource.id) : [];
  const folders = data.folders ?? [];

  return (
    <div>
      <PageHeader
        kicker={back}
        title={data.project.name}
        description={data.project.description ? <span className="font-heading text-[17px] italic">{data.project.description}</span> : undefined}
        actions={
          <>
            {editable ? <Button onClick={() => setAddOpen(true)}><Plus /> Add interview</Button> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More project actions"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild>
                  <a href={`/api/research/tenants/${tenantId}/projects/${projectId}/export`} download><Download /> Export project</a>
                </DropdownMenuItem>
                {manageable ? (
                  <DropdownMenuItem onSelect={() => setFolderEditor({ id: null, name: "", restricted: false, memberUids: [] })}><FolderPlus /> New folder</DropdownMenuItem>
                ) : null}
                {editable ? <DropdownMenuItem onSelect={() => setTab("import")}><Upload /> Import from Dovetail</DropdownMenuItem> : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        className="mb-4"
      />
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <Byline uid={data.project.createdBy} at={data.project.createdAt} prefix="Started by" size="sm" className="text-sm" />
        {!editable ? <Badge variant="secondary">Read-only access</Badge> : null}
      </div>

      {notice ? (
        <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-md border border-primary/20 bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          {notice}
          <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => setNotice(null)}><X /></Button>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="mb-5 h-auto w-full justify-start gap-4 overflow-x-auto border-b border-border pb-0">
          <TabsTrigger value="interviews" className="flex-none pb-2.5"><FileText /> Interviews <span className="text-muted-foreground tabular-nums">{data.sources.length}</span></TabsTrigger>
          <TabsTrigger value="evidence" className="flex-none pb-2.5"><Highlighter /> Highlights <span className="text-muted-foreground tabular-nums">{data.highlights.length}</span></TabsTrigger>
          <TabsTrigger value="insights" className="flex-none pb-2.5"><Lightbulb /> Insights <span className="text-muted-foreground tabular-nums">{data.insights.length}</span></TabsTrigger>
          <TabsTrigger value="search" className="flex-none pb-2.5"><Search /> Search</TabsTrigger>
          {editable ? <TabsTrigger value="import" className="flex-none pb-2.5"><Upload /> Import</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="interviews">
          {data.sources.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Add the first interview"
              action={editable ? <Button onClick={() => setAddOpen(true)}><Plus /> Add interview</Button> : null}
            >
              Upload the transcript from your recorder or meeting tool (.vtt, .srt or plain “Speaker: text”), record the participant&apos;s consent, then select words to highlight them.
              {data.hiddenSources > 0 ? <span className="mt-2 block">{data.hiddenSources} interviews sit in folders you can&apos;t open.</span> : null}
            </EmptyState>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
              <nav aria-label="Interviews" className="grid content-start gap-4 self-start lg:sticky lg:top-6">
                {[{ id: null as string | null, name: "Interviews", restricted: false, memberUids: [] as string[] }, ...folders].map((folder) => {
                  const inFolder = data.sources.filter((source) => (source.folderId ?? null) === folder.id);
                  if (folder.id === null && inFolder.length === 0 && folders.length > 0) return null;
                  return (
                    <div key={folder.id ?? "none"} className="grid gap-0.5">
                      <div className="flex items-center justify-between gap-1 px-2 pb-1">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          {folder.id === null ? null : folder.restricted ? <Lock className="size-3" aria-hidden="true" /> : <Folder className="size-3" aria-hidden="true" />}
                          {folder.name}
                          {folder.restricted ? <span className="font-normal">· {folder.memberUids.length} listed</span> : null}
                        </span>
                        {manageable && folder.id ? (
                          <Button size="icon-xs" variant="ghost" aria-label={`Folder access for ${folder.name}`} onClick={() => setFolderEditor({ id: folder.id, name: folder.name, restricted: folder.restricted, memberUids: folder.memberUids })}>
                            <Settings2 />
                          </Button>
                        ) : null}
                      </div>
                      {inFolder.length === 0 ? <p className="px-2 text-sm text-muted-foreground">Empty</p> : null}
                      {inFolder.map((source) => {
                        const retention = retentionState(source.consent);
                        const count = data.highlights.filter((highlight) => highlight.sourceId === source.id).length;
                        const active = source.id === activeSourceId;
                        return (
                          <button
                            key={source.id}
                            type="button"
                            aria-current={active ? "true" : undefined}
                            className={cn(
                              "grid gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                              active ? "bg-card shadow-xs ring-1 ring-border" : "hover:bg-muted/70",
                            )}
                            onClick={() => setFocus({ sourceId: source.id, highlightId: null, segmentId: null })}
                          >
                            <span className={cn("text-sm leading-snug break-words", active ? "font-semibold" : "font-medium")}>{source.title}</span>
                            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                              <span className="truncate">{source.participant.company || source.participant.name}</span>
                              <span className="inline-flex items-center gap-1"><Highlighter className="size-3" aria-hidden="true" />{count}</span>
                            </span>
                            {source.legalHold || retention === "expired" || source.consent.status === "withdrawn" || source.consent.status === "pending" ? (
                              <span className="mt-1 flex flex-wrap gap-1">
                                {source.legalHold ? <Badge variant="outline">Legal hold</Badge> : null}
                                {retention === "expired" ? <Badge variant="destructive">Retention passed</Badge> : null}
                                {source.consent.status === "withdrawn" ? <Badge variant="destructive">Consent withdrawn</Badge> : null}
                                {source.consent.status === "pending" ? <Badge variant="outline">Consent pending</Badge> : null}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {data.hiddenSources > 0 ? (
                  <p className="flex items-start gap-1.5 px-2 text-xs text-muted-foreground"><Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> {data.hiddenSources} more {data.hiddenSources === 1 ? "interview sits" : "interviews sit"} in folders you can&apos;t open.</p>
                ) : null}
              </nav>
              {activeSource ? (
                <TranscriptView
                  key={activeSource.id}
                  tenantId={tenantId}
                  projectId={projectId}
                  source={activeSource}
                  highlights={activeHighlights}
                  editable={editable}
                  manageable={manageable}
                  folders={folders}
                  focusHighlightId={focus?.sourceId === activeSource.id ? focus.highlightId : null}
                  focusSegmentId={focus?.sourceId === activeSource.id ? focus.segmentId : null}
                  onChanged={load}
                  onDeleted={() => setFocus(null)}
                />
              ) : null}
              {activeSource ? (
                <CitedIn
                  insights={data.insights}
                  highlights={activeHighlights}
                  onOpenHighlight={(highlightId) => setFocus({ sourceId: activeSource.id, highlightId, segmentId: null })}
                  onOpenInsights={() => setTab("insights")}
                />
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="evidence">
          <EvidencePanel tenantId={tenantId} projectId={projectId} data={data} editable={editable} onChanged={load} onOpen={openEvidence} />
        </TabsContent>

        <TabsContent value="insights">
          <InsightsPanel tenantId={tenantId} projectId={projectId} data={data} editable={editable} onChanged={load} onOpen={openEvidence} />
        </TabsContent>

        <TabsContent value="search">
          <SearchPanel tenantId={tenantId} projectId={projectId} onOpen={openEvidence} onOpenInsight={() => setTab("insights")} />
        </TabsContent>

        {editable ? (
          <TabsContent value="import">
            <ImportPanel tenantId={tenantId} projectId={projectId} onImported={load} />
          </TabsContent>
        ) : null}
      </Tabs>

      <Dialog open={folderEditor !== null} onOpenChange={(open) => !open && setFolderEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{folderEditor?.id ? "Folder access" : "New folder"}</DialogTitle>
            <DialogDescription>A restricted folder is visible only to the people you list, plus owners and admins — in interviews, highlights, insight evidence, search, exports and activity.</DialogDescription>
          </DialogHeader>
          {folderEditor ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="folder-name">Name</Label>
                <Input id="folder-name" value={folderEditor.name} placeholder="Enterprise customers" onChange={(event) => setFolderEditor({ ...folderEditor, name: event.target.value })} />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <Switch checked={folderEditor.restricted} onCheckedChange={(value) => setFolderEditor({ ...folderEditor, restricted: value })} />
                Only listed people can open it
              </label>
              {folderEditor.restricted ? (
                <div className="grid gap-1 rounded-md border border-border p-2">
                  {restrictable.map((member) => (
                    <label key={member.uid} className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={folderEditor.memberUids.includes(member.uid)}
                        onCheckedChange={(value) => setFolderEditor({ ...folderEditor, memberUids: value ? [...folderEditor.memberUids, member.uid] : folderEditor.memberUids.filter((uid) => uid !== member.uid) })}
                      />
                      <UserAvatar person={member} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{member.name || member.email}</span>
                      <span className="text-xs text-muted-foreground">{member.roleLabel}</span>
                    </label>
                  ))}
                  {restrictable.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Invite researchers or viewers from the Team page to list them here.</p> : null}
                </div>
              ) : null}
              {folderError ? <p className="text-sm text-destructive" role="alert">{folderError}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            {folderEditor?.id ? <Button variant="ghost" className="text-destructive" disabled={folderBusy} onClick={() => saveFolder(true)}><Trash2 /> Remove folder</Button> : <span />}
            <span className="flex gap-2">
              <Button variant="outline" onClick={() => setFolderEditor(null)}>Cancel</Button>
              <Button disabled={folderBusy || !folderEditor || folderEditor.name.trim().length < 2} onClick={() => saveFolder()}>{folderBusy ? <LoaderCircle className="animate-spin" /> : null} Save</Button>
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddInterviewDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tenantId={tenantId}
        projectId={projectId}
        onCreated={async (sourceId) => {
          setAddOpen(false);
          await load("Interview added. Select words in the transcript to highlight them.");
          setFocus({ sourceId, highlightId: null, segmentId: null });
          setTab("interviews");
        }}
      />
    </div>
  );
}

/** The right rail beside a transcript: which insights rest on this interview's words. */
function CitedIn({ insights, highlights, onOpenHighlight, onOpenInsights }: { insights: Insight[]; highlights: Highlight[]; onOpenHighlight: (id: string) => void; onOpenInsights: () => void }) {
  const ids = new Set(highlights.map((highlight) => highlight.id));
  const citing = insights.filter((insight) => insight.highlightIds.some((id) => ids.has(id)));
  const tags = tagFrequency(highlights).slice(0, 8);
  return (
    <aside className="hidden content-start gap-5 self-start 2xl:sticky 2xl:top-6 2xl:grid">
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground">Cited in {citing.length} {citing.length === 1 ? "insight" : "insights"}</h3>
        {citing.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No insight cites this interview yet.</p> : null}
        <ul className="mt-3 grid gap-3">
          {citing.map((insight) => {
            const quotes = insight.highlightIds.filter((id) => ids.has(id));
            const first = highlights.find((highlight) => highlight.id === quotes[0]);
            return (
              <li key={insight.id} className="grid gap-2">
                <button type="button" onClick={onOpenInsights} className="text-left hover:text-primary">
                  <span className="font-heading text-[16.5px] leading-snug font-medium">{insight.title}</span>
                </button>
                {first ? (
                  <button type="button" onClick={() => onOpenHighlight(first.id)} className="rounded-md border-l-[3px] border-brand-accent bg-brand-subtle px-2.5 py-2 text-left text-muted-foreground hover:text-foreground">
                    <span className="font-heading text-[14px] leading-relaxed italic">“{first.quote.length > 120 ? `${first.quote.slice(0, 120)}…` : first.quote}”</span>
                  </button>
                ) : null}
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  <Byline uid={insight.createdBy} />
                  <span>{quotes.length} {quotes.length === 1 ? "quote" : "quotes"} here</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {tags.length ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground">Tags in this interview</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map(({ tag, count }) => <Badge key={tag} variant="secondary">#{tag} <span className="tabular-nums opacity-70">{count}</span></Badge>)}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function HighlightCard({ highlight, data, onOpen, children, compact = false }: { highlight: Highlight; data: Snapshot; onOpen: (sourceId: string, highlightId: string) => void; children?: ReactNode; compact?: boolean }) {
  const source = data.sources.find((entry) => entry.id === highlight.sourceId);
  const segment = source?.segments.find((entry) => entry.id === highlight.segmentId);
  return (
    <div className={cn("grid gap-2.5", compact ? "rounded-md bg-brand-subtle p-3" : "rounded-lg border border-border bg-card p-4")}>
      <QuoteText className={compact ? "text-[14.5px]" : undefined}>{highlight.quote}</QuoteText>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-medium text-foreground/80">{segment?.speaker ?? "Unknown speaker"}</span>
          <span>· {compact ? "" : `${source?.title ?? "Deleted interview"} · `}{segment?.startMs != null ? formatTimestamp(segment.startMs) : ""}</span>
        </span>
        {highlight.stale ? <Badge variant="destructive">Words changed after a correction</Badge> : null}
        {highlight.redacted ? <Badge variant="outline">Contains a redaction</Badge> : null}
        {highlight.tags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}
        {compact && source ? (
          <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Open in transcript" onClick={() => onOpen(highlight.sourceId, highlight.id)}><Quote /></Button>
        ) : null}
      </div>
      {highlight.note ? <p className="text-sm leading-relaxed">{highlight.note}</p> : null}
      {compact ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Byline uid={highlight.createdBy} at={highlight.createdAt} prefix="Highlighted by" />
          <span className="flex flex-wrap gap-1">
            {source ? <Button size="xs" variant="ghost" onClick={() => onOpen(highlight.sourceId, highlight.id)}><Quote /> Open in transcript</Button> : null}
            {children}
          </span>
        </div>
      )}
    </div>
  );
}

function EvidencePanel({ tenantId, projectId, data, editable, onChanged, onOpen }: { tenantId: string; projectId: string; data: Snapshot; editable: boolean; onChanged: (message?: string) => Promise<void>; onOpen: (sourceId: string, highlightId: string) => void }) {
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null);
  const [remove, setRemove] = useState<Highlight | null>(null);
  const [editTags, setEditTags] = useState<{ highlight: Highlight; tags: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frequency = tagFrequency(data.highlights);
  const max = frequency[0]?.count ?? 1;
  const shown = tagFilter ? data.highlights.filter((highlight) => highlight.tags.includes(tagFilter)) : data.highlights;

  async function guarded(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onChanged(message);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (data.highlights.length === 0) {
    return (
      <EmptyState icon={Highlighter} title="No highlights yet">
        Open an interview and select the words that matter. Each highlight keeps its tags and links back to the exact span of the transcript.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <section className="self-start rounded-lg border border-border bg-card p-4 lg:sticky lg:top-6">
        <h2 className="text-xs font-semibold text-muted-foreground">Tags</h2>
        {frequency.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Tags you add to highlights appear here with how often they occur.</p> : null}
        <ul className="mt-3 grid gap-2">
          {frequency.map(({ tag, count }) => (
            <li key={tag} className="group grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  aria-pressed={tagFilter === tag}
                  className={cn("min-w-0 truncate rounded-sm text-left text-sm", tagFilter === tag ? "font-semibold text-primary" : "hover:text-primary")}
                >
                  #{tag}
                </button>
                <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                  {count}
                  {editable ? (
                    <Button size="icon-xs" variant="ghost" aria-label={`Rename #${tag}`} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setRename({ from: tag, to: tag })}><Pencil /></Button>
                  ) : null}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className={cn("h-full rounded-full", tagFilter === tag ? "bg-primary" : "bg-chart-3")} style={{ width: `${Math.max(6, (count / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid content-start gap-3">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <p className="text-sm text-muted-foreground">
          {tagFilter ? <>Showing {shown.length} tagged <span className="font-medium text-foreground">#{tagFilter}</span> · <button type="button" className="underline underline-offset-2" onClick={() => setTagFilter(null)}>show all</button></> : `${shown.length} highlights, newest last`}
        </p>
        {shown.map((highlight) => (
          <HighlightCard key={highlight.id} highlight={highlight} data={data} onOpen={onOpen}>
            {editable ? <Button size="xs" variant="ghost" onClick={() => setEditTags({ highlight, tags: highlight.tags.join(", "), note: highlight.note })}><Tag /> Tags & note</Button> : null}
            {editable ? <Button size="xs" variant="ghost" aria-label="Delete highlight" onClick={() => setRemove(highlight)}><Trash2 /></Button> : null}
          </HighlightCard>
        ))}
      </div>

      <Dialog open={editTags !== null} onOpenChange={(open) => !open && setEditTags(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tags and note</DialogTitle>
            <DialogDescription>Tags are lower-cased and hyphenated, so “Churn Risk” and “churn-risk” stay one tag.</DialogDescription>
          </DialogHeader>
          {editTags ? (
            <div className="grid gap-4">
              <QuoteText>{editTags.highlight.quote}</QuoteText>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-tags">Tags, separated by commas</Label>
                <Input id="edit-tags" value={editTags.tags} onChange={(event) => setEditTags({ ...editTags, tags: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-note">Note</Label>
                <Textarea id="edit-note" rows={2} value={editTags.note} onChange={(event) => setEditTags({ ...editTags, note: event.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTags(null)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (!editTags) return;
              const ok = await guarded(() => postAction(tenantId, projectId, {
                type: "highlight.update",
                highlightId: editTags.highlight.id,
                tags: editTags.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                note: editTags.note,
              }), "Highlight updated.");
              if (ok) setEditTags(null);
            }}>{busy ? <LoaderCircle className="animate-spin" /> : null} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rename !== null} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename #{rename?.from}</DialogTitle>
            <DialogDescription>Renaming to a tag that already exists merges the two across every highlight in this project.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rename-tag">New name</Label>
            <Input id="rename-tag" value={rename?.to ?? ""} onChange={(event) => rename && setRename({ ...rename, to: event.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRename(null)}>Cancel</Button>
            <Button disabled={busy || !rename?.to.trim() || rename.to === rename.from} onClick={async () => {
              if (!rename) return;
              const ok = await guarded(() => postAction(tenantId, projectId, { type: "tag.rename", from: rename.from, to: rename.to }), "Tag renamed.");
              if (ok) { setRename(null); setTagFilter(null); }
            }}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={remove !== null} onOpenChange={(open) => !open && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this highlight?</AlertDialogTitle>
            <AlertDialogDescription>Insights that cite it lose this piece of evidence. The transcript itself does not change.</AlertDialogDescription>
          </AlertDialogHeader>
          {remove ? <QuoteText>{remove.quote}</QuoteText> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={busy} onClick={() => {
              if (!remove) return;
              void guarded(() => postAction(tenantId, projectId, { type: "highlight.delete", highlightId: remove.id }), "Highlight deleted.");
            }}>Delete highlight</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InsightsPanel({ tenantId, projectId, data, editable, onChanged, onOpen }: { tenantId: string; projectId: string; data: Snapshot; editable: boolean; onChanged: (message?: string) => Promise<void>; onOpen: (sourceId: string, highlightId: string) => void }) {
  const [editor, setEditor] = useState<{ id: string | null; title: string; body: string; themeId: string; highlightIds: string[] } | null>(null);
  const [filter, setFilter] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeName, setThemeName] = useState("");
  const [remove, setRemove] = useState<Insight | null>(null);
  const [removeReport, setRemoveReport] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [reportDraft, setReportDraft] = useState<{ title: string; intro: string; insightIds: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightById = new Map(data.highlights.map((highlight) => [highlight.id, highlight]));
  const groups = [
    ...data.themes.map((theme) => ({ id: theme.id, name: theme.name, insights: data.insights.filter((insight) => insight.themeId === theme.id) })),
    { id: "none", name: data.themes.length ? "Not in a theme yet" : "Insights", insights: data.insights.filter((insight) => !insight.themeId || !data.themes.some((theme) => theme.id === insight.themeId)) },
  ];
  const pickable = data.highlights.filter((highlight) => {
    const needle = filter.trim().toLowerCase();
    return !needle || highlight.quote.toLowerCase().includes(needle) || highlight.tags.some((tag) => tag.includes(needle));
  });

  async function guarded(task: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await onChanged(message);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createTheme(event: FormEvent) {
    event.preventDefault();
    const ok = await guarded(() => postAction(tenantId, projectId, { type: "theme.create", name: themeName }), "Theme added.");
    if (ok) { setThemeName(""); setThemeOpen(false); }
  }

  const reports = data.reports ?? [];

  return (
    <div className="grid gap-8">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={data.highlights.length === 0} onClick={() => setEditor({ id: null, title: "", body: "", themeId: "none", highlightIds: [] })}><Lightbulb /> New insight</Button>
          <Button variant="outline" onClick={() => setThemeOpen(true)}><Plus /> Theme</Button>
          <Button variant="outline" disabled={data.insights.length === 0} onClick={() => setReportDraft({ title: "", intro: "", insightIds: [] })}><FileText /> New report</Button>
          {data.highlights.length === 0 ? <p className="text-sm text-muted-foreground">Highlight a quote first — every insight cites its evidence.</p> : null}
        </div>
      ) : null}

      {reports.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Reports</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {reports.map((report) => (
              <li key={report.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary"><FileText className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <a className="font-heading text-[17px] leading-snug font-medium break-words hover:text-primary hover:underline" href={`/apps/research/reports/${tenantId}/${projectId}/${report.id}`} target="_blank" rel="noreferrer">{report.title}</a>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <Byline uid={report.createdBy} email={report.createdByEmail} at={report.createdAt} />
                    <span>· {report.insightIds.length} {report.insightIds.length === 1 ? "insight" : "insights"}</span>
                  </span>
                </span>
                {editable ? <Button size="icon-xs" variant="ghost" aria-label={`Delete report ${report.title}`} onClick={() => setRemoveReport(report.id)}><Trash2 /></Button> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.insights.length === 0 ? (
        <EmptyState icon={Lightbulb} title="Turn highlights into insights">
          An insight is a finding your team can act on. Each one must cite at least one highlight, so anyone can open the exact words behind it.
        </EmptyState>
      ) : null}

      {groups.map((group) =>
        group.insights.length === 0 && (group.id === "none" || data.insights.length === 0) ? null : (
          <section key={group.id} className="grid gap-4">
            <div className="flex items-center gap-3 border-b border-border pb-2">
              <h2 className="brand-heading text-xl">{group.name}</h2>
              <span className="text-sm text-muted-foreground tabular-nums">{group.insights.length}</span>
              {editable && group.id !== "none" ? (
                <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => guarded(() => postAction(tenantId, projectId, { type: "theme.delete", themeId: group.id }), "Theme removed. Its insights are kept.")}>Remove theme</Button>
              ) : null}
            </div>
            {group.insights.length === 0 ? <p className="text-sm text-muted-foreground">No insights in this theme yet.</p> : null}
            {group.insights.map((insight) => (
              <article key={insight.id} className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="brand-heading text-[1.45rem] leading-snug break-words">{insight.title}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Byline uid={insight.createdBy} at={insight.updatedAt ?? insight.createdAt} size="sm" />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setHistoryFor(insight.id)}><History /> History</Button>
                    {editable ? (
                      <>
                        <Button size="xs" variant="outline" onClick={() => setEditor({ id: insight.id, title: insight.title, body: insight.body, themeId: insight.themeId ?? "none", highlightIds: insight.highlightIds.filter((id) => highlightById.has(id)) })}><Pencil /> Edit</Button>
                        <Button size="icon-xs" variant="ghost" aria-label="Delete insight" onClick={() => setRemove(insight)}><Trash2 /></Button>
                      </>
                    ) : null}
                  </div>
                </div>
                {insight.body ? <p className="max-w-3xl text-[15px] leading-relaxed whitespace-pre-wrap">{insight.body}</p> : null}
                <div className="grid gap-2">
                  <p className="text-xs font-semibold text-muted-foreground">Evidence · {insight.highlightIds.length} {insight.highlightIds.length === 1 ? "quote" : "quotes"}</p>
                  {insight.restrictedEvidence ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden="true" /> {insight.restrictedEvidence} more {insight.restrictedEvidence === 1 ? "quote is" : "quotes are"} in folders you can&apos;t open. Editing keeps them.</p> : null}
                  {insight.highlightIds.length === 0 && !insight.restrictedEvidence ? <Alert variant="destructive"><AlertDescription>The evidence for this insight was deleted. Link new highlights or remove the insight.</AlertDescription></Alert> : null}
                  <div className="grid gap-2 md:grid-cols-2">
                    {insight.highlightIds.map((id) => {
                      const highlight = highlightById.get(id);
                      return highlight ? <HighlightCard key={id} highlight={highlight} data={data} onOpen={onOpen} compact /> : null;
                    })}
                  </div>
                </div>
              </article>
            ))}
          </section>
        ),
      )}

      {historyFor ? <InsightHistoryDialog tenantId={tenantId} projectId={projectId} insightId={historyFor} onClose={() => setHistoryFor(null)} /> : null}

      <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={createTheme}>
            <DialogHeader>
              <DialogTitle>New theme</DialogTitle>
              <DialogDescription>Themes group related insights, so a reader sees the shape of what you learned.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="theme-name">Theme</Label>
              <Input id="theme-name" autoFocus value={themeName} placeholder="Price transparency" onChange={(event) => setThemeName(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setThemeOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || themeName.trim().length < 2}>Add theme</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reportDraft !== null} onOpenChange={(open) => !open && setReportDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New report</DialogTitle>
            <DialogDescription>Pick insights in the order readers should meet them. The report shows each one with its quotes, and only workspace members can open it.</DialogDescription>
          </DialogHeader>
          {reportDraft ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="report-title">Title</Label>
                <Input id="report-title" value={reportDraft.title} placeholder="What we learned about checkout" onChange={(event) => setReportDraft({ ...reportDraft, title: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="report-intro">Summary</Label>
                <Textarea id="report-intro" rows={3} value={reportDraft.intro} onChange={(event) => setReportDraft({ ...reportDraft, intro: event.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label>Insights · {reportDraft.insightIds.length} chosen</Label>
                {data.insights.map((insight) => {
                  const position = reportDraft.insightIds.indexOf(insight.id);
                  return (
                    <label key={insight.id} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        className="mt-0.5"
                        checked={position >= 0}
                        onCheckedChange={(value) => setReportDraft({ ...reportDraft, insightIds: value ? [...reportDraft.insightIds, insight.id] : reportDraft.insightIds.filter((id) => id !== insight.id) })}
                      />
                      <span className="flex-1">{insight.title}</span>
                      {position >= 0 ? <Badge variant="secondary" className="tabular-nums">{position + 1}</Badge> : null}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDraft(null)}>Cancel</Button>
            <Button disabled={busy || !reportDraft || reportDraft.title.trim().length < 3 || reportDraft.insightIds.length === 0} onClick={async () => {
              if (!reportDraft) return;
              const ok = await guarded(() => postAction(tenantId, projectId, { type: "report.create", ...reportDraft }), "Report published. Share its link with anyone in the workspace.");
              if (ok) setReportDraft(null);
            }}>Publish report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Edit insight" : "New insight"}</DialogTitle>
            <DialogDescription>Cite at least one highlight. Each citation links back to the exact words in the transcript, and every edit is kept in the history.</DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="insight-title">Headline</Label>
                <Input id="insight-title" value={editor.title} placeholder="People abandon checkout when the deposit appears late" onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="insight-body">What it means</Label>
                <Textarea id="insight-body" rows={3} value={editor.body} onChange={(event) => setEditor({ ...editor, body: event.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="insight-theme">Theme</Label>
                <Select value={editor.themeId} onValueChange={(value) => setEditor({ ...editor, themeId: value })}>
                  <SelectTrigger id="insight-theme" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No theme</SelectItem>
                    {data.themes.map((theme) => <SelectItem key={theme.id} value={theme.id}>{theme.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="evidence-filter">Evidence · {editor.highlightIds.length} chosen</Label>
                <Input id="evidence-filter" placeholder="Filter highlights by words or tag" value={filter} onChange={(event) => setFilter(event.target.value)} />
                <div className="grid max-h-72 gap-1 overflow-y-auto rounded-md border border-border p-1">
                  {pickable.map((highlight) => {
                    const checked = editor.highlightIds.includes(highlight.id);
                    return (
                      <label key={highlight.id} className={cn("flex cursor-pointer items-start gap-3 rounded-sm px-2 py-2 text-sm", checked ? "bg-secondary" : "hover:bg-muted")}>
                        <Checkbox
                          className="mt-0.5"
                          checked={checked}
                          onCheckedChange={(value) => setEditor({
                            ...editor,
                            highlightIds: value ? [...editor.highlightIds, highlight.id] : editor.highlightIds.filter((id) => id !== highlight.id),
                          })}
                        />
                        <span className="min-w-0">
                          <span className="font-heading italic">“{highlight.quote.slice(0, 180)}{highlight.quote.length > 180 ? "…" : ""}”</span>
                          <span className="block text-xs text-muted-foreground">{data.sources.find((source) => source.id === highlight.sourceId)?.title}{highlight.tags.length ? ` · #${highlight.tags.join(" #")}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                  {pickable.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">No highlights match.</p> : null}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button>
            <Button disabled={busy || !editor || editor.title.trim().length < 3 || editor.highlightIds.length === 0} onClick={async () => {
              if (!editor) return;
              const themeId = editor.themeId === "none" ? null : editor.themeId;
              const ok = await guarded(
                () => editor.id
                  ? postAction(tenantId, projectId, { type: "insight.update", insightId: editor.id, title: editor.title, body: editor.body, highlightIds: editor.highlightIds, themeId })
                  : postAction(tenantId, projectId, { type: "insight.create", title: editor.title, body: editor.body, highlightIds: editor.highlightIds, themeId }),
                editor.id ? "Insight updated." : "Insight published with its evidence.",
              );
              if (ok) setEditor(null);
            }}>{busy ? <LoaderCircle className="animate-spin" /> : null} {editor?.id ? "Save changes" : "Publish insight"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={remove !== null} onOpenChange={(open) => !open && setRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{remove?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The highlights it cites are kept. Reports that include it will skip it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (!remove) return;
              void guarded(() => postAction(tenantId, projectId, { type: "insight.delete", insightId: remove.id }), "Insight deleted.");
            }}>Delete insight</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeReport !== null} onOpenChange={(open) => !open && setRemoveReport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>Its link stops working. The insights and quotes in it are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => {
              if (!removeReport) return;
              void guarded(() => postAction(tenantId, projectId, { type: "report.delete", reportId: removeReport }), "Report deleted.");
            }}>Delete report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const RESULT_LABELS = { insight: "Insight", highlight: "Highlight", segment: "Transcript", source: "Interview" } as const;
const RESULT_ICONS = { insight: Lightbulb, highlight: Highlighter, segment: Quote, source: FileText } as const;

function SearchPanel({ tenantId, projectId, onOpen, onOpenInsight }: { tenantId: string; projectId: string; onOpen: (sourceId: string, highlightId: string | null, segmentId?: string | null) => void; onOpenInsight: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ results: SearchResult[] }>(`/api/research/tenants/${tenantId}/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
      setResults(response.results);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <form className="relative" onSubmit={submit}>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Search this project" className="h-11 pr-28 pl-10 text-base" placeholder="Search transcripts, highlights, tags and insights" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" className="absolute top-1/2 right-1.5 -translate-y-1/2" size="sm" disabled={busy || !query.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : null} Search</Button>
      </form>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {results === null ? <p className="text-center text-sm text-muted-foreground">Search runs across every interview you can open in this project, including corrected transcripts.</p> : null}
      {results && results.length === 0 ? <p className="text-center text-sm text-muted-foreground">Nothing matches “{query}”. Try fewer or different words.</p> : null}
      {results && results.length > 0 ? <p className="text-sm text-muted-foreground">{results.length} {results.length === 1 ? "result" : "results"}</p> : null}
      <ul className="grid gap-2">
        {results?.map((result) => {
          const Icon = RESULT_ICONS[result.type];
          return (
            <li key={`${result.type}-${result.id}`}>
              <button
                type="button"
                className="grid w-full gap-1.5 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
                onClick={() => {
                  if (result.type === "insight") onOpenInsight();
                  else if (result.sourceId) onOpen(result.sourceId, result.type === "highlight" ? result.id : null, result.segmentId ?? null);
                }}
              >
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  <span className="font-semibold text-foreground/80">{RESULT_LABELS[result.type]}</span>
                  <span className="truncate">· {result.title}</span>
                  {result.context ? <span className="tabular-nums">· {result.context}</span> : null}
                </span>
                <span className="text-[15px] leading-relaxed break-words">{result.snippet}</span>
                {result.tags.length ? <span className="flex flex-wrap gap-1">{result.tags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ImportPanel({ tenantId, projectId, onImported }: { tenantId: string; projectId: string; onImported: (message?: string) => Promise<void> }) {
  const [file, setFile] = useState<{ name: string; format: "csv" | "json"; content: string } | null>(null);
  const [report, setReport] = useState<{ report: MappingReport; sources?: Array<{ title: string; segments: number }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setReport(null);
    setError(null);
    if (chosen.size > 2_000_000) {
      setError("Import files are limited to 2 MB. Split the export and import each part.");
      return;
    }
    const format = chosen.name.toLowerCase().endsWith(".json") ? "json" : "csv";
    setFile({ name: chosen.name, format, content: await chosen.text() });
  }

  async function run(preview: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await postAction<{ report: MappingReport; sources?: Array<{ title: string; segments: number }> }>(tenantId, projectId, {
        type: "dovetail.import",
        format: file.format,
        content: file.content,
        preview,
      });
      setReport(result);
      if (!preview) {
        await onImported(`Imported ${result.report.mappedRows} highlights from ${file.name}. Imported interviews are marked “consent pending” until you confirm consent.`);
        setFile(null);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-5 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="brand-heading text-2xl">Bring your highlights from Dovetail</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Upload a Dovetail highlights export (CSV or JSON). You&apos;ll see how every column maps, and every row that would be skipped, before anything is written. Each Dovetail note becomes an interview and each highlight keeps its tags.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dovetail-file">Export file</Label>
        <Input id="dovetail-file" type="file" accept=".csv,.json,text/csv,application/json" onChange={choose} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!file || busy} onClick={() => run(true)}>{busy ? <LoaderCircle className="animate-spin" /> : null} Preview the mapping</Button>
        <Button disabled={!file || busy || !report || report.report.mappedRows === 0} onClick={() => run(false)}><Upload /> Import {report?.report.mappedRows ?? ""} highlights</Button>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {report ? (
        <div className="grid gap-3 rounded-md bg-brand-subtle p-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{report.report.mappedRows} of {report.report.totalRows} rows mapped</Badge>
            <Badge variant={report.report.skipped.length ? "destructive" : "outline"}>{report.report.skipped.length} skipped</Badge>
            <Badge variant="outline">{report.report.tags.length} tags</Badge>
          </div>
          <dl className="grid gap-1">
            {Object.entries(report.report.columnMap).map(([field, column]) => (
              <div key={field} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{field}</dt><dd>“{column}”</dd></div>
            ))}
          </dl>
          {report.report.unmappedColumns.length ? <p className="text-muted-foreground">Not imported: {report.report.unmappedColumns.join(", ")}</p> : null}
          {report.sources?.length ? <p>Interviews to create: {report.sources.map((source) => `${source.title} (${source.segments})`).join(", ")}</p> : null}
          {report.report.skipped.slice(0, 20).map((skip) => <p key={skip.row} className="text-muted-foreground">Row {skip.row}: {skip.reason}</p>)}
        </div>
      ) : null}
    </div>
  );
}

