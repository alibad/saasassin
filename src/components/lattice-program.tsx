"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  CircleAlert,
  Download,
  EyeOff,
  FileCheck2,
  Globe,
  KeyRound,
  ListChecks,
  LoaderCircle,
  Lock,
  MessageSquareHeart,
  Plus,
  RotateCcw,
  Scale,
  Send,
  Target,
  Timer,
  UserPlus,
  Users,
  Webhook,
  X,
} from "lucide-react";

import {
  EmptyState,
  formatDate,
  formatRelative,
  Meter,
  PersonAvatar,
  PersonLine,
  SectionTitle,
  StatCard,
  StatusPill,
  usePeople,
} from "@/components/lattice-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  buildReport,
  buildTimeline,
  deadlineStatus,
  DEADLINE_STATUS_LABELS,
  GOAL_STATUS_LABELS,
  REVIEW_DIRECTION_LABELS,
  type GoalStatus,
} from "@/lib/lattice/program";
import type { IntegrationsSnapshot } from "@/lib/lattice/integrations-data";
import type { ProgramCycleMeta, ProgramPacket, ProgramSnapshot } from "@/lib/lattice/program-types";
import { REVIEW_CYCLE_STATE_LABELS, type ReviewCycleState } from "@/lib/lattice/state-machine";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/types/lattice";

const ALL = "__all__";

export async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "Something went wrong. Try again.");
  return result;
}

