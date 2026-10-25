"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { FileUp, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_LABELS, CONSENT_STATUSES, type Consent, type ConsentStatus, type Participant, type Source } from "@/lib/research/model";
import { formatTimestamp, parseTranscript, type TranscriptFormat } from "@/lib/research/transcript";

import { errorMessage, postAction } from "./api";
import styles from "./research.module.css";

const emptyParticipant: Participant = { name: "", email: "", company: "" };
const emptyConsent: Consent = { status: "granted", capturedOn: new Date().toISOString().slice(0, 10), retentionUntil: "", notes: "" };

function ParticipantConsentFields({
  participant,
  consent,
  onParticipant,
  onConsent,
}: {
  participant: Participant;
  consent: Consent;
  onParticipant: (value: Participant) => void;
  onConsent: (value: Consent) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1">
        <Label htmlFor="participant-name">Participant (name or pseudonym)</Label>
        <Input id="participant-name" value={participant.name} onChange={(event) => onParticipant({ ...participant, name: event.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="participant-company">Company / segment</Label>
        <Input id="participant-company" value={participant.company} onChange={(event) => onParticipant({ ...participant, company: event.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="participant-email">Participant email (optional)</Label>
        <Input id="participant-email" type="email" value={participant.email} onChange={(event) => onParticipant({ ...participant, email: event.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="consent-status">Consent</Label>
        <Select value={consent.status} onValueChange={(value) => onConsent({ ...consent, status: value as ConsentStatus })}>
          <SelectTrigger id="consent-status" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONSENT_STATUSES.map((status) => <SelectItem key={status} value={status}>{CONSENT_LABELS[status]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="consent-captured">Consent captured on</Label>
        <Input id="consent-captured" type="date" value={consent.capturedOn} onChange={(event) => onConsent({ ...consent, capturedOn: event.target.value })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="consent-retention">Retain until</Label>
        <Input id="consent-retention" type="date" value={consent.retentionUntil} onChange={(event) => onConsent({ ...consent, retentionUntil: event.target.value })} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="consent-notes">Consent notes</Label>
        <Input id="consent-notes" placeholder="Recording + quotes in internal reports; no external use" value={consent.notes} onChange={(event) => onConsent({ ...consent, notes: event.target.value })} />
      </div>
    </div>
  );
}

export function AddInterviewDialog({
  open,
  onOpenChange,
  tenantId,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  onCreated: (sourceId: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<TranscriptFormat | "auto">("auto");
  const [participant, setParticipant] = useState<Participant>(emptyParticipant);
  const [consent, setConsent] = useState<Consent>(emptyConsent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!content.trim()) return null;
    try {
      return { ok: true as const, ...parseTranscript(content, format) };
    } catch (caught) {
      return { ok: false as const, error: errorMessage(caught) };
    }
  }, [content, format]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) {
      setError("That file is larger than 400 KB of text. Split the transcript and upload each part.");
      return;
    }
    setError(null);
    setContent(await file.text());
    setFileName(file.name);
    if (!title) setTitle(file.name.replace(/\.(vtt|srt|txt|md)$/i, "").replace(/[-_]+/g, " "));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await postAction<{ sourceId: string }>(tenantId, projectId, {
        type: "source.create",
        title,
        fileName,
        format,
        content,
        participant,
        consent,
      });
      setTitle("");
      setContent("");
      setFileName("");
      setParticipant(emptyParticipant);
      setConsent(emptyConsent);
      await onCreated(result.sourceId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add an interview</DialogTitle>
          <DialogDescription>Upload a .vtt, .srt or .txt transcript, or paste one. The file is read in your browser; only its text is stored in this workspace.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor="interview-title">Interview title</Label>
            <Input id="interview-title" value={title} placeholder="Onboarding interview — Maya, Acme" onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <div className="grid gap-1">
              <Label htmlFor="interview-file">Transcript file</Label>
              <Input id="interview-file" type="file" accept=".vtt,.srt,.txt,.md,text/plain,text/vtt" onChange={readFile} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="interview-format">Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as TranscriptFormat | "auto")}>
                <SelectTrigger id="interview-format" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Detect automatically</SelectItem>
                  <SelectItem value="vtt">WebVTT (.vtt)</SelectItem>
                  <SelectItem value="srt">SubRip (.srt)</SelectItem>
                  <SelectItem value="plain">Plain “Speaker: text”</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="interview-content">Transcript text</Label>
            <Textarea id="interview-content" rows={7} className={styles.mono} placeholder={"Interviewer: How do you store research today?\nMaya: In a spreadsheet nobody trusts."} value={content} onChange={(event) => setContent(event.target.value)} />
          </div>
          {preview ? (
            preview.ok ? (
              <div className={`${styles.panel} ${styles.panelPad} grid gap-2`}>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary"><FileUp /> {preview.format.toUpperCase()}</Badge>
                  <Badge variant="outline">{preview.segments.length} segments</Badge>
                  <Badge variant="outline">{preview.speakers.length} speakers: {preview.speakers.slice(0, 4).join(", ")}{preview.speakers.length > 4 ? "…" : ""}</Badge>
                </div>
                {preview.segments.slice(0, 3).map((segment) => (
                  <p key={segment.id} className="text-sm"><strong>{segment.speaker}</strong> <span className={styles.timestamp}>{formatTimestamp(segment.startMs)}</span> {segment.text.slice(0, 140)}{segment.text.length > 140 ? "…" : ""}</p>
                ))}
                {preview.warnings.map((warning) => <p key={warning} className={styles.hint}>{warning}</p>)}
              </div>
            ) : (
              <Alert variant="destructive"><AlertDescription>{preview.error}</AlertDescription></Alert>
            )
          ) : null}
          <ParticipantConsentFields participant={participant} consent={consent} onParticipant={setParticipant} onConsent={setConsent} />
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy || !preview?.ok || preview.segments.length === 0 || title.trim().length < 2 || !participant.name.trim()} onClick={submit}>
            {busy ? <LoaderCircle className="animate-spin" /> : null} Add interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SourceDetailsDialog({
  open,
  onOpenChange,
  tenantId,
  projectId,
  source,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  projectId: string;
  source: Source;
  onSaved: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState(source.title);
  const [participant, setParticipant] = useState<Participant>(source.participant);
  const [consent, setConsent] = useState<Consent>(source.consent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Interview details & consent</DialogTitle>
          <DialogDescription>Consent and retention changes are recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="details-title">Title</Label>
            <Input id="details-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <ParticipantConsentFields participant={participant} consent={consent} onParticipant={setParticipant} onConsent={setConsent} />
          {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await postAction(tenantId, projectId, { type: "source.updateMeta", sourceId: source.id, title, participant, consent });
              await onSaved();
            } catch (caught) {
              setError(errorMessage(caught));
            } finally {
              setBusy(false);
            }
          }}>{busy ? <LoaderCircle className="animate-spin" /> : null} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
