"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FileUp, Handshake, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { PersonAvatar, usePeople } from "./people";
import { EmptyState, Panel, PanelHeader } from "./ui";

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
  onAddDeal,
}: {
  workspace: Workspace;
  defaultDealId?: string;
  onLogged: (callId: string) => void;
  onAddDeal?: () => void;
}) {
  const people = usePeople();
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
      return { parsed: null, analysis: null, error: err instanceof TranscriptParseError ? err.message : "This transcript couldn't be read." };
    }
  }, [transcript, workspace.trackers]);

  const speakers = preview?.parsed?.speakers ?? [];
  const effectiveSpeaker = speakers.includes(repSpeaker) ? repSpeaker : NO_SPEAKER;
  const consentComplete = jurisdiction.trim().length >= 2 && Boolean(basis) && allParty;
  const ready = Boolean(dealId && title.trim().length >= 2 && preview?.parsed && consentComplete && repEmail);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 400_000) {
      setError("Transcript files can be up to 400 KB of text.");
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
      setError("Record where the call took place, how consent was given, and confirm every participant agreed.");
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
      setError(err instanceof Error ? err.message : "The call wasn't logged. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!workspace.deals.length) {
    return (
      <EmptyState icon={Handshake} title="Add the deal this call belongs to" action={onAddDeal ? <Button onClick={onAddDeal}>Go to deals</Button> : null}>
        Every call is logged against a deal, so its talk ratio, next steps and risks land in the right place.
      </EmptyState>
    );
  }

  return (
    <form className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]" onSubmit={submit}>
      <Panel>
        <PanelHeader title="The call" description="VTT, SRT, or one “Speaker: text” line per turn. Audio is never uploaded." />
        <div className="grid gap-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Deal</Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger aria-label="Deal" className="w-full"><SelectValue placeholder="Choose a deal" /></SelectTrigger>
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
                <SelectTrigger aria-label="Rep" className="w-full"><SelectValue placeholder="Choose the rep" /></SelectTrigger>
                <SelectContent>
                  {workspace.members.map((member) => (
                    <SelectItem key={member.uid} value={member.email}><PersonAvatar email={member.email} size="xs" /> {people.name(member.email)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="call-transcript">Transcript</Label>
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted focus-within:ring-3 focus-within:ring-ring/50">
                <FileUp className="size-4" aria-hidden="true" />
                {fileName ?? "Upload .vtt, .srt or .txt"}
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
              className="min-h-64 font-mono text-xs"
            />
          </div>
          {preview?.error ? (
            <Alert variant="destructive">
              <AlertTitle>We couldn&apos;t read this transcript</AlertTitle>
              <AlertDescription>{preview.error}</AlertDescription>
            </Alert>
          ) : null}
          {preview?.parsed ? (
            <div className="grid gap-2">
              <Label>Which speaker is the rep?</Label>
              <Select value={effectiveSpeaker} onValueChange={setRepSpeaker}>
                <SelectTrigger aria-label="Rep speaker" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SPEAKER}>Not identified</SelectItem>
                  {speakers.map((speaker) => (
                    <SelectItem key={speaker} value={speaker}>{speaker}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Used for the rep&apos;s talk ratio and monologue in Insights.</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <div className="grid content-start gap-6">
        <Panel>
          <PanelHeader title="Recording consent" icon={ShieldCheck} description="Required for every call. Revenue keeps what you record here; it doesn't decide whether a recording was lawful where you are." />
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="grid gap-2">
              <Label htmlFor="consent-jurisdiction">Where the call took place</Label>
              <Input id="consent-jurisdiction" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="e.g. US-CA, DE, UK" maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label>How consent was given</Label>
              <RadioGroup value={basis} onValueChange={setBasis} className="grid gap-2">
                {CONSENT_BASES.map((value) => (
                  <label key={value} className="flex items-start gap-2 text-sm">
                    <RadioGroupItem value={value} className="mt-0.5" />
                    <span>{CONSENT_BASIS_LABELS[value]}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border bg-brand-subtle p-3 text-sm font-medium">
              <Checkbox checked={allParty} onCheckedChange={(value) => setAllParty(value === true)} className="mt-0.5" />
              Every participant on this call agreed to it being recorded and transcribed.
            </label>
            <div className="grid gap-2">
              <Label htmlFor="consent-notes">Notes (optional)</Label>
              <Input id="consent-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where the consent is evidenced" maxLength={500} />
            </div>
          </div>
        </Panel>

        {preview?.analysis && preview.parsed ? (
          <Panel>
            <PanelHeader title="Preview" icon={Sparkles} description="Calculated in your browser; recalculated when you save." />
            <div className="grid gap-3 p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["Length", formatTimestamp(preview.analysis.durationSeconds)],
                  ["Questions", String(preview.analysis.questionCount)],
                  ["Next steps", String(preview.analysis.nextSteps.length)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted p-2">
                    <p className="brand-heading text-lg tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {preview.parsed.timingEstimated ? <p className="text-xs text-muted-foreground">No timestamps found, so timing is estimated at 150 words a minute.</p> : null}
              <ul className="grid gap-2">
                {preview.analysis.speakers.map((speaker) => (
                  <li key={speaker.speaker} className="grid gap-1 text-sm">
                    <span className="flex justify-between gap-2"><span className="truncate">{speaker.speaker}</span><span className="tabular-nums">{percent(speaker.talkRatio)}</span></span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${speaker.talkRatio * 100}%` }} /></span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>The call wasn&apos;t logged</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" size="lg" className="h-10" disabled={!ready || pending}>
          {pending ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}
          Log call
        </Button>
        {!consentComplete ? <p className="-mt-3 text-xs text-muted-foreground">Complete the consent record to log the call.</p> : null}
      </div>
    </form>
  );
}
