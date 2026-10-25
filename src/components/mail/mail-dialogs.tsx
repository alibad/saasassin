"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { CircleAlert, FileUp, LoaderCircle, Save, Send, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { splitMailFile } from "@/lib/mail/mime";

import { api, ApiError, tenantPath, type Draft, type ImportRun, type Template } from "./mail-api";

/* ---------- date presets ---------- */

function at(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(hours, 0, 0, 0);
  return next;
}

export function datePresets(now = new Date()) {
  const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const tomorrow = at(new Date(now.getTime() + 24 * 60 * 60 * 1000), 8);
  const inThreeDays = at(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), 8);
  const nextMonday = at(new Date(now.getTime() + (((8 - now.getDay()) % 7 || 7) * 24 * 60 * 60 * 1000)), 8);
  return [
    { label: "Later today", hint: "in 3 hours", date: laterToday },
    { label: "Tomorrow", hint: "8:00", date: tomorrow },
    { label: "In 3 days", hint: "8:00", date: inThreeDays },
    { label: "Next week", hint: "Monday 8:00", date: nextMonday },
  ];
}

function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ---------- snooze / follow-up ---------- */

export function DateActionDialog({
  open,
  mode,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  mode: "snooze" | "remind";
  onOpenChange: (open: boolean) => void;
  onPick: (iso: string) => void;
}) {
  const [custom, setCustom] = useState(() => toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [error, setError] = useState("");
  const presets = datePresets();
  const title = mode === "snooze" ? "Snooze until" : "Remind me if nobody replies by";
  const description =
    mode === "snooze"
      ? "The thread leaves your inbox and comes back at this time. New mail in the thread brings it back sooner."
      : "If no new message arrives in this thread by then, it returns to your inbox marked Follow up.";

  function submitCustom() {
    const parsed = new Date(custom);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setError("Pick a time in the future.");
      return;
    }
    onPick(parsed.toISOString());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.tagName === "INPUT") return;
          const preset = presets[Number(event.key) - 1];
          if (preset) {
            event.preventDefault();
            onPick(preset.date.toISOString());
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {presets.map((preset, index) => (
            <Button key={preset.label} variant="outline" className="justify-between" onClick={() => onPick(preset.date.toISOString())}>
              <span>
                <kbd className="mr-2 text-xs text-muted-foreground">{index + 1}</kbd>
                {preset.label}
              </span>
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mail-date-custom">Custom date and time</Label>
          <div className="flex gap-2">
            <Input id="mail-date-custom" type="datetime-local" value={custom} onChange={(event) => { setCustom(event.target.value); setError(""); }} />
            <Button onClick={submitCustom}>Set</Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- labels ---------- */

export function LabelDialog({
  open,
  onOpenChange,
  current,
  known,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string[];
  known: string[];
  onToggle: (label: string, value: boolean) => void;
}) {
  const [name, setName] = useState("");
  const options = [...new Set([...known, ...current])].sort((a, b) => a.localeCompare(b));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>Labels are stored with the thread in this workspace and can drive a split.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const label = name.trim();
            if (!label) return;
            onToggle(label, true);
            setName("");
          }}
        >
          <Input aria-label="New label" placeholder="New label" maxLength={40} value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          <Button type="submit">Add</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {options.length === 0 ? <p className="text-sm text-muted-foreground">No labels yet.</p> : null}
          {options.map((label) => {
            const active = current.includes(label);
            return (
              <Button key={label} size="sm" variant={active ? "default" : "outline"} aria-pressed={active} onClick={() => onToggle(label, !active)}>
                {label}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- trash confirmation ---------- */

export function TrashDialog({ open, subject, onOpenChange, onConfirm }: { open: boolean; subject: string; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move this thread to Trash?</DialogTitle>
          <DialogDescription>
            &ldquo;{subject || "(no subject)"}&rdquo; leaves every view except Trash. You can restore it from Trash or press <kbd>z</kbd> to undo.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" autoFocus onClick={onConfirm}><Trash2 /> Move to Trash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- shortcuts ---------- */

export const SHORTCUTS: Array<[string, string]> = [
  ["j / k", "Next / previous thread"],
  ["Enter or o", "Open thread"],
  ["Esc", "Back to the list"],
  ["e", "Archive (Done) · restore in Done/Trash"],
  ["#", "Trash (asks to confirm)"],
  ["s", "Star / unstar"],
  ["u", "Mark read / unread"],
  ["h", "Snooze"],
  ["f", "Follow up if no reply"],
  ["l", "Labels"],
  ["r", "Reply draft"],
  ["c", "Compose"],
  ["z", "Undo last action"],
  ["/", "Search"],
  ["Tab / Shift+Tab", "Next / previous split"],
  ["g then i, s, n, d, a, t", "Go to Inbox, Starred, Snoozed, Drafts, Done, Trash"],
  ["⌘/Ctrl + Enter", "Save draft and try to send"],
  ["?", "This sheet"],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Every triage action works without the mouse.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt><kbd className="rounded border px-1.5 py-0.5 font-mono text-xs">{keys}</kbd></dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- compose ---------- */

export type ComposeSeed = Omit<Draft, "id" | "status" | "updatedAt"> & { id?: string; status?: string };

export function ComposeDialog({
  open,
  seed,
  tenantId,
  templates,
  readOnly,
  onOpenChange,
  onSaved,
  onDiscarded,
}: {
  open: boolean;
  seed: ComposeSeed | null;
  tenantId: string;
  templates: Template[];
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (draft: Draft) => void;
  onDiscarded: (draftId: string) => void;
}) {
  const [form, setForm] = useState<ComposeSeed>(seed ?? { threadId: null, to: "", cc: "", subject: "", body: "" });
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<"save" | "send" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [sendBlocked, setSendBlocked] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function update(field: "to" | "cc" | "subject" | "body") {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
      setDirty(true);
    };
  }

  async function save(): Promise<Draft | null> {
    setError("");
    try {
      const { draft } = await api<{ draft: Draft }>(tenantPath(tenantId, "/drafts"), {
        method: "POST",
        json: { id: form.id, threadId: form.threadId, to: form.to, cc: form.cc, subject: form.subject, body: form.body },
      });
      setForm((current) => ({ ...current, id: draft.id }));
      setDirty(false);
      onSaved(draft);
      return draft;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be saved.");
      return null;
    }
  }

  async function handleSave() {
    setPending("save");
    await save();
    setPending(null);
  }

  async function handleSend() {
    setPending("send");
    setSendBlocked("");
    const draft = await save();
    if (draft) {
      try {
        await api(tenantPath(tenantId, `/drafts/${draft.id}/send`), { method: "POST" });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 409) {
          setSendBlocked(caught.message);
          onSaved({ ...draft, status: "send_blocked" });
        } else setError(caught instanceof Error ? caught.message : "Sending failed.");
      }
    }
    setPending(null);
  }

  async function handleDiscard() {
    if (!form.id) {
      onOpenChange(false);
      return;
    }
    setPending("discard");
    try {
      await api(tenantPath(tenantId, `/drafts/${form.id}`), { method: "DELETE" });
      onDiscarded(form.id);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The draft could not be discarded.");
    }
    setPending(null);
  }

  async function close(next: boolean) {
    if (!next && dirty && !readOnly && (form.body.trim() || form.subject.trim() || form.to.trim())) await save();
    onOpenChange(next);
  }

  function insertTemplate(template: Template) {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? form.body.length;
    const end = textarea?.selectionEnd ?? form.body.length;
    setForm((current) => ({ ...current, body: `${current.body.slice(0, start)}${template.body}${current.body.slice(end)}` }));
    setDirty(true);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void close(next)}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !readOnly) {
            event.preventDefault();
            void handleSend();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{form.threadId ? "Reply" : "New message"}</DialogTitle>
          <DialogDescription>Drafts are saved to this workspace. Sending needs a connected provider.</DialogDescription>
        </DialogHeader>
        {readOnly ? (
          <Alert><CircleAlert /><AlertTitle>Read-only role</AlertTitle><AlertDescription>Viewers can read drafts but not change them.</AlertDescription></Alert>
        ) : null}
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="mail-to">To</Label>
            <Input id="mail-to" value={form.to} onChange={update("to")} placeholder="name@example.com, …" disabled={readOnly} autoFocus={!form.threadId} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mail-cc">Cc</Label>
            <Input id="mail-cc" value={form.cc} onChange={update("cc")} disabled={readOnly} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mail-subject">Subject</Label>
            <Input id="mail-subject" value={form.subject} onChange={update("subject")} disabled={readOnly} />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="mail-body">Message</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={readOnly || templates.length === 0}>Insert snippet</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {templates.map((template) => (
                    <DropdownMenuItem key={template.id} onSelect={() => insertTemplate(template)}>{template.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Textarea id="mail-body" ref={bodyRef} value={form.body} onChange={update("body")} rows={10} disabled={readOnly} autoFocus={Boolean(form.threadId)} />
          </div>
        </div>
        {sendBlocked ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>Not sent</AlertTitle>
            <AlertDescription>{sendBlocked}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive"><CircleAlert /><AlertTitle>Something went wrong</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
        ) : null}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => void handleDiscard()} disabled={readOnly || pending !== null}>
            {pending === "discard" ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Discard
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleSave()} disabled={readOnly || pending !== null}>
              {pending === "save" ? <LoaderCircle className="animate-spin" /> : <Save />} Save draft
            </Button>
            <Button onClick={() => void handleSend()} disabled={readOnly || pending !== null}>
              {pending === "send" ? <LoaderCircle className="animate-spin" /> : <Send />} Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- import ---------- */

const BATCH_CHARS = 2_500_000;
const BATCH_MESSAGES = 150;

export function ImportDialog({
  open,
  tenantId,
  readOnly,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  tenantId: string;
  readOnly: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ImportRun[]>([]);
  const [error, setError] = useState("");

  async function run() {
    setError("");
    setResults([]);
    try {
      const batches: Array<{ fileName: string; messages: string[] }> = [];
      for (const file of files) {
        const messages = splitMailFile(file.name, await file.text());
        let current: string[] = [];
        let size = 0;
        for (const message of messages) {
          if (message.length > 3_000_000) continue;
          if (current.length && (size + message.length > BATCH_CHARS || current.length >= BATCH_MESSAGES)) {
            batches.push({ fileName: file.name, messages: current });
            current = [];
            size = 0;
          }
          current.push(message);
          size += message.length;
        }
        if (current.length) batches.push({ fileName: file.name, messages: current });
      }
      if (!batches.length) {
        setError("No messages were found in those files. Choose .eml files or an .mbox export.");
        return;
      }
      const total = batches.reduce((sum, batch) => sum + batch.messages.length, 0);
      let done = 0;
      setProgress({ done, total });
      for (const batch of batches) {
        const { run: result } = await api<{ run: ImportRun }>(tenantPath(tenantId, "/import"), { method: "POST", json: batch });
        done += batch.messages.length;
        setProgress({ done, total });
        setResults((current) => [...current, result]);
      }
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
      onImported();
    }
  }

  const totals = results.reduce(
    (sum, result) => ({ imported: sum.imported + result.imported, duplicates: sum.duplicates + result.duplicates, failed: sum.failed + result.failed }),
    { imported: 0, duplicates: 0, failed: 0 },
  );
  const running = progress !== null && progress.done < progress.total && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import mail</DialogTitle>
          <DialogDescription>
            Upload .eml files or an .mbox export (Gmail Takeout, Thunderbird, Apple Mail). Messages are parsed, threaded and stored in this workspace only. Re-importing the same messages is safe: duplicates are skipped by Message-ID.
          </DialogDescription>
        </DialogHeader>
        {readOnly ? (
          <Alert><CircleAlert /><AlertTitle>Read-only role</AlertTitle><AlertDescription>Ask an owner or admin for member access to import mail.</AlertDescription></Alert>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="mail-import-files">Files</Label>
            <Input
              id="mail-import-files"
              type="file"
              multiple
              accept=".eml,.mbox,.txt,message/rfc822,application/mbox"
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              disabled={running}
            />
            {files.length ? (
              <p className="text-sm text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"} · {(files.reduce((sum, file) => sum + file.size, 0) / 1024).toFixed(0)} KB
              </p>
            ) : null}
          </div>
        )}
        {progress ? (
          <div className="grid gap-1">
            <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
            <p className="text-sm text-muted-foreground">{progress.done} of {progress.total} messages processed</p>
          </div>
        ) : null}
        {results.length ? (
          <div className="flex flex-wrap gap-2" aria-live="polite">
            <Badge>{totals.imported} imported</Badge>
            <Badge variant="outline">{totals.duplicates} duplicates skipped</Badge>
            {totals.failed ? <Badge variant="destructive">{totals.failed} could not be parsed</Badge> : null}
          </div>
        ) : null}
        {error ? <Alert variant="destructive"><CircleAlert /><AlertTitle>Import stopped</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => void run()} disabled={readOnly || !files.length || running}>
            {running ? <LoaderCircle className="animate-spin" /> : <FileUp />} Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
