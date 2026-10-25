"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FileUp, LoaderCircle, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { analyzeCall } from "@/lib/revenue/analysis";
import { CONSENT_BASES, CONSENT_BASIS_LABELS } from "@/lib/revenue/schemas";
import { formatTimestamp, parseTranscript, TranscriptParseError } from "@/lib/revenue/transcript";

import { api, percent, type Workspace } from "./client";
import styles from "./revenue.module.css";

const NO_SPEAKER = "__none__";

function localNow() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

export function LogCallForm({
  workspace,
  defaultDealId,
  onLogged,
}: {
  workspace: Workspace;
  defaultDealId?: string;
  onLogged: (callId: string) => void;
}) {
  const [dealId, setDealId] = useState(defaultDealId ?? "");
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(localNow);
  const [repEmail, setRepEmail] = useState(workspace.user.email);
  const [repSpeaker, setRepSpeaker] = useState(NO_SPEAKER);
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState("");
  const [basis, setBasis] = useState<string>("");
  const [allParty, setAllParty] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!transcript.trim()) return null;
    try {
      const parsed = parseTranscript(transcript);
      const trackers = workspace.trackers.map(({ id, name, kind, keywords }) => ({ id, name, kind, keywords }));
      return { parsed, analysis: analyzeCall(parsed.segments, trackers), error: null };
    } catch (err) {
      return { parsed: null, analysis: null, error: err instanceof TranscriptParseError ? err.message : "This transcript could not be read." };
    }
  }, [transcript, workspace.trackers]);

  const speakers = preview?.parsed?.speakers ?? [];
  const effectiveSpeaker = speakers.includes(repSpeaker) ? repSpeaker : NO_SPEAKER;
  const consentComplete = jurisdiction.trim().length >= 2 && Boolean(basis) && allParty;
  const ready = Boolean(dealId && title.trim().length >= 2 && preview?.parsed && consentComplete && repEmail);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000) {
      setError("Transcript files are limited to 400 KB of text.");
      return;
    }
    setFileName(file.name);
    setTranscript(await file.text());
    if (!title) setTitle(file.name.replace(/\.(vtt|srt|txt)$/i, ""));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!consentComplete) {
      setError("Record the jurisdiction, how consent was obtained, and confirm every participant consented.");
      return;
    }
    setPending(true);
    try {
      const result = await api<{ id: string }>(`/api/revenue/tenants/${workspace.tenant.id}/calls`, {
        method: "POST",
        body: JSON.stringify({
          dealId,
          title,
          occurredAt: new Date(occurredAt).toISOString(),
          repEmail,
          repSpeaker: effectiveSpeaker === NO_SPEAKER ? null : effectiveSpeaker,
          format: "auto",
          transcript,
          consent: { jurisdiction, basis, allPartyConfirmed: allParty, notes },
        }),
      });
      onLogged(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The call could not be logged.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.deals.length) {
    return (
      <Alert>
        <AlertTitle>Create a deal first</AlertTitle>
        <AlertDescription>Calls are always logged against a deal. Add an account and a deal on the Deals tab.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" onSubmit={submit}>
      <div className={`${styles.panel} grid gap-4 p-4 sm:p-6`}>
        <div>
          <p className={styles.eyebrow}>1 · Call</p>
          <h2 className="mt-1 text-xl font-bold">Log a call from a transcript</h2>
          <p className="text-sm text-[#5f5c56]">WebVTT, SRT, or one &quot;Speaker: text&quot; line per turn. Revenue never records or processes audio.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Deal</Label>
            <Select value={dealId} onValueChange={setDealId}>
              <SelectTrigger aria-label="Deal"><SelectValue placeholder="Choose a deal" /></SelectTrigger>
              <SelectContent>
                {workspace.deals.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>{deal.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="call-title">Title</Label>
            <Input id="call-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Discovery with Acme" maxLength={160} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="call-when">When</Label>
            <Input id="call-when" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Rep</Label>
            <Select value={repEmail} onValueChange={setRepEmail}>
              <SelectTrigger aria-label="Rep"><SelectValue placeholder="Choose the rep" /></SelectTrigger>
              <SelectContent>
                {workspace.members.map((member) => (
                  <SelectItem key={member.uid} value={member.email}>{member.name || member.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="call-transcript">Transcript</Label>
            <label className="inline-flex cursor-pointer items-center gap-2 border border-[#171715] bg-white px-3 py-1.5 text-sm font-semibold">
              <FileUp className="size-4" aria-hidden="true" />
              {fileName ?? "Upload .vtt / .srt / .txt"}
              <input
                type="file"
                accept=".vtt,.srt,.txt,text/vtt,text/plain,application/x-subrip"
                className="sr-only"
                onChange={(event) => void onFile(event.target.files?.[0])}
              />
            </label>
          </div>
          <Textarea
            id="call-transcript"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setFileName(null);
            }}
            placeholder={"[00:00] Ana (Rep): Thanks for joining. What prompted the evaluation?\n[00:12] Ben (Acme): Our pricing review flagged the renewal..."}
            className="min-h-56 font-mono text-xs"
          />
        </div>
        {preview?.error ? (
          <Alert variant="destructive">
            <AlertTitle>Transcript not readable</AlertTitle>
            <AlertDescription>{preview.error}</AlertDescription>
          </Alert>
        ) : null}
        {preview?.parsed ? (
          <div className="grid gap-2">
            <Label>Which speaker is the rep?</Label>
            <Select value={effectiveSpeaker} onValueChange={setRepSpeaker}>
              <SelectTrigger aria-label="Rep speaker"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SPEAKER}>Not identified</SelectItem>
                {speakers.map((speaker) => (
                  <SelectItem key={speaker} value={speaker}>{speaker}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-[#5f5c56]">Used for the rep&apos;s talk ratio and monologue on the team dashboard.</p>
          </div>
        ) : null}
      </div>

      <div className="grid content-start gap-6">
        <div className={`${styles.panel} grid gap-4 p-4 sm:p-6`}>
          <div>
            <p className={styles.eyebrow}>2 · Recording consent (required)</p>
            <h2 className="mt-1 flex items-center gap-2 text-xl font-bold"><ShieldCheck className="size-5" aria-hidden="true" /> Consent record</h2>
            <p className="text-sm text-[#5f5c56]">
              The server refuses transcripts without this record. Revenue stores what you attest; it does not decide whether a recording was lawful in your jurisdiction.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="consent-jurisdiction">Jurisdiction</Label>
            <Input id="consent-jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="e.g. US-CA, DE, UK" maxLength={80} />
          </div>
          <div className="grid gap-2">
            <Label>How consent was obtained</Label>
            <RadioGroup value={basis} onValueChange={setBasis} className="grid gap-2">
              {CONSENT_BASES.map((value) => (
                <label key={value} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={value} className="mt-0.5" />
                  <span>{CONSENT_BASIS_LABELS[value]}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <label className="flex items-start gap-2 border border-[#171715] bg-white p-3 text-sm font-semibold">
            <Checkbox checked={allParty} onCheckedChange={(value) => setAllParty(value === true)} className="mt-0.5" />
            I confirm every participant on this call consented to it being recorded and transcribed.
          </label>
          <div className="grid gap-2">
            <Label htmlFor="consent-notes">Notes (optional)</Label>
            <Input id="consent-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where consent is evidenced" maxLength={500} />
          </div>
        </div>

        {preview?.analysis && preview.parsed ? (
          <div className={`${styles.panel} grid gap-3 p-4 sm:p-6`}>
            <p className={styles.eyebrow}>Preview · computed in your browser, recomputed on save</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{preview.parsed.format.toUpperCase()}</Badge>
              <Badge variant="outline">{preview.parsed.segments.length} segments</Badge>
              <Badge variant="outline">{formatTimestamp(preview.analysis.durationSeconds)} long</Badge>
              <Badge variant="outline">{preview.analysis.questionCount} questions</Badge>
              <Badge variant="outline">{preview.analysis.nextSteps.length} next steps</Badge>
            </div>
            {preview.parsed.timingEstimated ? (
              <p className="text-xs text-[#5f5c56]">No timestamps found: timing is estimated at 150 words per minute.</p>
            ) : null}
            <ul className="grid gap-1 text-sm">
              {preview.analysis.speakers.map((speaker) => (
                <li key={speaker.speaker} className="flex justify-between gap-2">
                  <span className="truncate">{speaker.speaker}</span>
                  <span className={styles.mono}>{percent(speaker.talkRatio)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" disabled={!ready || pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
          Log consented call
        </Button>
        {!consentComplete ? <p className="text-xs text-[#5f5c56]">Complete the consent record to enable logging.</p> : null}
      </div>
    </form>
  );
}
