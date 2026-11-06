"use client";

import { useState } from "react";
import { CircleCheck, Eye, Flag, LoaderCircle, Quote, ShieldOff } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { describeAnswer } from "@/lib/studies/analysis";
import type { SessionSummary } from "@/lib/studies/data";
import { blockTitle, type Block } from "@/lib/studies/model";
import { QUALITY_FLAG_LABELS } from "@/lib/studies/quality";

import { panel, seconds } from "./results-view";

type Filter = "all" | "flagged" | "excluded";

export type EvidenceDraft = { kind: "response"; responseId: string; blockId: string } | { kind: "block"; blockId: string };

/** Session list with quality flags, audited exclude/keep decisions and a raw-answer viewer. */
export function SessionsPanel({
  sessions,
  blocks,
  canEdit,
  onDecide,
  onCite,
}: {
  sessions: SessionSummary[];
  blocks: Block[];
  canEdit: boolean;
  onDecide: (responseId: string, excluded: boolean, reason: string) => Promise<void>;
  onCite?: (evidence: EvidenceDraft) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<SessionSummary | null>(null);
  const [excluding, setExcluding] = useState<SessionSummary | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const flagged = sessions.filter((session) => session.flags.length > 0);
  const excluded = sessions.filter((session) => session.excluded);
  const shown = filter === "flagged" ? flagged : filter === "excluded" ? excluded : sessions;

  async function decide(session: SessionSummary, exclude: boolean, why: string) {
    setBusy(session.id);
    setError("");
    try {
      await onDecide(session.id, exclude, why);
      setExcluding(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the decision.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={`${panel} grid gap-3 p-4`} aria-labelledby="sessions-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="sessions-title" className="flex items-center gap-2 font-semibold">
          <Flag className="size-4" aria-hidden="true" /> Sessions & quality
        </h3>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter sessions">
          {(
            [
              ["all", `All ${sessions.length}`],
              ["flagged", `Flagged ${flagged.length}`],
              ["excluded", `Excluded ${excluded.length}`],
            ] as const
          ).map(([value, label]) => (
            <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-[#555]">
        Flags are suggestions (speeders, straight-lining, empty open text). Nothing is excluded until a researcher decides, and every decision
        is kept in the audit log.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-[#555]">{filter === "all" ? "No sessions yet." : `No ${filter} sessions.`}</p>
      ) : (
        <ul className="grid max-h-[32rem] gap-2 overflow-y-auto">
          {shown.map((session) => (
            <li key={session.id} className={`grid gap-2 border border-[#111] p-3 ${session.excluded ? "bg-[#eee]" : "bg-white"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <code>{session.id.slice(0, 8)}</code>
                  <Badge variant="outline">{session.status.replace("_", " ")}</Badge>
                  {session.source === "maze" ? <Badge variant="outline">Maze import</Badge> : null}
                  <span className="tabular-nums text-[#555]">{seconds(session.durationMs)}</span>
                  {session.excluded ? <Badge className="border border-[#111] bg-[#111] text-white">excluded</Badge> : null}
                  {session.decision === "kept" ? <Badge variant="outline">kept</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => setViewing(session)}>
                    <Eye className="size-4" aria-hidden="true" /> View
                  </Button>
                  {canEdit && !session.excluded ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === session.id}
                      onClick={() => {
                        setReason(session.flags.map((flag) => flag.reason).join(" "));
                        setExcluding(session);
                      }}
                    >
                      <ShieldOff className="size-4" aria-hidden="true" /> Exclude
                    </Button>
                  ) : null}
                  {canEdit && (session.excluded || (session.flags.length > 0 && session.decision !== "kept")) ? (
                    <Button size="sm" variant="outline" disabled={busy === session.id} onClick={() => decide(session, false, "")}>
                      {busy === session.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CircleCheck className="size-4" aria-hidden="true" />}
                      {session.excluded ? "Include" : "Keep"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {session.flags.length ? (
                <ul className="grid gap-1 text-sm">
                  {session.flags.map((flag) => (
                    <li key={flag.code} className="flex flex-wrap items-baseline gap-2">
                      <Badge className="border border-[#111] bg-[#ffbd2e] text-[#111]">{QUALITY_FLAG_LABELS[flag.code]}</Badge>
                      <span>{flag.reason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {session.decision ? (
                <p className="text-xs text-[#555]">
                  {session.decision === "excluded" ? "Excluded" : "Kept"} by {session.decidedBy ?? "a researcher"}
                  {session.decidedAt ? ` on ${new Date(session.decidedAt).toLocaleString()}` : ""}: {session.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Session {viewing?.id.slice(0, 8)}</DialogTitle>
            <DialogDescription>Raw answers in the order the participant saw the blocks. No name, email or IP is stored.</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <ol className="grid gap-2">
              {viewing.path.map((blockId, index) => {
                const block = blocks.find((candidate) => candidate.id === blockId);
                if (!block) return null;
                return (
                  <li key={blockId} className="grid gap-1 border border-[#111] bg-white p-2 text-sm">
                    <span className="text-xs text-[#555]">
                      {index + 1}. {blockTitle(block)}
                    </span>
                    <span className="whitespace-pre-wrap break-words">{describeAnswer(block, viewing.answers[blockId])}</span>
                    {onCite && canEdit && viewing.answers[blockId] !== undefined ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="justify-self-start"
                        onClick={() => {
                          onCite({ kind: "response", responseId: viewing.id, blockId });
                          setViewing(null);
                        }}
                      >
                        <Quote className="size-4" aria-hidden="true" /> Cite in a finding
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={excluding !== null} onOpenChange={(open) => !open && setExcluding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exclude session {excluding?.id.slice(0, 8)}?</DialogTitle>
            <DialogDescription>
              Excluded sessions are left out of results, CSVs and the shared link. The raw answers stay in the JSON export with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="exclude-reason">Reason</Label>
            <Textarea id="exclude-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluding(null)}>
              Cancel
            </Button>
            <Button disabled={reason.trim().length < 3 || busy !== ""} onClick={() => excluding && decide(excluding, true, reason.trim())}>
              Exclude session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