/** Runs a write, refreshes the server data, and reports the outcome in a toast. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  async function run(key: string, callback: () => Promise<unknown>, success?: string) {
    setPending(key);
    setError("");
    try {
      await callback();
      if (success) toast({ title: success });
      router.refresh();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong. Try again.";
      setError(message);
      toast({ title: "That didn't work", description: message, variant: "destructive" });
      return false;
    } finally {
      setPending("");
    }
  }
  return { pending, error, run, setError };
}

function cycleStateLabel(state: string) {
  return REVIEW_CYCLE_STATE_LABELS[state as ReviewCycleState] ?? state;
}

/** A Select of people, each with their face. */
export function MemberSelect({
  id,
  members,
  value,
  onChange,
  placeholder,
  includeAll,
  className,
}: {
  id: string;
  members: Array<Pick<WorkspaceMember, "id" | "name">>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  includeAll?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={cn("w-full", className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {includeAll ? <SelectItem value={ALL}>{includeAll}</SelectItem> : null}
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <PersonAvatar memberId={member.id} name={member.name} size="xs" />
            {member.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return <Alert variant="destructive"><CircleAlert /><AlertDescription>{message}</AlertDescription></Alert>;
}

function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-lg border border-border", className)}>{children}</div>;
}

const head = "h-9 bg-muted/50 text-xs font-medium text-muted-foreground";

// ---------------------------------------------------------------------------
// Review cycles: deadlines, reminders, nominations, calibration, packets
// ---------------------------------------------------------------------------

/** Past-due scheduled phases, with a one-click advance for people who run reviews. */
export function DuePhasesBanner({
  organizationId,
  program,
  canManage,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  canManage: boolean;
}) {
  const action = useAction();
  const due = program.cycles.filter((cycle) => cycle.phaseDue.due);
  if (!due.length) return null;
  return (
    <Alert className="border-brand-accent/60 bg-accent/60">
      <CalendarClock />
      <AlertTitle>{due.length === 1 ? "A scheduled phase has ended" : `${due.length} scheduled phases have ended`}</AlertTitle>
      <AlertDescription>
        <p>{due.map((cycle) => `${cycle.name}: ${cycleStateLabel(cycle.state)} ended ${formatDate(cycle.phaseDue.endsOn)}`).join(" · ")}</p>
        {canManage ? (
          <Button
            size="sm"
            className="mt-2"
            disabled={action.pending === "advance"}
            onClick={() => action.run("advance", async () => {
              const { results } = await postJson(`/api/lattice/organizations/${organizationId}/schedule`, {}) as { results: Array<{ name: string; status: string; reasons: string[] }> };
              const blocked = results.filter((result) => result.status === "blocked");
              if (blocked.length) {
                throw new Error(`${results.length - blocked.length} advanced; still blocked: ${blocked.map((result) => `${result.name} (${result.reasons.join(" ")})`).join("; ")}`);
              }
              return results;
            }, "Due phases moved on")}
          >
            {action.pending === "advance" ? <LoaderCircle className="animate-spin" /> : <Timer />} Move due phases on
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Everything about one live cycle beyond its phase: the deadline and reminders, who still has
 * reviews to write, peer nominations, calibration, and the packets people received.
 */
export function CycleDetails({
  organizationId,
  cycle,
  program,
  members,
  canManage,
  canCalibrate,
  myOutstanding = 0,
}: {
  organizationId: string;
  cycle: ProgramCycleMeta;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  canManage: boolean;
  canCalibrate: boolean;
  myOutstanding?: number;
}) {
  const action = useAction();
  const [nominating, setNominating] = useState(false);
  const [nominationSubject, setNominationSubject] = useState("");
  const [nominationPeers, setNominationPeers] = useState<string[]>([]);
  const [reopening, setReopening] = useState<ProgramPacket | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const now = new Date(program.now);
  const url = `/api/lattice/organizations/${organizationId}/cycles/${cycle.id}/program`;
  const progress = program.progress.filter((entry) => entry.cycleId === cycle.id);
  const outstanding = progress.reduce((sum, entry) => sum + entry.outstanding, 0);
  const submitted = progress.reduce((sum, entry) => sum + entry.submitted, 0);
  const status = deadlineStatus(cycle.dueDate, now, canManage ? outstanding === 0 && submitted > 0 : myOutstanding === 0);
  const nominations = program.nominations.filter((entry) => entry.cycleId === cycle.id);
  const calibration = program.calibration.filter((entry) => entry.cycleId === cycle.id);
  const packets = program.packets.filter((entry) => entry.cycleId === cycle.id && entry.subjectId !== program.myMemberId);
  const activeMembers = members.filter((member) => member.status === "active");
  const nominationSubjects = members.filter((member) =>
    member.id === program.myMemberId || program.directReportIds.includes(member.id) || canManage,
  );
  const sortedProgress = [...progress].sort((a, b) => b.outstanding - a.outstanding || a.reviewerName.localeCompare(b.reviewerName));

  async function submitNomination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run("nominate", () => postJson(url, {
      action: "nominate",
      subjectId: nominationSubject || program.myMemberId,
      peerIds: nominationPeers,
    }), "Peer nominations saved");
    if (ok) {
      setNominating(false);
      setNominationPeers([]);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill tone={status === "overdue" ? "negative" : status === "due_soon" ? "attention" : status === "done" ? "positive" : "neutral"}>
          {cycle.dueDate ? `${DEADLINE_STATUS_LABELS[status]} · due ${formatDate(cycle.dueDate)}` : "No writing deadline"}
        </StatusPill>
        {cycle.phaseDue.due ? <StatusPill tone="negative">Phase ended {cycle.phaseDue.overdueDays}d ago</StatusPill> : null}
        {cycle.phaseDue.endsOn && !cycle.phaseDue.due ? <StatusPill tone="neutral">{cycleStateLabel(cycle.state)} ends {formatDate(cycle.phaseDue.endsOn)}</StatusPill> : null}
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="size-3.5" aria-hidden="true" /> Peer and upward answers shared from {cycle.anonymityThreshold} responses
        </span>
        {cycle.lastRemindedAt ? <span className="text-xs text-muted-foreground">· Last reminder {formatRelative(cycle.lastRemindedAt, program.now)}</span> : null}
      </div>

      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("dueDate") ?? "");
            void action.run(`deadline-${cycle.id}`, () => postJson(url, { action: "set_deadline", dueDate: value || null }), "Deadline updated");
          }}
        >
          <Field label="Writing deadline" htmlFor={`deadline-${cycle.id}`}>
            <Input id={`deadline-${cycle.id}`} name="dueDate" type="date" defaultValue={cycle.dueDate ?? ""} className="w-44" />
          </Field>
          <Button type="submit" variant="outline" disabled={action.pending === `deadline-${cycle.id}`}>Save deadline</Button>
          {cycle.state === "review_writing" ? (
            <Button
              type="button"
              className="sm:ml-auto"
              onClick={() => action.run(`remind-${cycle.id}`, () => postJson(url, { action: "send_reminders" }), "Reminders sent. Overdue reviewers' managers were told too.")}
              disabled={action.pending === `remind-${cycle.id}` || outstanding === 0}
            >
              {action.pending === `remind-${cycle.id}` ? <LoaderCircle className="animate-spin" /> : <Bell />} Remind {outstanding} outstanding
            </Button>
          ) : null}
        </form>
      ) : null}

      {canManage && progress.length ? (
        <section className="grid gap-3">
          <SectionTitle title="Reviewers" description={`${submitted} submitted · ${outstanding} still to write`} />
          <TableShell className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10"><TableRow><TableHead className={head}>Reviewer</TableHead><TableHead className={head}>Progress</TableHead><TableHead className={cn(head, "text-right")}>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {sortedProgress.map((entry) => {
                  const reviewerStatus = deadlineStatus(cycle.dueDate, now, entry.outstanding === 0);
                  const total = entry.submitted + entry.outstanding;
                  return (
                    <TableRow key={entry.reviewerId}>
                      <TableCell><PersonLine memberId={entry.reviewerId} name={entry.reviewerName} size="sm" /></TableCell>
                      <TableCell className="w-[40%]">
                        <div className="flex items-center gap-3">
                          <Meter value={total ? (entry.submitted / total) * 100 : 0} label={`${entry.reviewerName} progress`} className="max-w-40" />
                          <span className="text-xs text-muted-foreground tabular-nums">{entry.submitted}/{total}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusPill tone={reviewerStatus === "overdue" ? "negative" : reviewerStatus === "done" ? "positive" : reviewerStatus === "due_soon" ? "attention" : "neutral"}>
                          {DEADLINE_STATUS_LABELS[reviewerStatus]}
                        </StatusPill>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableShell>
        </section>
      ) : null}

      {cycle.peerNominationEnabled && (cycle.state === "peer_nomination" || nominations.length) ? (
        <section className="grid gap-3">
          <SectionTitle
            title={<><UserPlus className="size-4 text-primary" aria-hidden="true" /> Peer nominations</>}
            count={nominations.length}
            actions={cycle.state === "peer_nomination" ? (
              <Button size="sm" variant="outline" onClick={() => { setNominating(true); setNominationSubject(program.myMemberId ?? ""); setNominationPeers([]); }}>
                <Plus /> Nominate peers
              </Button>
            ) : null}
          />
          {nominations.length ? (
            <TableShell className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10"><TableRow><TableHead className={head}>Being reviewed</TableHead><TableHead className={head}>Peer</TableHead><TableHead className={head}>State</TableHead><TableHead className={cn(head, "text-right")}>Decision</TableHead></TableRow></TableHeader>
                <TableBody>
                  {nominations.map((nomination) => (
                    <TableRow key={nomination.id}>
                      <TableCell><PersonLine memberId={nomination.subjectId} name={nomination.subjectName} detail={nomination.nominatedByName ? `Nominated by ${nomination.nominatedByName}` : undefined} size="sm" /></TableCell>
                      <TableCell><PersonLine memberId={nomination.peerId} name={nomination.peerName} size="sm" /></TableCell>
                      <TableCell>
                        <StatusPill tone={nomination.state === "approved" ? "positive" : nomination.state === "declined" ? "negative" : "attention"}>
                          {nomination.state === "approved" ? "Approved" : nomination.state === "declined" ? "Declined" : "Waiting for manager"}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right">
                        {nomination.canDecide && cycle.state === "peer_nomination" ? (
                          <div className="inline-flex gap-1.5">
                            <Button size="icon-sm" variant="outline" aria-label={`Approve ${nomination.peerName}`} disabled={Boolean(action.pending) || nomination.state === "approved"} onClick={() => action.run(`decide-${nomination.id}`, () => postJson(url, { action: "decide_nomination", nominationId: nomination.id, decision: "approved" }))}><Check /></Button>
                            <Button size="icon-sm" variant="outline" aria-label={`Decline ${nomination.peerName}`} disabled={Boolean(action.pending) || nomination.state === "declined"} onClick={() => action.run(`decide-${nomination.id}`, () => postJson(url, { action: "decide_nomination", nominationId: nomination.id, decision: "declined" }))}><X /></Button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>
          ) : <p className="text-sm text-muted-foreground">No nominations yet. People nominate peers; managers approve or decline before writing opens.</p>}
        </section>
      ) : null}

      {canCalibrate && cycle.state === "calibration" ? (
        <section className="grid gap-3">
          <SectionTitle
            title={<><Scale className="size-4 text-primary" aria-hidden="true" /> Calibration</>}
            description={`${calibration.filter((row) => row.rating !== null).length} of ${calibration.length} calibrated`}
          />
          {calibration.length ? (
            <TableShell className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead className={head}>Person</TableHead><TableHead className={head}>Review signal</TableHead><TableHead className={head}>Calibrated rating</TableHead><TableHead className={head}>Note for calibrators</TableHead><TableHead className={head} /></TableRow></TableHeader>
                <TableBody>
                  {calibration.map((row) => <CalibrationRow key={row.subjectId} row={row} pending={action.pending === `calibrate-${row.subjectId}`} onSave={(rating, note) => action.run(`calibrate-${row.subjectId}`, () => postJson(url, { action: "calibrate", subjectId: row.subjectId, rating, note }), "Calibration saved")} />)}
                </TableBody>
              </Table>
            </TableShell>
          ) : <p className="text-sm text-muted-foreground">No reviews were assigned in this cycle.</p>}
        </section>
      ) : null}

      {packets.length ? (
        <section className="grid gap-3">
          <SectionTitle
            title={<><FileCheck2 className="size-4 text-primary" aria-hidden="true" /> Review packets</>}
            description={`${packets.filter((packet) => packet.state === "acknowledged").length} of ${packets.length} acknowledged`}
          />
          <TableShell className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10"><TableRow><TableHead className={head}>Person</TableHead><TableHead className={head}>Rating</TableHead><TableHead className={head}>State</TableHead><TableHead className={head}>Acknowledged</TableHead><TableHead className={head} /></TableRow></TableHeader>
              <TableBody>
                {packets.map((packet) => (
                  <TableRow key={packet.subjectId}>
                    <TableCell><PersonLine memberId={packet.subjectId} name={packet.subjectName} detail={`${packet.content.sections.length} sections${packet.reopenCount ? ` · reopened ${packet.reopenCount}×` : ""}`} size="sm" /></TableCell>
                    <TableCell className="tabular-nums">{packet.content.calibratedRating ? `${packet.content.calibratedRating} / 5` : "—"}</TableCell>
                    <TableCell><StatusPill tone={packet.state === "acknowledged" ? "positive" : "attention"}>{packet.state === "acknowledged" ? "Acknowledged" : "Waiting"}</StatusPill></TableCell>
                    <TableCell className="text-muted-foreground">{packet.acknowledgedAt ? formatDate(packet.acknowledgedAt) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {canCalibrate && packet.state === "acknowledged" && cycle.state === "acknowledgement" ? (
                        <Button size="sm" variant="ghost" onClick={() => { setReopening(packet); setReopenReason(""); }}><RotateCcw /> Reopen</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        </section>
      ) : null}

      <Dialog open={nominating} onOpenChange={setNominating}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitNomination} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Nominate peers</DialogTitle>
              <DialogDescription>Managers&apos; nominations are approved straight away. Everyone else&apos;s wait for their manager.</DialogDescription>
            </DialogHeader>
            <Field label="Person being reviewed" htmlFor="nomination-subject">
              <MemberSelect id="nomination-subject" members={nominationSubjects} value={nominationSubject} onChange={setNominationSubject} placeholder="Choose a person" />
            </Field>
            <div className="grid gap-1.5">
              <Label>Peers (up to 5)</Label>
              <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-border p-1.5 sm:grid-cols-2">
                {activeMembers.filter((member) => member.id !== nominationSubject).map((member) => (
                  <Label key={member.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 font-normal hover:bg-muted">
                    <Checkbox
                      checked={nominationPeers.includes(member.id)}
                      disabled={!nominationPeers.includes(member.id) && nominationPeers.length >= 5}
                      onCheckedChange={(checked) => setNominationPeers((current) => checked ? [...current, member.id] : current.filter((id) => id !== member.id))}
                    />
                    <PersonAvatar memberId={member.id} name={member.name} size="sm" />
                    <span className="truncate">{member.name}</span>
                  </Label>
                ))}
              </div>
              {activeMembers.length < 2 ? <p className="text-xs text-muted-foreground">Only people who have joined can be nominated.</p> : null}
            </div>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNominating(false)}>Cancel</Button>
              <Button type="submit" disabled={!nominationPeers.length || !nominationSubject || action.pending === "nominate"}>{action.pending === "nominate" ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Save nominations</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reopening)} onOpenChange={(open) => !open && setReopening(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {reopening?.subjectName}&apos;s packet</DialogTitle>
            <DialogDescription>The earlier acknowledgement stays in the packet&apos;s history and the audit log. They&apos;ll need to acknowledge again.</DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="reopen-reason">
            <Textarea id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Corrected the calibrated rating after an appeal" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopening(null)}>Cancel</Button>
            <Button
              disabled={reopenReason.trim().length < 3 || action.pending === "reopen"}
              onClick={async () => {
                if (!reopening) return;
                const ok = await action.run("reopen", () => postJson(`/api/lattice/organizations/${organizationId}/cycles/${reopening.cycleId}/program`, { action: "reopen_packet", subjectId: reopening.subjectId, reason: reopenReason }), "Packet reopened for acknowledgement");
                if (ok) setReopening(null);
              }}
            >
              <RotateCcw /> Reopen packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalibrationRow({
  row,
  pending,
  onSave,
}: {
  row: ProgramSnapshot["calibration"][number];
  pending: boolean;
  onSave: (rating: number | null, note: string) => void;
}) {
  const [rating, setRating] = useState(row.rating ? String(row.rating) : "");
  const [note, setNote] = useState(row.note);
  const signal = Object.entries(row.summary.byDirection)
    .map(([direction, value]) => `${REVIEW_DIRECTION_LABELS[direction as keyof typeof REVIEW_DIRECTION_LABELS]} ${value}`)
    .join(" · ");
  return (
    <TableRow>
      <TableCell><PersonLine memberId={row.subjectId} name={row.subjectName} detail={`${row.summary.submittedReviews}/${row.summary.totalReviews} reviews in`} size="sm" /></TableCell>
      <TableCell>
        <span className="block font-medium tabular-nums">{row.summary.average ?? "No ratings"}</span>
        <span className="block text-xs text-muted-foreground">{signal || "No rating questions answered"}</span>
      </TableCell>
      <TableCell>
        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger aria-label={`Calibrated rating for ${row.subjectName}`} className="w-28"><SelectValue placeholder="Rate 1–5" /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell><Input aria-label={`Calibration note for ${row.subjectName}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Only calibrators see this" className="min-w-48" /></TableCell>
      <TableCell className="text-right"><Button size="sm" onClick={() => onSave(rating ? Number(rating) : null, note)} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />} Save</Button></TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Your review results and notifications
// ---------------------------------------------------------------------------

/** The review packets released to the signed-in person, with acknowledgement. */
export function MyPackets({ organizationId, program }: { organizationId: string; program: ProgramSnapshot }) {
  const action = useAction();
  const [comment, setComment] = useState<Record<string, string>>({});
  const myPackets = program.packets.filter((packet) => packet.subjectId === program.myMemberId);
  const cycleState = new Map(program.cycles.map((cycle) => [cycle.id, cycle.state]));

  if (!myPackets.length) {
    return <EmptyState icon={FileCheck2} title="No results yet" description="When a review cycle reaches acknowledgement, your review packet appears here to read and acknowledge." />;
  }

  return (
    <div className="grid gap-5">
      {myPackets.map((packet) => (
        <Card key={packet.cycleId} className="gap-0 py-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h3 className="brand-heading text-xl">{packet.cycleName}</h3>
              <p className="text-sm text-muted-foreground">Released {formatDate(packet.releasedAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              {packet.content.calibratedRating ? (
                <span className="rounded-lg bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
                  Rating <strong className="font-heading text-base">{packet.content.calibratedRating}</strong> / 5
                </span>
              ) : null}
              <StatusPill tone={packet.state === "acknowledged" ? "positive" : "attention"}>{packet.state === "acknowledged" ? "Acknowledged" : "Waiting for you"}</StatusPill>
            </div>
          </div>
          <div className="grid gap-0 divide-y divide-border">
            {packet.content.sections.length ? packet.content.sections.map((section, index) => (
              <section key={`${section.reviewerLabel}-${index}`} className="grid gap-3 px-5 py-4">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  {section.direction === "peer" || section.direction === "upward" ? <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" /> : <Users className="size-4 text-muted-foreground" aria-hidden="true" />}
                  {section.reviewerLabel}
                  {section.withheld ? <StatusPill tone="neutral">Withheld</StatusPill> : null}
                </h4>
                {section.withheld ? <p className="text-sm text-muted-foreground">{section.note}</p> : null}
                {section.answers.map((answer) => (
                  <div key={answer.questionId} className="grid gap-1">
                    <p className="text-xs font-medium text-muted-foreground">{answer.prompt}</p>
                    <p className="text-[0.95rem] leading-relaxed whitespace-pre-wrap">{answer.value}</p>
                  </div>
                ))}
              </section>
            )) : <p className="px-5 py-4 text-sm text-muted-foreground">No submitted reviews were included in this packet.</p>}
          </div>
          <div className="border-t border-border bg-brand-subtle/60 px-5 py-4">
            {packet.state === "released" && cycleState.get(packet.cycleId) === "acknowledgement" ? (
              <div className="grid gap-3">
                <Field label="Comment (optional)" htmlFor={`ack-${packet.cycleId}`}>
                  <Textarea id={`ack-${packet.cycleId}`} value={comment[packet.cycleId] ?? ""} onChange={(event) => setComment((current) => ({ ...current, [packet.cycleId]: event.target.value }))} placeholder="Anything you'd like on record with your acknowledgement" />
                </Field>
                <Button className="w-fit" disabled={action.pending === `ack-${packet.cycleId}`} onClick={() => action.run(`ack-${packet.cycleId}`, () => postJson(`/api/lattice/organizations/${organizationId}/cycles/${packet.cycleId}/program`, { action: "acknowledge", comment: comment[packet.cycleId] ?? "" }), "Review acknowledged")}>
                  {action.pending === `ack-${packet.cycleId}` ? <LoaderCircle className="animate-spin" /> : <Check />} Acknowledge review
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {packet.acknowledgedAt ? `You acknowledged this on ${formatDate(packet.acknowledgedAt)}.` : "Acknowledgement isn't open for this cycle."}
                {packet.acknowledgementComment ? ` Your comment: “${packet.acknowledgementComment}”` : ""}
              </p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

const NOTIFICATION_LABELS: Record<ProgramSnapshot["notifications"][number]["kind"], string> = {
  reminder: "Reminder",
  escalation: "Overdue",
  packet_released: "Results",
  nomination: "Nomination",
};

export function NotificationList({ program, limit = 8 }: { program: ProgramSnapshot; limit?: number }) {
  if (!program.notifications.length) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>;
  }
  return (
    <ul className="grid">
      {program.notifications.slice(0, limit).map((notification) => (
        <li key={notification.id} className={cn("flex gap-3 border-b border-border py-3 last:border-0", notification.read && "opacity-60")}>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.read ? "bg-transparent" : notification.kind === "escalation" ? "bg-destructive" : "bg-primary")} aria-hidden="true" />
          <div className="grid min-w-0 gap-0.5">
            <p className="text-sm font-medium">{notification.title}</p>
            <p className="text-sm text-muted-foreground">{notification.body}</p>
            <p className="text-xs text-muted-foreground">{NOTIFICATION_LABELS[notification.kind]} · {formatRelative(notification.createdAt, program.now)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The bell in the top bar. */
export function NotificationsPopover({ organizationId, program }: { organizationId: string; program: ProgramSnapshot }) {
  const action = useAction();
  const unread = program.notifications.filter((notification) => !notification.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative rounded-full" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread ? <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-brand-accent text-[0.6rem] font-semibold text-brand-accent-foreground tabular-nums">{unread > 9 ? "9+" : unread}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-heading text-sm font-semibold">Notifications</p>
          {unread ? (
            <Button size="xs" variant="ghost" disabled={action.pending === "read"} onClick={() => action.run("read", () => postJson(`/api/lattice/organizations/${organizationId}/growth`, { action: "mark_notifications_read" }))}>
              <Check /> Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-[26rem] overflow-y-auto px-4">
          <NotificationList program={program} limit={20} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const GOAL_TONE: Record<GoalStatus, "positive" | "attention" | "negative" | "info"> = {
  on_track: "positive",
  at_risk: "attention",
  off_track: "negative",
  done: "info",
};

export function GoalsPanel({
  organizationId,
  program,
  members,
  canManage,
  creating,
  onCreatingChange,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  canManage: boolean;
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
}) {
  const action = useAction();
  const url = `/api/lattice/organizations/${organizationId}/growth`;
  const me = program.myMemberId;
  const [filter, setFilter] = useState<"mine" | "team" | "all">(
    canManage || !me ? "all" : program.directReportIds.length ? "team" : "mine",
  );
  const [goalOwner, setGoalOwner] = useState(me ?? "");
  const [goalVisibility, setGoalVisibility] = useState("public");
  const goalOwners = members.filter((member) => member.id === me || program.directReportIds.includes(member.id) || canManage);
  const goals = program.goals.filter((goal) =>
    filter === "all" ? true : filter === "mine" ? goal.ownerId === me : program.directReportIds.includes(goal.ownerId),
  );
  const counts = {
    on_track: program.goals.filter((goal) => goal.status === "on_track").length,
    at_risk: program.goals.filter((goal) => goal.status === "at_risk").length,
    off_track: program.goals.filter((goal) => goal.status === "off_track").length,
    done: program.goals.filter((goal) => goal.status === "done").length,
  };

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ok = await action.run("goal", () => postJson(url, {
      action: "create_goal",
      ownerId: goalOwner || null,
      title: data.get("title"),
      description: data.get("description") ?? "",
      dueDate: data.get("dueDate") || null,
      visibility: goalVisibility,
    }), "Goal created");
    if (ok) {
      form.reset();
      onCreatingChange(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="On track" value={counts.on_track} />
        <StatCard label="At risk" value={counts.at_risk} />
        <StatCard label="Off track" value={counts.off_track} />
        <StatCard label="Done" value={counts.done} />
      </div>
      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <TabsList>
          {me ? <TabsTrigger value="mine">Mine</TabsTrigger> : null}
          {program.directReportIds.length ? <TabsTrigger value="team">My team</TabsTrigger> : null}
          <TabsTrigger value="all">All I can see</TabsTrigger>
        </TabsList>
      </Tabs>
      {goals.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              now={program.now}
              canCheckIn={goal.ownerId === me || program.directReportIds.includes(goal.ownerId) || canManage}
              pending={action.pending === `goal-${goal.id}`}
              onCheckIn={(progress, status, note) => action.run(`goal-${goal.id}`, () => postJson(url, { action: "check_in_goal", goalId: goal.id, progress, status, note }), "Check-in saved")}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title={filter === "mine" ? "You have no goals yet" : "No goals here yet"}
          description="Goals and their check-ins show up on each person's timeline and in reports."
          action={<Button onClick={() => onCreatingChange(true)}><Plus /> New goal</Button>}
        />
      )}

      <Dialog open={creating} onOpenChange={onCreatingChange}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={createGoal}>
            <DialogHeader>
              <DialogTitle>New goal</DialogTitle>
              <DialogDescription>For yourself or someone who reports to you.</DialogDescription>
            </DialogHeader>
            <Field label="Owner" htmlFor="goal-owner"><MemberSelect id="goal-owner" members={goalOwners} value={goalOwner} onChange={setGoalOwner} placeholder="Choose an owner" /></Field>
            <Field label="Goal" htmlFor="goal-title"><Input id="goal-title" name="title" placeholder="Ship self-serve onboarding" required minLength={3} /></Field>
            <Field label="What does done look like?" htmlFor="goal-description"><Textarea id="goal-description" name="description" placeholder="Activation above 40% for new customers" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due" htmlFor="goal-due"><Input id="goal-due" name="dueDate" type="date" /></Field>
              <Field label="Who can see it" htmlFor="goal-visibility">
                <Select value={goalVisibility} onValueChange={setGoalVisibility}>
                  <SelectTrigger id="goal-visibility" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="public">Everyone</SelectItem><SelectItem value="manager">Owner and manager</SelectItem></SelectContent>
                </Select>
              </Field>
            </div>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onCreatingChange(false)}>Cancel</Button>
              <Button type="submit" disabled={action.pending === "goal" || !goalOwner}>{action.pending === "goal" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create goal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalCard({
  goal,
  now,
  canCheckIn,
  pending,
  onCheckIn,
}: {
  goal: ProgramSnapshot["goals"][number];
  now: string;
  canCheckIn: boolean;
  pending: boolean;
  onCheckIn: (progress: number, status: GoalStatus, note: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(goal.progress);
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [note, setNote] = useState("");
  const last = goal.checkIns.at(-1);
  return (
    <Card className="gap-3 px-5">
      <div className="flex items-start justify-between gap-3">
        <PersonLine memberId={goal.ownerId} name={goal.ownerName} detail={goal.dueDate ? `Due ${formatDate(goal.dueDate)}` : "No due date"} size="sm" />
        <StatusPill tone={GOAL_TONE[goal.status]}>{GOAL_STATUS_LABELS[goal.status]}</StatusPill>
      </div>
      <div>
        <h3 className="font-heading text-base font-semibold leading-snug">{goal.title}</h3>
        {goal.description ? <p className="mt-1 text-sm text-muted-foreground">{goal.description}</p> : null}
      </div>
      <div className="flex items-center gap-3">
        <Meter value={goal.progress} label={`${goal.title} progress`} tone={goal.status === "off_track" ? "danger" : goal.status === "at_risk" ? "accent" : "primary"} />
        <span className="w-10 text-right text-sm font-medium tabular-nums">{goal.progress}%</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {goal.visibility === "manager" ? <Lock className="size-3.5" aria-hidden="true" /> : <Globe className="size-3.5" aria-hidden="true" />}
          {goal.visibility === "manager" ? "Owner and manager" : "Everyone"}
          {last ? ` · Updated ${formatRelative(last.at, now)}` : ""}
        </span>
        {canCheckIn ? <Button size="sm" variant="outline" onClick={() => { setProgress(goal.progress); setStatus(goal.status); setOpen(true); }}>Check in</Button> : null}
      </div>
      {last?.note ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">“{last.note}”</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Check in on “{goal.title}”</DialogTitle>
            <DialogDescription>Where it stands now, and what changed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="flex items-center justify-between"><Label htmlFor={`progress-${goal.id}`}>Progress</Label><span className="text-sm font-medium tabular-nums">{progress}%</span></div>
            <Slider id={`progress-${goal.id}`} min={0} max={100} step={5} value={[progress]} onValueChange={([value]) => setProgress(value ?? 0)} aria-label="Progress" />
          </div>
          <Field label="Status" htmlFor={`status-${goal.id}`}>
            <Select value={status} onValueChange={(value) => setStatus(value as GoalStatus)}>
              <SelectTrigger id={`status-${goal.id}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="What changed?" htmlFor={`note-${goal.id}`}>
            <Textarea id={`note-${goal.id}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Signed the pilot contract; two weeks behind on hiring" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={async () => { if (await onCheckIn(progress, status, note)) { setNote(""); setOpen(false); } }}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />} Save check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** A person's own goals, compact, for the home page. */
export function GoalsSummary({ program, onOpen }: { program: ProgramSnapshot; onOpen: () => void }) {
  const mine = program.goals.filter((goal) => goal.ownerId === program.myMemberId && goal.status !== "done").slice(0, 4);
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading text-base">Your goals</CardTitle>
        <Button size="xs" variant="ghost" onClick={onOpen}>All goals <ArrowRight /></Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {mine.length ? mine.map((goal) => (
          <div key={goal.id} className="grid gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{goal.title}</p>
              <StatusPill tone={GOAL_TONE[goal.status]} className="h-5 px-2">{GOAL_STATUS_LABELS[goal.status]}</StatusPill>
            </div>
            <div className="flex items-center gap-2">
              <Meter value={goal.progress} label={`${goal.title} progress`} tone={goal.status === "off_track" ? "danger" : goal.status === "at_risk" ? "accent" : "primary"} />
              <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{goal.progress}%</span>
            </div>
          </div>
        )) : <p className="text-sm text-muted-foreground">No open goals. Set one to give your next review something concrete to point at.</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const VISIBILITY_LABELS = { private: "Only them", manager: "Them and their manager", public: "Everyone" } as const;

/** "Give feedback", usable from any page. */
export function GiveFeedbackDialog({
  organizationId,
  members,
  me,
  open,
  onOpenChange,
  defaultRecipient = "",
}: {
  organizationId: string;
  members: WorkspaceMember[];
  me: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRecipient?: string;
}) {
  const action = useAction();
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [kind, setKind] = useState("praise");
  const [visibility, setVisibility] = useState("public");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await action.run("feedback", () => postJson(`/api/lattice/organizations/${organizationId}/growth`, {
      action: "give_feedback",
      recipientId: recipient,
      kind,
      body: new FormData(form).get("body"),
      visibility,
    }), kind === "praise" ? "Praise shared" : "Feedback shared");
    if (ok) {
      form.reset();
      setRecipient("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Give feedback</DialogTitle>
            <DialogDescription>Specific, kind and about the work. The text stays with the people you choose; the audit log only records that feedback was given.</DialogDescription>
          </DialogHeader>
          <Field label="To" htmlFor="feedback-recipient"><MemberSelect id="feedback-recipient" members={members.filter((member) => member.id !== me && member.status !== "inactive")} value={recipient} onChange={setRecipient} placeholder="Choose a colleague" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="feedback-kind">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="feedback-kind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="praise">Praise</SelectItem><SelectItem value="constructive">Suggestion</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Who can see it" htmlFor="feedback-visibility">
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger id="feedback-visibility" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(VISIBILITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Feedback" htmlFor="feedback-body"><Textarea id="feedback-body" name="body" rows={5} placeholder="What they did, and the difference it made" required minLength={3} /></Field>
          <InlineError message={action.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={action.pending === "feedback" || !recipient}>{action.pending === "feedback" ? <LoaderCircle className="animate-spin" /> : <Send />} Share</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackItem({ item, now, compact = false }: { item: ProgramSnapshot["feedback"][number]; now: string; compact?: boolean }) {
  return (
    <article className={cn("grid gap-3", !compact && "rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <PersonAvatar memberId={item.authorId} name={item.authorName} size="sm" />
        <span className="font-medium">{item.authorName}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <PersonAvatar memberId={item.recipientId} name={item.recipientName} size="sm" />
        <span className="font-medium">{item.recipientName}</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatRelative(item.createdAt, now)}</span>
      </div>
      <p className={cn("leading-relaxed whitespace-pre-wrap", compact ? "text-sm" : "text-[0.95rem]")}>{item.body}</p>
      {!compact ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone={item.kind === "praise" ? "attention" : "info"}>{item.kind === "praise" ? "Praise" : "Suggestion"}</StatusPill>
          <span className="inline-flex items-center gap-1">
            {item.visibility === "public" ? <Globe className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
            {VISIBILITY_LABELS[item.visibility]}
          </span>
        </div>
      ) : null}
    </article>
  );
}

export function FeedbackPanel({ program }: { program: ProgramSnapshot }) {
  const me = program.myMemberId;
  const [filter, setFilter] = useState<"received" | "given" | "all">("all");
  const items = program.feedback.filter((item) =>
    filter === "all" ? true : filter === "received" ? item.recipientId === me : item.authorId === me,
  );
  return (
    <div className="grid gap-5">
      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">All I can see</TabsTrigger>
          {me ? <TabsTrigger value="received">Received</TabsTrigger> : null}
          {me ? <TabsTrigger value="given">Given</TabsTrigger> : null}
        </TabsList>
      </Tabs>
      {items.length ? (
        <div className="grid gap-3">{items.map((item) => <FeedbackItem key={item.id} item={item} now={program.now} />)}</div>
      ) : (
        <EmptyState icon={MessageSquareHeart} title="Nothing here yet" description="Feedback you give or receive shows up here, to the people its author chose." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One-on-ones
// ---------------------------------------------------------------------------

export function OneOnOnesPanel({
  organizationId,
  program,
  members,
  scheduling,
  onSchedulingChange,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  scheduling: boolean;
  onSchedulingChange: (open: boolean) => void;
}) {
  const action = useAction();
  const url = `/api/lattice/organizations/${organizationId}/growth`;
  const me = program.myMemberId;
  const [counterpart, setCounterpart] = useState("");
  const myManagerId = members.find((member) => member.id === me)?.managerId ?? null;
  const counterparts = members.filter((member) => member.id === myManagerId || program.directReportIds.includes(member.id));
  const upcoming = program.oneOnOnes.filter((meeting) => meeting.status === "scheduled").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const past = program.oneOnOnes.filter((meeting) => meeting.status === "completed").sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action.run("meeting", () => postJson(url, {
      action: "schedule_one_on_one",
      counterpartId: counterpart,
      scheduledFor: new FormData(event.currentTarget).get("scheduledFor"),
    }), "One-on-one scheduled");
    if (ok) onSchedulingChange(false);
  }

  return (
    <div className="grid gap-8">
      {!counterparts.length ? (
        <Alert>
          <Users />
          <AlertTitle>One-on-ones are between a person and their manager</AlertTitle>
          <AlertDescription>Once your reporting line is in the directory, you can schedule one here.</AlertDescription>
        </Alert>
      ) : null}
      <section className="grid gap-3">
        <SectionTitle title="Upcoming" count={upcoming.length} />
        {upcoming.length ? upcoming.map((meeting) => (
          <MeetingCard key={meeting.id} meeting={meeting} now={program.now} pending={action.pending.startsWith(`meeting-${meeting.id}`)} run={(key, body, success) => action.run(`meeting-${meeting.id}-${key}`, () => postJson(url, { ...body, meetingId: meeting.id }), success)} />
        )) : (
          <EmptyState
            icon={CalendarClock}
            title="No one-on-ones scheduled"
            description="A shared agenda both of you can add to, and notes you both keep."
            action={counterparts.length ? <Button onClick={() => onSchedulingChange(true)}><Plus /> Schedule one</Button> : undefined}
          />
        )}
      </section>
      {past.length ? (
        <section className="grid gap-3">
          <SectionTitle title="Past" count={past.length} />
          {past.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} now={program.now} pending={action.pending.startsWith(`meeting-${meeting.id}`)} run={(key, body, success) => action.run(`meeting-${meeting.id}-${key}`, () => postJson(url, { ...body, meetingId: meeting.id }), success)} />
          ))}
        </section>
      ) : null}

      <Dialog open={scheduling} onOpenChange={onSchedulingChange}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={schedule}>
            <DialogHeader>
              <DialogTitle>Schedule a one-on-one</DialogTitle>
              <DialogDescription>With your manager or someone who reports to you.</DialogDescription>
            </DialogHeader>
            <Field label="With" htmlFor="meeting-counterpart"><MemberSelect id="meeting-counterpart" members={counterparts} value={counterpart} onChange={setCounterpart} placeholder="Choose a person" /></Field>
            <Field label="Date" htmlFor="meeting-date"><Input id="meeting-date" name="scheduledFor" type="date" required /></Field>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onSchedulingChange(false)}>Cancel</Button>
              <Button type="submit" disabled={!counterpart || action.pending === "meeting"}>{action.pending === "meeting" ? <LoaderCircle className="animate-spin" /> : <CalendarClock />} Schedule</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MeetingCard({
  meeting,
  now,
  pending,
  run,
}: {
  meeting: ProgramSnapshot["oneOnOnes"][number];
  now: string;
  pending: boolean;
  run: (key: string, body: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  const { meId } = usePeople();
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState(meeting.sharedNotes);
  const completed = meeting.status === "completed";
  const other = meeting.managerId === meId
    ? { id: meeting.reportId, name: meeting.reportName, role: "Reports to you" }
    : { id: meeting.managerId, name: meeting.managerName, role: "Your manager" };
  const involved = meeting.managerId === meId || meeting.reportId === meId;
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex -space-x-2">
            <PersonAvatar memberId={meeting.managerId} name={meeting.managerName} size="lg" className="ring-2 ring-card" />
            <PersonAvatar memberId={meeting.reportId} name={meeting.reportName} size="lg" className="ring-2 ring-card" />
          </span>
          <div>
            <p className="font-heading text-base font-semibold">{involved ? other.name : `${meeting.managerName} and ${meeting.reportName}`}</p>
            <p className="text-sm text-muted-foreground">{involved ? `${other.role} · ` : ""}{formatDate(meeting.scheduledFor, { weekday: "long", month: "long", day: "numeric" })} · {formatRelative(meeting.scheduledFor, now)}</p>
          </div>
        </div>
        <StatusPill tone={completed ? "positive" : "info"}>{completed ? "Completed" : "Scheduled"}</StatusPill>
      </div>
      <div className="grid gap-5 px-5 py-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-primary" aria-hidden="true" /> Shared agenda</p>
          {meeting.agenda.length ? (
            <ul className="grid gap-1">
              {meeting.agenda.map((entry) => (
                <li key={entry.id}>
                  <Label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 font-normal hover:bg-muted/60">
                    <Checkbox className="mt-0.5" checked={entry.done} disabled={completed || pending} onCheckedChange={() => run("toggle", { action: "toggle_agenda_item", itemId: entry.id })} />
                    <span className={cn("flex-1 text-sm", entry.done && "text-muted-foreground line-through")}>{entry.text}</span>
                    <span className="text-xs text-muted-foreground">{entry.authorName.split(" ")[0]}</span>
                  </Label>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nothing on the agenda yet. Either of you can add a topic.</p>}
          {!completed ? (
            <form className="flex gap-2" onSubmit={async (event) => { event.preventDefault(); if (await run("agenda", { action: "add_agenda_item", text: item })) setItem(""); }}>
              <Input aria-label="New agenda topic" value={item} onChange={(event) => setItem(event.target.value)} placeholder="Add a topic" />
              <Button type="submit" variant="outline" disabled={!item.trim() || pending}><Plus /> Add</Button>
            </form>
          ) : null}
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`notes-${meeting.id}`} className="text-sm font-semibold">Shared notes</Label>
          <Textarea id={`notes-${meeting.id}`} rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Decisions and follow-ups you both can see" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={pending || notes === meeting.sharedNotes} onClick={() => run("notes", { action: "save_notes", sharedNotes: notes }, "Notes saved")}>Save notes</Button>
            {!completed ? <Button size="sm" disabled={pending} onClick={() => run("complete", { action: "complete_one_on_one" }, "Marked as done")}><Check /> Mark as done</Button> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A person's timeline
// ---------------------------------------------------------------------------

const TIMELINE_LABELS: Record<string, string> = {
  goal: "Goal",
  goal_check_in: "Check-in",
  feedback: "Feedback",
  review: "Review",
  packet: "Results",
  acknowledgement: "Acknowledged",
  one_on_one: "One-on-one",
};

/** Whose timelines the viewer can open: themselves, their reports, and people whose records they can see. */
export function timelineSubjects(program: ProgramSnapshot, members: WorkspaceMember[]) {
  return new Set(members.filter((member) =>
    member.id === program.myMemberId
    || program.directReportIds.includes(member.id)
    || program.timelineReviews.some((review) => review.subjectId === member.id)
    || program.goals.some((goal) => goal.ownerId === member.id),
  ).map((member) => member.id));
}

export function PersonTimeline({ program, members, subjectId }: { program: ProgramSnapshot; members: WorkspaceMember[]; subjectId: string }) {
  const entries = useMemo(() => {
    const names = new Map(members.map((member) => [member.id, member.name]));
    return buildTimeline(subjectId, {
      goals: program.goals,
      feedback: program.feedback,
      reviews: program.timelineReviews,
      packets: program.packets,
      oneOnOnes: program.oneOnOnes.map((meeting) => ({
        ...meeting,
        counterpartName: names.get(meeting.managerId === subjectId ? meeting.reportId : meeting.managerId) ?? "colleague",
      })),
    });
  }, [subjectId, program, members]);

  if (!entries.length) {
    return <EmptyState icon={Timer} title="Nothing on the timeline yet" description="Goals, feedback, reviews and one-on-ones appear here as they happen." />;
  }
  return (
    <ol className="relative grid gap-0 border-l border-border pl-5">
      {entries.map((entry) => (
        <li key={entry.id} className="relative pb-5 last:pb-0">
          <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{TIMELINE_LABELS[entry.kind] ?? entry.kind.replaceAll("_", " ")}</span>
            <time dateTime={entry.at}>{formatDate(entry.at)}</time>
          </div>
          <p className="mt-0.5 text-sm font-medium">{entry.title}</p>
          {entry.detail ? <p className="mt-0.5 text-sm text-muted-foreground whitespace-pre-wrap">{entry.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Reports and export
// ---------------------------------------------------------------------------

export function ReportsPanel({
  organizationId,
  program,
  members,
  canExport,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  canExport: boolean;
}) {
  const action = useAction();
  const [cycleId, setCycleId] = useState(ALL);
  const [teamId, setTeamId] = useState(ALL);
  const [viewId, setViewId] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewShared, setViewShared] = useState(false);
  const growthUrl = `/api/lattice/organizations/${organizationId}/growth`;
  function applyView(id: string) {
    setViewId(id);
    const view = program.reportViews.find((entry) => entry.id === id);
    if (!view) return;
    setCycleId(view.cycleId && program.cycles.some((cycle) => cycle.id === view.cycleId) ? view.cycleId : ALL);
    setTeamId(view.teamId ?? ALL);
  }
  const teams = [...new Map(members.filter((member) => member.teamId).map((member) => [member.teamId!, member.teamName ?? "Team"])).entries()];
  const report = program.reportInput
    ? buildReport(program.reportInput, { cycleId: cycleId === ALL ? null : cycleId, teamId: teamId === ALL ? null : teamId })
    : null;
  const calibrationTotal = report ? Object.values(report.calibration).reduce((sum, value) => sum + value, 0) : 0;
  const selectedView = program.reportViews.find((view) => view.id === viewId);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Cycle" htmlFor="report-cycle">
          <Select value={cycleId} onValueChange={(value) => { setCycleId(value); setViewId(""); }}>
            <SelectTrigger id="report-cycle" className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All cycles</SelectItem>{program.cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Team" htmlFor="report-team">
          <Select value={teamId} onValueChange={(value) => { setTeamId(value); setViewId(""); }}>
            <SelectTrigger id="report-team" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>All teams</SelectItem>{teams.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Saved view" htmlFor="report-view">
          <Select value={viewId} onValueChange={applyView}>
            <SelectTrigger id="report-view" className="w-56"><SelectValue placeholder={program.reportViews.length ? "Choose a saved view" : "No saved views yet"} /></SelectTrigger>
            <SelectContent>{program.reportViews.map((view) => <SelectItem key={view.id} value={view.id}>{view.name}{view.shared ? " · shared" : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {selectedView?.mine ? (
            <Button variant="ghost" disabled={action.pending === "view-delete"} onClick={async () => { if (await action.run("view-delete", () => postJson(growthUrl, { action: "delete_report_view", viewId }), "View deleted")) setViewId(""); }}><X /> Delete view</Button>
          ) : null}
          <Button variant="outline" onClick={() => setSaving(true)}><Plus /> Save view</Button>
          {canExport ? <Button asChild variant="outline"><a href={`/api/lattice/organizations/${organizationId}/export`} download><Download /> Export all data</a></Button> : null}
        </div>
      </div>

      {report ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Review completion" value={`${report.reviews.completion}%`} hint={`${report.reviews.submitted} of ${report.reviews.total} submitted`}>
              <Meter value={report.reviews.completion} label="Review completion" />
            </StatCard>
            <StatCard label="Results acknowledged" value={`${report.packets.acknowledgement}%`} hint={`${report.packets.acknowledged} of ${report.packets.released} released`}>
              <Meter value={report.packets.acknowledgement} label="Results acknowledged" tone="accent" />
            </StatCard>
            <StatCard label="Goals" value={report.goals.total} hint={`${report.goals.at_risk + report.goals.off_track} at risk or off track`} />
            <StatCard label="Feedback" value={report.feedback.total} hint={`${report.feedback.praise} praise · ${report.feedback.constructive} suggestions`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="font-heading text-base">Completion by direction</CardTitle><CardDescription>Submitted reviews out of those assigned</CardDescription></CardHeader>
              <CardContent className="grid gap-3.5">
                {report.byDirection.map((row) => (
                  <div key={row.direction} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                    <span>{REVIEW_DIRECTION_LABELS[row.direction]}</span>
                    <Meter value={row.completion} label={`${row.direction} completion`} />
                    <span className="text-right text-xs text-muted-foreground tabular-nums">{row.submitted}/{row.total}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="font-heading text-base">Calibrated ratings</CardTitle><CardDescription>{calibrationTotal ? `${calibrationTotal} people calibrated` : "No calibrated ratings yet"}</CardDescription></CardHeader>
              <CardContent className="grid gap-3.5">
                {([5, 4, 3, 2, 1] as const).map((rating) => (
                  <div key={rating} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                    <span>Rating {rating}</span>
                    <Meter value={calibrationTotal ? (report.calibration[rating] / calibrationTotal) * 100 : 0} label={`Rating ${rating} share`} tone="accent" />
                    <span className="text-right text-xs text-muted-foreground tabular-nums">{report.calibration[rating]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          {report.byTeam.length ? (
            <Card className="gap-0 py-0">
              <CardHeader className="py-4"><CardTitle className="font-heading text-base">Completion by team</CardTitle></CardHeader>
              <Table>
                <TableHeader><TableRow><TableHead className={cn(head, "pl-4")}>Team</TableHead><TableHead className={head}>Completion</TableHead><TableHead className={cn(head, "pr-4 text-right")}>Submitted</TableHead></TableRow></TableHeader>
                <TableBody>{report.byTeam.map((team) => (
                  <TableRow key={team.teamId}>
                    <TableCell className="pl-4 font-medium">{team.teamName}</TableCell>
                    <TableCell className="w-1/2"><div className="flex items-center gap-3"><Meter value={team.completion} label={`${team.teamName} completion`} /><span className="w-10 text-xs tabular-nums">{team.completion}%</span></div></TableCell>
                    <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">{team.submitted}/{team.total}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </Card>
          ) : <EmptyState icon={Scale} title="No review data for these filters" description="Launch a cycle, or widen the filters, to see completion by team." />}
        </>
      ) : <EmptyState icon={Scale} title="Reports aren't part of your role" description="Ask an owner for “View program reports and analytics”." />}

      <Dialog open={saving} onOpenChange={setSaving}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={async (event) => {
            event.preventDefault();
            const ok = await action.run("view", () => postJson(growthUrl, { action: "save_report_view", name: viewName, cycleId: cycleId === ALL ? null : cycleId, teamId: teamId === ALL ? null : teamId, shared: viewShared }), "View saved");
            if (ok) { setViewName(""); setSaving(false); }
          }}>
            <DialogHeader>
              <DialogTitle>Save this view</DialogTitle>
              <DialogDescription>Keeps the current cycle and team filters under a name.</DialogDescription>
            </DialogHeader>
            <Field label="Name" htmlFor="report-view-name"><Input id="report-view-name" value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Engineering · H2" autoFocus /></Field>
            <Label className="flex items-center gap-2 font-normal"><Checkbox checked={viewShared} onCheckedChange={(checked) => setViewShared(checked === true)} /> Share with everyone who can see reports</Label>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaving(false)}>Cancel</Button>
              <Button type="submit" disabled={viewName.trim().length < 2 || action.pending === "view"}><Plus /> Save view</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Integrations: API keys and signed webhooks
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS = [
  { value: "directory:read", label: "People directory" },
  { value: "cycles:read", label: "Review cycles" },
  { value: "goals:read", label: "Goals" },
] as const;
const EVENT_OPTIONS = [
  { value: "review_cycle.transitioned", label: "A cycle changes phase" },
  { value: "review_packet.acknowledged", label: "Someone acknowledges their results" },
] as const;

export function IntegrationsPanel({
  organizationId,
  integrations,
}: {
  organizationId: string;
  integrations: IntegrationsSnapshot;
}) {
  const action = useAction();
  const url = `/api/lattice/organizations/${organizationId}/integrations`;
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["directory:read"]);
  const [hookUrl, setHookUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENT_OPTIONS.map((option) => option.value));
  const [dialog, setDialog] = useState<"key" | "hook" | null>(null);
  const [revealed, setRevealed] = useState<{ label: string; value: string } | null>(null);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <SectionTitle
          title={<><KeyRound className="size-4 text-primary" aria-hidden="true" /> API keys</>}
          description="Read-only access to your directory, cycles and goals for your HRIS, data warehouse or scripts."
          actions={<Button variant="outline" onClick={() => setDialog("key")}><Plus /> New key</Button>}
        />
        {integrations.apiKeys.length ? (
          <TableShell>
            <Table>
              <TableHeader><TableRow><TableHead className={head}>Name</TableHead><TableHead className={head}>Access</TableHead><TableHead className={head}>Last used</TableHead><TableHead className={head} /></TableRow></TableHeader>
              <TableBody>{integrations.apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell><span className="block font-medium">{key.name}</span><code className="text-xs text-muted-foreground">{key.preview}</code></TableCell>
                  <TableCell className="text-sm">{key.scopes.map((scope) => SCOPE_OPTIONS.find((option) => option.value === scope)?.label ?? scope).join(", ")}</TableCell>
                  <TableCell>{key.revokedAt ? <StatusPill tone="negative">Revoked</StatusPill> : <span className="text-muted-foreground">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}</span>}</TableCell>
                  <TableCell className="text-right">{key.revokedAt ? null : <Button size="sm" variant="ghost" disabled={Boolean(action.pending)} onClick={() => action.run(`revoke-${key.id}`, () => postJson(url, { action: "revoke_api_key", keyId: key.id }), "Key revoked")}><X /> Revoke</Button>}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </TableShell>
        ) : <EmptyState icon={KeyRound} title="No API keys" description="Create a key to read your data from another system." />}
      </section>

      <section className="grid gap-3">
        <SectionTitle
          title={<><Webhook className="size-4 text-primary" aria-hidden="true" /> Webhooks</>}
          description="Get a signed HTTPS request when something happens. Every attempt is logged below."
          actions={<Button variant="outline" onClick={() => setDialog("hook")}><Plus /> New webhook</Button>}
        />
        {integrations.webhooks.length ? integrations.webhooks.map((hook) => (
          <Card key={hook.id} className="gap-3 px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{hook.url}</p>
                <p className="text-sm text-muted-foreground">{hook.events.map((event) => EVENT_OPTIONS.find((option) => option.value === event)?.label ?? event).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={hook.active ? "positive" : "neutral"}>{hook.active ? "Active" : "Paused"}</StatusPill>
                {hook.active ? <Button size="sm" variant="outline" disabled={Boolean(action.pending)} onClick={() => action.run(`test-${hook.id}`, async () => {
                  const result = await postJson(url, { action: "test_webhook", webhookId: hook.id }) as { status: string; error: string };
                  if (result.status !== "delivered") throw new Error(`The test wasn't delivered: ${result.error || "no response"}`);
                }, "Test delivered")}><Send /> Send test</Button> : null}
                <Button size="sm" variant="ghost" disabled={Boolean(action.pending)} onClick={() => action.run(`toggle-${hook.id}`, () => postJson(url, { action: "set_webhook_active", webhookId: hook.id, active: !hook.active }))}>{hook.active ? "Pause" : "Resume"}</Button>
              </div>
            </div>
            {hook.deliveries.length ? (
              <TableShell>
                <Table>
                  <TableHeader><TableRow><TableHead className={head}>Event</TableHead><TableHead className={head}>Result</TableHead><TableHead className={cn(head, "text-right")}>When</TableHead></TableRow></TableHeader>
                  <TableBody>{hook.deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell><code className="text-xs">{delivery.event}</code><span className="block text-xs text-muted-foreground">{delivery.durationMs} ms</span></TableCell>
                      <TableCell>
                        <StatusPill tone={delivery.status === "delivered" ? "positive" : "negative"}>{delivery.status === "delivered" ? "Delivered" : "Failed"}{delivery.httpStatus ? ` · ${delivery.httpStatus}` : ""}</StatusPill>
                        {delivery.error ? <span className="mt-1 block max-w-md truncate text-xs text-muted-foreground">{delivery.error}</span> : null}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(delivery.attemptedAt)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </TableShell>
            ) : <p className="text-sm text-muted-foreground">No deliveries yet. Send a test, or wait for the next event.</p>}
          </Card>
        )) : <EmptyState icon={Webhook} title="No webhooks" description="Point one at your HRIS or chat tool to react when cycles move on." />}
      </section>

      <Dialog open={dialog === "key"} onOpenChange={(open) => setDialog(open ? "key" : null)}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={async (event) => {
            event.preventDefault();
            const ok = await action.run("key", async () => {
              const result = await postJson(url, { action: "create_api_key", name: keyName, scopes }) as { key: string };
              setRevealed({ label: "Your new API key", value: result.key });
              setKeyName("");
            });
            if (ok) setDialog(null);
          }}>
            <DialogHeader><DialogTitle>New API key</DialogTitle><DialogDescription>Keys are read-only. Send them as a Bearer token.</DialogDescription></DialogHeader>
            <Field label="Name" htmlFor="api-key-name"><Input id="api-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="HRIS sync" autoFocus /></Field>
            <div className="grid gap-2">
              <Label>Can read</Label>
              {SCOPE_OPTIONS.map((scope) => (
                <Label key={scope.value} className="flex items-center gap-2 font-normal">
                  <Checkbox checked={scopes.includes(scope.value)} onCheckedChange={(checked) => setScopes((current) => checked ? [...current, scope.value] : current.filter((entry) => entry !== scope.value))} />
                  {scope.label}
                </Label>
              ))}
            </div>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={keyName.trim().length < 2 || !scopes.length || action.pending === "key"}><Plus /> Create key</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "hook"} onOpenChange={(open) => setDialog(open ? "hook" : null)}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={async (event) => {
            event.preventDefault();
            const ok = await action.run("hook", async () => {
              const result = await postJson(url, { action: "create_webhook", url: hookUrl, events }) as { secret: string };
              setRevealed({ label: "Your webhook signing secret", value: result.secret });
              setHookUrl("");
            });
            if (ok) setDialog(null);
          }}>
            <DialogHeader><DialogTitle>New webhook</DialogTitle><DialogDescription>Each request is signed with HMAC-SHA256 using a secret you&apos;ll see once.</DialogDescription></DialogHeader>
            <Field label="Endpoint URL (HTTPS)" htmlFor="webhook-url"><Input id="webhook-url" value={hookUrl} onChange={(event) => setHookUrl(event.target.value)} placeholder="https://example.com/hooks/performance" autoFocus /></Field>
            <div className="grid gap-2">
              <Label>Send when</Label>
              {EVENT_OPTIONS.map((option) => (
                <Label key={option.value} className="flex items-center gap-2 font-normal">
                  <Checkbox checked={events.includes(option.value)} onCheckedChange={(checked) => setEvents((current) => checked ? [...current, option.value] : current.filter((entry) => entry !== option.value))} />
                  {option.label}
                </Label>
              ))}
            </div>
            <InlineError message={action.error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={!hookUrl || !events.length || action.pending === "hook"}><Plus /> Add webhook</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revealed)} onOpenChange={(open) => !open && setRevealed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed?.label}</DialogTitle>
            <DialogDescription>Copy it now. For your security it won&apos;t be shown again.</DialogDescription>
          </DialogHeader>
          <code className="block rounded-lg border border-border bg-muted/60 p-3 text-sm break-all">{revealed?.value}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (revealed) void navigator.clipboard?.writeText(revealed.value).then(() => toast({ title: "Copied" })); }}>Copy</Button>
            <Button onClick={() => setRevealed(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
