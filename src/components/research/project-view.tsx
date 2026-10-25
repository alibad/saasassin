"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, Download, FileText, Lightbulb, LoaderCircle, Plus, Search, Tag, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { MappingReport } from "@/lib/research/dovetail";
import { canEdit, canManage, retentionState, tagFrequency, type Highlight, type Insight, type ProjectSnapshot, type ResearchRole } from "@/lib/research/model";
import type { SearchResult } from "@/lib/research/search";
import { formatTimestamp } from "@/lib/research/transcript";

import { api, errorMessage, postAction } from "./api";
import { AddInterviewDialog } from "./source-dialogs";
import { TranscriptView } from "./transcript-view";
import styles from "./research.module.css";

type Snapshot = ProjectSnapshot & { role: ResearchRole };
type Focus = { sourceId: string; highlightId: string | null; segmentId: string | null };

export function ProjectView({ tenantId, projectId, initialSourceId = null, onBack }: { tenantId: string; projectId: string; initialSourceId?: string | null; onBack: () => void }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState("interviews");
  const [focus, setFocus] = useState<Focus | null>(initialSourceId ? { sourceId: initialSourceId, highlightId: null, segmentId: null } : null);
  const [addOpen, setAddOpen] = useState(false);

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

  const editable = data ? canEdit(data.role) : false;
  const manageable = data ? canManage(data.role) : false;
  const sourceById = useMemo(() => new Map((data?.sources ?? []).map((source) => [source.id, source])), [data]);
  const activeSourceId = focus?.sourceId && sourceById.has(focus.sourceId) ? focus.sourceId : data?.sources[0]?.id ?? null;
  const activeSource = activeSourceId ? sourceById.get(activeSourceId) ?? null : null;

  function openEvidence(sourceId: string, highlightId: string | null, segmentId: string | null = null) {
    setFocus({ sourceId, highlightId, segmentId });
    setTab("interviews");
  }

  if (loadError && !data) {
    return (
      <div className="grid gap-3">
        <Button variant="outline" className="w-fit" onClick={onBack}><ArrowLeft /> Projects</Button>
        <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>
      </div>
    );
  }
  if (!data) {
    return <div className="grid gap-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> All projects</Button>
          <h1 className="text-2xl font-extrabold break-words">{data.project.name}</h1>
          {data.project.description ? <p className={styles.hint}>{data.project.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? <Button onClick={() => setAddOpen(true)}><Plus /> Add interview</Button> : null}
          <Button variant="outline" asChild>
            <a href={`/api/research/tenants/${tenantId}/projects/${projectId}/export`} download><Download /> Export project JSON</a>
          </Button>
        </div>
      </div>

      {!editable ? <Alert><AlertDescription>You have view access. You can read, search and export this project; changes are blocked by the server.</AlertDescription></Alert> : null}
      {notice ? <Alert><AlertDescription className="flex items-center justify-between gap-2">{notice}<Button size="xs" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button></AlertDescription></Alert> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="interviews"><FileText /> Interviews ({data.sources.length})</TabsTrigger>
          <TabsTrigger value="evidence"><Tag /> Highlights ({data.highlights.length})</TabsTrigger>
          <TabsTrigger value="insights"><Lightbulb /> Insights ({data.insights.length})</TabsTrigger>
          <TabsTrigger value="search"><Search /> Search</TabsTrigger>
          {editable ? <TabsTrigger value="import"><Upload /> Dovetail import</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="interviews" className="mt-4">
          {data.sources.length === 0 ? (
            <div className={`${styles.panel} ${styles.panelPad} grid gap-2`}>
              <h2 className="text-lg font-bold">No interviews yet</h2>
              <p className={styles.hint}>Add an interview transcript (.vtt, .srt or “Speaker: text”) with the participant’s consent and retention date.</p>
              {editable ? <Button className="w-fit" onClick={() => setAddOpen(true)}><Plus /> Add interview</Button> : null}
            </div>
          ) : (
            <div className={styles.grid2}>
              <div className={`${styles.panel} p-2 grid gap-1 content-start self-start`}>
                {data.sources.map((source) => {
                  const retention = retentionState(source.consent);
                  return (
                    <button
                      key={source.id}
                      type="button"
                      className={`${styles.sourceButton} ${source.id === activeSourceId ? styles.sourceButtonActive : ""}`}
                      onClick={() => setFocus({ sourceId: source.id, highlightId: null, segmentId: null })}
                    >
                      <strong className="block break-words">{source.title}</strong>
                      <span className={styles.hint}>{source.participant.name} · {source.segments.length} segments</span>
                      {retention === "expired" ? <Badge variant="destructive" className="mt-1">Retention expired</Badge> : null}
                      {source.consent.status === "withdrawn" ? <Badge variant="destructive" className="mt-1">Consent withdrawn</Badge> : null}
                    </button>
                  );
                })}
              </div>
              {activeSource ? (
                <TranscriptView
                  key={activeSource.id}
                  tenantId={tenantId}
                  projectId={projectId}
                  source={activeSource}
                  highlights={data.highlights.filter((highlight) => highlight.sourceId === activeSource.id)}
                  editable={editable}
                  manageable={manageable}
                  focusHighlightId={focus?.sourceId === activeSource.id ? focus.highlightId : null}
                  focusSegmentId={focus?.sourceId === activeSource.id ? focus.segmentId : null}
                  onChanged={load}
                  onDeleted={() => setFocus(null)}
                />
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidencePanel tenantId={tenantId} projectId={projectId} data={data} editable={editable} onChanged={load} onOpen={openEvidence} />
        </TabsContent>

        <TabsContent value="insights" className="mt-4">
          <InsightsPanel tenantId={tenantId} projectId={projectId} data={data} editable={editable} onChanged={load} onOpen={openEvidence} />
        </TabsContent>

        <TabsContent value="search" className="mt-4">
          <SearchPanel tenantId={tenantId} projectId={projectId} onOpen={openEvidence} onOpenInsight={() => setTab("insights")} />
        </TabsContent>

        {editable ? (
          <TabsContent value="import" className="mt-4">
            <ImportPanel tenantId={tenantId} projectId={projectId} onImported={load} />
          </TabsContent>
        ) : null}
      </Tabs>

      <AddInterviewDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        tenantId={tenantId}
        projectId={projectId}
        onCreated={async (sourceId) => {
          setAddOpen(false);
          await load("Interview added. Select text in the transcript to create highlights.");
          setFocus({ sourceId, highlightId: null, segmentId: null });
          setTab("interviews");
        }}
      />
    </div>
  );
}

function HighlightCard({ highlight, data, onOpen, children }: { highlight: Highlight; data: Snapshot; onOpen: (sourceId: string, highlightId: string) => void; children?: React.ReactNode }) {
  const source = data.sources.find((entry) => entry.id === highlight.sourceId);
  const segment = source?.segments.find((entry) => entry.id === highlight.segmentId);
  return (
    <div className={`${styles.panel} ${styles.panelPad} grid gap-2`}>
      <p className={styles.quote}>“{highlight.quote}”</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={styles.hint}>
          {segment?.speaker ?? "Unknown"} · {source?.title ?? "Deleted source"}{segment?.startMs != null ? ` @ ${formatTimestamp(segment.startMs)}` : ""} · chars {highlight.start}–{highlight.end}
        </span>
        {highlight.stale ? <Badge variant="destructive">Words changed after correction</Badge> : null}
        {highlight.redacted ? <Badge variant="outline">Contains redaction</Badge> : null}
        {highlight.tags.map((tag) => <Badge key={tag} variant="secondary">#{tag}</Badge>)}
      </div>
      {highlight.note ? <p className="text-sm">{highlight.note}</p> : null}
      <div className="flex flex-wrap gap-2">
        {source ? <Button size="xs" variant="outline" onClick={() => onOpen(highlight.sourceId, highlight.id)}>Open in transcript</Button> : null}
        {children}
      </div>
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

  return (
    <div className={styles.grid2}>
      <div className={`${styles.panel} ${styles.panelPad} grid gap-2 content-start`}>
        <h2 className="font-bold">Tags</h2>
        {frequency.length === 0 ? <p className={styles.hint}>Tags you add to highlights appear here with how often they occur.</p> : null}
        {frequency.map(({ tag, count }) => (
          <div key={tag} className="grid gap-1">
            <div className="flex items-center justify-between gap-2">
              <Button size="xs" variant={tagFilter === tag ? "default" : "ghost"} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>#{tag}</Button>
              <span className="flex items-center gap-1 text-sm">
                {count}
                {editable ? <Button size="xs" variant="ghost" onClick={() => setRename({ from: tag, to: tag })}>Rename</Button> : null}
              </span>
            </div>
            <div className={styles.freqBar} style={{ width: `${Math.max(6, (count / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="grid gap-3 content-start">
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {shown.length === 0 ? <div className={`${styles.panel} ${styles.panelPad}`}><p className={styles.hint}>No highlights yet. Open an interview and select text to create one.</p></div> : null}
        {shown.map((highlight) => (
          <HighlightCard key={highlight.id} highlight={highlight} data={data} onOpen={onOpen}>
            {editable ? <Button size="xs" variant="ghost" onClick={() => setEditTags({ highlight, tags: highlight.tags.join(", "), note: highlight.note })}><Tag /> Tags & note</Button> : null}
            {editable ? <Button size="xs" variant="ghost" onClick={() => setRemove(highlight)}><Trash2 /> Delete</Button> : null}
          </HighlightCard>
        ))}
      </div>

      <Dialog open={editTags !== null} onOpenChange={(open) => !open && setEditTags(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tags and note</DialogTitle>
            <DialogDescription>Tags are lower-cased and hyphenated so “Churn Risk” and “churn-risk” stay one tag.</DialogDescription>
          </DialogHeader>
          {editTags ? (
            <div className="grid gap-3">
              <p className={styles.quote}>“{editTags.highlight.quote}”</p>
              <div className="grid gap-1">
                <Label htmlFor="edit-tags">Tags (comma separated)</Label>
                <Input id="edit-tags" value={editTags.tags} onChange={(event) => setEditTags({ ...editTags, tags: event.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="edit-note">Note</Label>
                <Textarea id="edit-note" rows={2} value={editTags.note} onChange={(event) => setEditTags({ ...editTags, note: event.target.value })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTags(null)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (!editTags) return;
              setBusy(true);
              setError(null);
              try {
                await postAction(tenantId, projectId, {
                  type: "highlight.update",
                  highlightId: editTags.highlight.id,
                  tags: editTags.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                  note: editTags.note,
                });
                setEditTags(null);
                await onChanged("Highlight updated.");
              } catch (caught) {
                setError(errorMessage(caught));
                setEditTags(null);
              } finally {
                setBusy(false);
              }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rename !== null} onOpenChange={(open) => !open && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename or merge tag</DialogTitle>
            <DialogDescription>Renaming to an existing tag merges the two across every highlight in this project.</DialogDescription>
          </DialogHeader>
          <Input aria-label="New tag name" value={rename?.to ?? ""} onChange={(event) => rename && setRename({ ...rename, to: event.target.value })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRename(null)}>Cancel</Button>
            <Button disabled={busy || !rename?.to.trim()} onClick={async () => {
              if (!rename) return;
              setBusy(true);
              setError(null);
              try {
                await postAction(tenantId, projectId, { type: "tag.rename", from: rename.from, to: rename.to });
                setRename(null);
                setTagFilter(null);
                await onChanged("Tag renamed.");
              } catch (caught) {
                setError(errorMessage(caught));
                setRename(null);
              } finally {
                setBusy(false);
              }
            }}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={remove !== null} onOpenChange={(open) => !open && setRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this highlight?</DialogTitle>
            <DialogDescription>Insights that cite it lose this piece of evidence. The transcript is not changed.</DialogDescription>
          </DialogHeader>
          {remove ? <p className={styles.quote}>“{remove.quote}”</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => {
              if (!remove) return;
              setBusy(true);
              try {
                await postAction(tenantId, projectId, { type: "highlight.delete", highlightId: remove.id });
                setRemove(null);
                await onChanged("Highlight deleted.");
              } catch (caught) {
                setError(errorMessage(caught));
                setRemove(null);
              } finally {
                setBusy(false);
              }
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InsightsPanel({ tenantId, projectId, data, editable, onChanged, onOpen }: { tenantId: string; projectId: string; data: Snapshot; editable: boolean; onChanged: (message?: string) => Promise<void>; onOpen: (sourceId: string, highlightId: string) => void }) {
  const [editor, setEditor] = useState<{ id: string | null; title: string; body: string; themeId: string; highlightIds: string[] } | null>(null);
  const [filter, setFilter] = useState("");
  const [themeName, setThemeName] = useState("");
  const [remove, setRemove] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const highlightById = new Map(data.highlights.map((highlight) => [highlight.id, highlight]));
  const groups = [
    ...data.themes.map((theme) => ({ id: theme.id, name: theme.name, insights: data.insights.filter((insight) => insight.themeId === theme.id) })),
    { id: "none", name: data.themes.length ? "Not in a theme" : "Insights", insights: data.insights.filter((insight) => !insight.themeId || !data.themes.some((theme) => theme.id === insight.themeId)) },
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
    const ok = await guarded(() => postAction(tenantId, projectId, { type: "theme.create", name: themeName }), "Theme created.");
    if (ok) setThemeName("");
  }

  return (
    <div className="grid gap-4">
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {editable ? (
        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={data.highlights.length === 0} onClick={() => setEditor({ id: null, title: "", body: "", themeId: "none", highlightIds: [] })}><Lightbulb /> New insight</Button>
          <form className="flex flex-wrap items-end gap-2" onSubmit={createTheme}>
            <div className="grid gap-1">
              <Label htmlFor="theme-name">New theme</Label>
              <Input id="theme-name" value={themeName} placeholder="Trust in the archive" onChange={(event) => setThemeName(event.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={busy || themeName.trim().length < 2}><Plus /> Add theme</Button>
          </form>
          {data.highlights.length === 0 ? <p className={styles.hint}>Create a highlight first — every insight must cite evidence.</p> : null}
        </div>
      ) : null}

      {groups.map((group) =>
        group.insights.length === 0 && group.id === "none" && data.insights.length > 0 ? null : (
          <section key={group.id} className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <Badge variant="outline">{group.insights.length}</Badge>
              {editable && group.id !== "none" ? (
                <Button size="xs" variant="ghost" onClick={() => guarded(() => postAction(tenantId, projectId, { type: "theme.delete", themeId: group.id }), "Theme removed; its insights are kept.")}>Remove theme</Button>
              ) : null}
            </div>
            {group.insights.length === 0 ? <p className={styles.hint}>No insights in this group yet.</p> : null}
            {group.insights.map((insight) => (
              <article key={insight.id} className={`${styles.panel} ${styles.panelPad} ${styles.accentBar} grid gap-3`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-lg font-extrabold break-words">{insight.title}</h3>
                  {editable ? (
                    <div className="flex gap-1">
                      <Button size="xs" variant="outline" onClick={() => setEditor({ id: insight.id, title: insight.title, body: insight.body, themeId: insight.themeId ?? "none", highlightIds: insight.highlightIds.filter((id) => highlightById.has(id)) })}>Edit</Button>
                      <Button size="xs" variant="ghost" onClick={() => setRemove(insight)}><Trash2 /></Button>
                    </div>
                  ) : null}
                </div>
                {insight.body ? <p className="text-sm whitespace-pre-wrap">{insight.body}</p> : null}
                <div className="grid gap-2">
                  <p className={styles.eyebrow}>Evidence ({insight.highlightIds.length})</p>
                  {insight.highlightIds.length === 0 ? <Alert variant="destructive"><AlertDescription>All evidence for this insight was deleted. Link new highlights or remove the insight.</AlertDescription></Alert> : null}
                  {insight.highlightIds.map((id) => {
                    const highlight = highlightById.get(id);
                    return highlight ? <HighlightCard key={id} highlight={highlight} data={data} onOpen={onOpen} /> : null;
                  })}
                </div>
              </article>
            ))}
          </section>
        ),
      )}

      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editor?.id ? "Edit insight" : "New insight"}</DialogTitle>
            <DialogDescription>An insight must cite at least one highlight. Each citation links back to the exact words in the transcript.</DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="insight-title">Headline</Label>
                <Input id="insight-title" value={editor.title} placeholder="Teams lose quotes when researchers leave" onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="insight-body">Explanation</Label>
                <Textarea id="insight-body" rows={3} value={editor.body} onChange={(event) => setEditor({ ...editor, body: event.target.value })} />
              </div>
              <div className="grid gap-1">
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
                <Label htmlFor="evidence-filter">Evidence ({editor.highlightIds.length} selected)</Label>
                <Input id="evidence-filter" placeholder="Filter highlights by words or tag" value={filter} onChange={(event) => setFilter(event.target.value)} />
                <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
                  {pickable.map((highlight) => {
                    const checked = editor.highlightIds.includes(highlight.id);
                    return (
                      <label key={highlight.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => setEditor({
                            ...editor,
                            highlightIds: value ? [...editor.highlightIds, highlight.id] : editor.highlightIds.filter((id) => id !== highlight.id),
                          })}
                        />
                        <span>
                          “{highlight.quote.slice(0, 180)}{highlight.quote.length > 180 ? "…" : ""}”
                          <span className={`${styles.hint} block`}>{data.sources.find((source) => source.id === highlight.sourceId)?.title}{highlight.tags.length ? ` · #${highlight.tags.join(" #")}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
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
                editor.id ? "Insight updated." : "Insight published with its evidence chain.",
              );
              if (ok) setEditor(null);
            }}>{busy ? <LoaderCircle className="animate-spin" /> : null} {editor?.id ? "Save" : "Create insight"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={remove !== null} onOpenChange={(open) => !open && setRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this insight?</DialogTitle>
            <DialogDescription>The highlights it cites are kept.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy} onClick={async () => {
              if (!remove) return;
              await guarded(() => postAction(tenantId, projectId, { type: "insight.delete", insightId: remove.id }), "Insight deleted.");
              setRemove(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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

  const labels = { insight: "Insight", highlight: "Highlight", segment: "Transcript", source: "Interview" } as const;
  return (
    <div className="grid gap-3">
      <form className="flex flex-wrap gap-2" onSubmit={submit}>
        <Input aria-label="Search this project" className="min-w-0 flex-1" placeholder="Search transcripts, highlights, tags and insights" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Button type="submit" disabled={busy || !query.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Search />} Search</Button>
      </form>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {results && results.length === 0 ? <p className={styles.hint}>No matches. Try fewer or different words.</p> : null}
      {results?.map((result) => (
        <button
          key={`${result.type}-${result.id}`}
          type="button"
          className={`${styles.panel} ${styles.panelPad} grid gap-1 text-left`}
          onClick={() => {
            if (result.type === "insight") onOpenInsight();
            else if (result.sourceId) onOpen(result.sourceId, result.type === "highlight" ? result.id : null, result.segmentId ?? null);
          }}
        >
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{labels[result.type]}</Badge>
            <strong className="break-words">{result.title}</strong>
            {result.context ? <span className={styles.timestamp}>{result.context}</span> : null}
            <span className={`${styles.hint} ml-auto`}>score {result.score}</span>
          </span>
          <span className="text-sm break-words">{result.snippet}</span>
          {result.tags.length ? <span className="flex flex-wrap gap-1">{result.tags.map((tag) => <Badge key={tag} variant="outline">#{tag}</Badge>)}</span> : null}
        </button>
      ))}
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
    <div className={`${styles.panel} ${styles.panelPad} grid gap-3`}>
      <h2 className="text-lg font-bold">Import from Dovetail</h2>
      <p className={styles.hint}>Upload a Dovetail highlights export (CSV or JSON). Preview the column mapping and every skipped row before anything is written. Each Dovetail note becomes an interview; each highlight keeps its tags.</p>
      <Input type="file" accept=".csv,.json,text/csv,application/json" aria-label="Dovetail export file" onChange={choose} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!file || busy} onClick={() => run(true)}>{busy ? <LoaderCircle className="animate-spin" /> : null} Preview mapping</Button>
        <Button disabled={!file || busy || !report || report.report.mappedRows === 0} onClick={() => run(false)}><Upload /> Import {report?.report.mappedRows ?? ""} highlights</Button>
      </div>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      {report ? (
        <div className="grid gap-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{report.report.mappedRows} of {report.report.totalRows} rows mapped</Badge>
            <Badge variant={report.report.skipped.length ? "destructive" : "outline"}>{report.report.skipped.length} skipped</Badge>
            <Badge variant="outline">{report.report.tags.length} tags</Badge>
          </div>
          <p><strong>Columns:</strong> {Object.entries(report.report.columnMap).map(([field, column]) => `${field} ← “${column}”`).join(", ") || "none detected"}</p>
          {report.report.unmappedColumns.length ? <p className={styles.hint}>Not imported: {report.report.unmappedColumns.join(", ")}</p> : null}
          {report.sources?.length ? <p>Interviews to create: {report.sources.map((source) => `${source.title} (${source.segments})`).join(", ")}</p> : null}
          {report.report.skipped.slice(0, 20).map((skip) => <p key={skip.row} className={styles.hint}>Row {skip.row}: {skip.reason}</p>)}
        </div>
      ) : null}
    </div>
  );
}
