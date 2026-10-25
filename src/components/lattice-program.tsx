"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  CircleAlert,
  Download,
  FileCheck2,
  Flag,
  LoaderCircle,
  MessageSquareHeart,
  Plus,
  RotateCcw,
  Scale,
  Send,
  Target,
  Timer,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReport,
  buildTimeline,
  deadlineStatus,
  DEADLINE_STATUS_LABELS,
  GOAL_STATUS_LABELS,
  REVIEW_DIRECTION_LABELS,
  type GoalStatus,
} from "@/lib/lattice/program";
import type { ProgramPacket, ProgramSnapshot } from "@/lib/lattice/program-types";
import { REVIEW_CYCLE_STATE_LABELS, type ReviewCycleState } from "@/lib/lattice/state-machine";
import type { WorkspaceMember } from "@/types/lattice";

const ALL = "__all__";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result;
}

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function run(key: string, callback: () => Promise<unknown>, success?: string) {
    setPending(key);
    setError("");
    setNotice("");
    try {
      await callback();
      if (success) setNotice(success);
      router.refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The action failed.");
      return false;
    } finally {
      setPending("");
    }
  }
  return { pending, error, notice, run, setError };
}

function Feedback({ error, notice }: { error: string; notice: string }) {
  if (error) return <Alert variant="destructive"><CircleAlert /><AlertTitle>Action failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
  if (notice) return <Alert><Check /><AlertTitle>Done</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>;
  return null;
}

function Empty({ icon: Icon, title, copy }: { icon: typeof Users; title: string; copy: string }) {
  return (
    <Card className="lattice-empty-panel">
      <CardContent>
        <Icon aria-hidden="true" />
        <h3>{title}</h3>
        <p>{copy}</p>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="lattice-progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MemberSelect({
  id,
  members,
  value,
  onChange,
  placeholder,
  includeAll,
}: {
  id: string;
  members: Array<Pick<WorkspaceMember, "id" | "name">>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  includeAll?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {includeAll ? <SelectItem value={ALL}>{includeAll}</SelectItem> : null}
        {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Review program: deadlines, reminders, nominations, calibration, packets
// ---------------------------------------------------------------------------

export function ReviewProgramPanel({
  organizationId,
  program,
  members,
  canManage,
  canCalibrate,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  canManage: boolean;
  canCalibrate: boolean;
}) {
  const action = useAction();
  const [nominationCycle, setNominationCycle] = useState<string | null>(null);
  const [nominationSubject, setNominationSubject] = useState("");
  const [nominationPeers, setNominationPeers] = useState<string[]>([]);
  const [reopening, setReopening] = useState<ProgramPacket | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const now = new Date(program.now);
  const activeMembers = members.filter((member) => member.status === "active");
  const nominationSubjects = members.filter((member) =>
    member.id === program.myMemberId || program.directReportIds.includes(member.id) || canManage,
  );
  const cycleUrl = (cycleId: string) => `/api/lattice/organizations/${organizationId}/cycles/${cycleId}/program`;
  const liveCycles = program.cycles.filter((cycle) => cycle.state !== "draft" && cycle.state !== "closed");

  async function submitNomination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nominationCycle) return;
    const ok = await action.run("nominate", () => postJson(cycleUrl(nominationCycle), {
      action: "nominate",
      subjectId: nominationSubject || program.myMemberId,
      peerIds: nominationPeers,
    }), "Peer nominations saved.");
    if (ok) {
      setNominationCycle(null);
      setNominationPeers([]);
    }
  }

  if (!liveCycles.length && !program.packets.length) {
    return <Empty icon={Timer} title="No live review program yet" copy="Launch a draft cycle to open peer nomination, deadlines, reminders, calibration, and review packets." />;
  }

  return (
    <section className="lattice-review-stack">
      <Feedback error={action.error} notice={action.notice} />
      {liveCycles.map((cycle) => {
        const progress = program.progress.filter((entry) => entry.cycleId === cycle.id);
        const outstanding = progress.reduce((sum, entry) => sum + entry.outstanding, 0);
        const submitted = progress.reduce((sum, entry) => sum + entry.submitted, 0);
        const status = deadlineStatus(cycle.dueDate, now, canManage ? outstanding === 0 && submitted > 0 : false);
        const nominations = program.nominations.filter((entry) => entry.cycleId === cycle.id);
        const calibration = program.calibration.filter((entry) => entry.cycleId === cycle.id);
        const packets = program.packets.filter((entry) => entry.cycleId === cycle.id && entry.subjectId !== program.myMemberId);
        return (
          <Card key={cycle.id}>
            <CardHeader>
              <div className="lattice-card-heading-row">
                <div>
                  <CardTitle>{cycle.name}</CardTitle>
                  <CardDescription>
                    {REVIEW_CYCLE_STATE_LABELS[cycle.state as ReviewCycleState] ?? cycle.state} · deadline {cycle.dueDate ? formatDate(cycle.dueDate) : "not set"}
                    {cycle.lastRemindedAt ? ` · last reminded ${formatDate(cycle.lastRemindedAt)}` : ""}
                  </CardDescription>
                </div>
                <Badge variant={status === "overdue" ? "destructive" : status === "due_soon" ? "default" : "outline"}>
                  <CalendarClock /> {DEADLINE_STATUS_LABELS[status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="lattice-form-stack">
              {canManage ? (
                <form
                  className="lattice-inline-actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = String(new FormData(event.currentTarget).get("dueDate") ?? "");
                    void action.run(`deadline-${cycle.id}`, () => postJson(cycleUrl(cycle.id), { action: "set_deadline", dueDate: value || null }), "Deadline updated.");
                  }}
                >
                  <Label htmlFor={`deadline-${cycle.id}`} className="sr-only">Deadline</Label>
                  <Input id={`deadline-${cycle.id}`} name="dueDate" type="date" defaultValue={cycle.dueDate ?? ""} className="lattice-date-input" />
                  <Button type="submit" variant="outline" disabled={action.pending === `deadline-${cycle.id}`}><CalendarClock /> Save deadline</Button>
                  {cycle.state === "review_writing" ? (
                    <Button
                      type="button"
                      onClick={() => action.run(`remind-${cycle.id}`, async () => {
                        const result = await postJson(cycleUrl(cycle.id), { action: "send_reminders" });
                        action.setError("");
                        return result;
                      }, "Reminders sent. Overdue reviewers were escalated to their managers.")}
                      disabled={action.pending === `remind-${cycle.id}` || outstanding === 0}
                    >
                      {action.pending === `remind-${cycle.id}` ? <LoaderCircle className="animate-spin" /> : <Bell />} Remind {outstanding} outstanding
                    </Button>
                  ) : null}
                </form>
              ) : null}

              {canManage && progress.length ? (
                <div className="lattice-table-card">
                  <Table>
                    <TableHeader><TableRow><TableHead>Reviewer</TableHead><TableHead>Submitted</TableHead><TableHead>Outstanding</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {progress.map((entry) => {
                        const reviewerStatus = deadlineStatus(cycle.dueDate, now, entry.outstanding === 0);
                        return (
                          <TableRow key={entry.reviewerId}>
                            <TableCell><strong>{entry.reviewerName}</strong></TableCell>
                            <TableCell>{entry.submitted}</TableCell>
                            <TableCell>{entry.outstanding}</TableCell>
                            <TableCell><Badge variant={reviewerStatus === "overdue" ? "destructive" : "secondary"}>{DEADLINE_STATUS_LABELS[reviewerStatus]}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {cycle.peerNominationEnabled && (cycle.state === "peer_nomination" || nominations.length) ? (
                <div className="lattice-program-block">
                  <div className="lattice-subheading">
                    <h3><UserPlus aria-hidden="true" /> Peer nominations</h3>
                    {cycle.state === "peer_nomination" ? (
                      <Button size="sm" variant="outline" onClick={() => { setNominationCycle(cycle.id); setNominationSubject(program.myMemberId ?? ""); setNominationPeers([]); }}>
                        <Plus /> Nominate peers
                      </Button>
                    ) : null}
                  </div>
                  {nominations.length ? (
                    <div className="lattice-table-card">
                      <Table>
                        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Peer</TableHead><TableHead>State</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {nominations.map((nomination) => (
                            <TableRow key={nomination.id}>
                              <TableCell><strong>{nomination.subjectName}</strong><span>by {nomination.nominatedByName || "—"}</span></TableCell>
                              <TableCell>{nomination.peerName}</TableCell>
                              <TableCell><Badge variant={nomination.state === "approved" ? "default" : nomination.state === "declined" ? "destructive" : "secondary"}>{nomination.state}</Badge></TableCell>
                              <TableCell>
                                {nomination.canDecide && cycle.state === "peer_nomination" ? (
                                  <div className="lattice-inline-actions">
                                    <Button size="sm" variant="outline" aria-label={`Approve ${nomination.peerName}`} disabled={Boolean(action.pending) || nomination.state === "approved"} onClick={() => action.run(`decide-${nomination.id}`, () => postJson(cycleUrl(cycle.id), { action: "decide_nomination", nominationId: nomination.id, decision: "approved" }))}><Check /></Button>
                                    <Button size="sm" variant="outline" aria-label={`Decline ${nomination.peerName}`} disabled={Boolean(action.pending) || nomination.state === "declined"} onClick={() => action.run(`decide-${nomination.id}`, () => postJson(cycleUrl(cycle.id), { action: "decide_nomination", nominationId: nomination.id, decision: "declined" }))}><X /></Button>
                                  </div>
                                ) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : <p className="lattice-muted">No nominations yet. Employees nominate peers; managers approve or decline before writing opens.</p>}
                </div>
              ) : null}

              {canCalibrate && cycle.state === "calibration" ? (
                <div className="lattice-program-block">
                  <div className="lattice-subheading"><h3><Scale aria-hidden="true" /> Calibration</h3><Badge variant="outline">{calibration.filter((row) => row.rating !== null).length}/{calibration.length} calibrated</Badge></div>
                  {calibration.length ? (
                    <div className="lattice-table-card">
                      <Table>
                        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Review signal</TableHead><TableHead>Calibrated rating</TableHead><TableHead>Calibration note</TableHead><TableHead /></TableRow></TableHeader>
                        <TableBody>
                          {calibration.map((row) => <CalibrationRow key={row.subjectId} row={row} pending={action.pending === `calibrate-${row.subjectId}`} onSave={(rating, note) => action.run(`calibrate-${row.subjectId}`, () => postJson(cycleUrl(cycle.id), { action: "calibrate", subjectId: row.subjectId, rating, note }), "Calibration saved.")} />)}
                        </TableBody>
                      </Table>
                    </div>
                  ) : <p className="lattice-muted">No reviews were assigned in this cycle.</p>}
                </div>
              ) : null}

              {packets.length ? (
                <div className="lattice-program-block">
                  <div className="lattice-subheading"><h3><FileCheck2 aria-hidden="true" /> Review packets</h3><Badge variant="outline">{packets.filter((packet) => packet.state === "acknowledged").length}/{packets.length} acknowledged</Badge></div>
                  <div className="lattice-table-card">
                    <Table>
                      <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Rating</TableHead><TableHead>State</TableHead><TableHead>Acknowledged</TableHead><TableHead /></TableRow></TableHeader>
                      <TableBody>
                        {packets.map((packet) => (
                          <TableRow key={packet.subjectId}>
                            <TableCell><strong>{packet.subjectName}</strong><span>{packet.content.sections.length} review sections{packet.reopenCount ? ` · reopened ${packet.reopenCount}×` : ""}</span></TableCell>
                            <TableCell>{packet.content.calibratedRating ?? "—"}</TableCell>
                            <TableCell><Badge variant={packet.state === "acknowledged" ? "default" : "secondary"}>{packet.state}</Badge></TableCell>
                            <TableCell>{packet.acknowledgedAt ? formatDate(packet.acknowledgedAt) : "—"}</TableCell>
                            <TableCell>
                              {canCalibrate && packet.state === "acknowledged" && cycle.state === "acknowledgement" ? (
                                <Button size="sm" variant="outline" onClick={() => { setReopening(packet); setReopenReason(""); }}><RotateCcw /> Reopen</Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={Boolean(nominationCycle)} onOpenChange={(open) => !open && setNominationCycle(null)}>
        <DialogContent>
          <form onSubmit={submitNomination}>
            <DialogHeader>
              <DialogTitle>Nominate peers</DialogTitle>
              <DialogDescription>Managers&apos; nominations are approved immediately. Employee nominations wait for manager approval.</DialogDescription>
            </DialogHeader>
            <div className="lattice-form-stack">
              <div className="grid gap-2">
                <Label htmlFor="nomination-subject">Employee being reviewed</Label>
                <MemberSelect id="nomination-subject" members={nominationSubjects} value={nominationSubject} onChange={setNominationSubject} placeholder="Choose an employee" />
              </div>
              <div className="grid gap-2">
                <Label>Peers (up to 5)</Label>
                <div className="lattice-peer-grid">
                  {activeMembers.filter((member) => member.id !== nominationSubject).map((member) => (
                    <Label key={member.id} className="checkbox-label">
                      <Checkbox
                        checked={nominationPeers.includes(member.id)}
                        disabled={!nominationPeers.includes(member.id) && nominationPeers.length >= 5}
                        onCheckedChange={(checked) => setNominationPeers((current) => checked ? [...current, member.id] : current.filter((id) => id !== member.id))}
                      />
                      {member.name}
                    </Label>
                  ))}
                </div>
                {activeMembers.length < 2 ? <p className="lattice-muted">Only members who have joined the workspace can be nominated.</p> : null}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNominationCycle(null)}>Cancel</Button>
              <Button type="submit" disabled={!nominationPeers.length || !nominationSubject || action.pending === "nominate"}>{action.pending === "nominate" ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Save nominations</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reopening)} onOpenChange={(open) => !open && setReopening(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen {reopening?.subjectName}&apos;s packet</DialogTitle>
            <DialogDescription>The previous acknowledgement is kept in the packet history and the audit log. The employee must acknowledge again.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea id="reopen-reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Corrected the calibrated rating after an appeal" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopening(null)}>Cancel</Button>
            <Button
              disabled={reopenReason.trim().length < 3 || action.pending === "reopen"}
              onClick={async () => {
                if (!reopening) return;
                const ok = await action.run("reopen", () => postJson(cycleUrl(reopening.cycleId), { action: "reopen_packet", subjectId: reopening.subjectId, reason: reopenReason }), "Packet reopened for acknowledgement.");
                if (ok) setReopening(null);
              }}
            >
              <RotateCcw /> Reopen packet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
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
      <TableCell><strong>{row.subjectName}</strong><span>{row.summary.submittedReviews}/{row.summary.totalReviews} reviews submitted</span></TableCell>
      <TableCell><strong>{row.summary.average ?? "No ratings"}</strong><span>{signal || "No rating questions answered"}</span></TableCell>
      <TableCell>
        <Select value={rating} onValueChange={setRating}>
          <SelectTrigger aria-label={`Calibrated rating for ${row.subjectName}`}><SelectValue placeholder="Rate 1–5" /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5].map((value) => <SelectItem key={value} value={String(value)}>{value}</SelectItem>)}</SelectContent>
        </Select>
      </TableCell>
      <TableCell><Input aria-label={`Calibration note for ${row.subjectName}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Private to calibrators" /></TableCell>
      <TableCell><Button size="sm" onClick={() => onSave(rating ? Number(rating) : null, note)} disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />} Save</Button></TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// My packets and inbox (overview)
// ---------------------------------------------------------------------------

export function MyProgramPanel({ organizationId, program }: { organizationId: string; program: ProgramSnapshot }) {
  const action = useAction();
  const [comment, setComment] = useState<Record<string, string>>({});
  const myPackets = program.packets.filter((packet) => packet.subjectId === program.myMemberId);
  const unread = program.notifications.filter((notification) => !notification.read);
  const cycleState = new Map(program.cycles.map((cycle) => [cycle.id, cycle.state]));

  return (
    <div className="lattice-overview-grid">
      <Card>
        <CardHeader>
          <div className="lattice-card-heading-row">
            <div><CardTitle><Bell aria-hidden="true" /> Inbox</CardTitle><CardDescription>Reminders, escalations, and released packets.</CardDescription></div>
            {unread.length ? <Button size="sm" variant="outline" disabled={action.pending === "read"} onClick={() => action.run("read", () => postJson(`/api/lattice/organizations/${organizationId}/growth`, { action: "mark_notifications_read" }))}><Check /> Mark read</Button> : null}
          </div>
        </CardHeader>
        <CardContent className="lattice-activity-list">
          {program.notifications.length ? program.notifications.slice(0, 8).map((notification) => (
            <div key={notification.id} className={notification.read ? "lattice-notification is-read" : "lattice-notification"}>
              <Badge variant={notification.kind === "escalation" ? "destructive" : "secondary"}>{notification.kind}</Badge>
              <div><strong>{notification.title}</strong><span>{notification.body}</span></div>
            </div>
          )) : <p className="lattice-muted">Nothing waiting. Review reminders and escalations land here.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle><FileCheck2 aria-hidden="true" /> My review packets</CardTitle><CardDescription>Read your released review and acknowledge it.</CardDescription></CardHeader>
        <CardContent className="lattice-form-stack">
          <Feedback error={action.error} notice={action.notice} />
          {myPackets.length ? myPackets.map((packet) => (
            <article key={packet.cycleId} className="lattice-packet">
              <div className="lattice-card-heading-row">
                <div><h4>{packet.cycleName}</h4><p className="lattice-muted">Released {formatDate(packet.releasedAt)}</p></div>
                <Badge variant={packet.state === "acknowledged" ? "default" : "secondary"}>{packet.state === "acknowledged" ? "Acknowledged" : "Awaiting acknowledgement"}</Badge>
              </div>
              {packet.content.calibratedRating ? <p><strong>Calibrated rating:</strong> {packet.content.calibratedRating} / 5</p> : null}
              {packet.content.sections.length ? packet.content.sections.map((section, index) => (
                <section key={`${section.reviewerLabel}-${index}`} className="lattice-packet-section">
                  <h5>{section.reviewerLabel}</h5>
                  {section.answers.map((answer) => <p key={answer.questionId}><span>{answer.prompt}</span>{answer.value}</p>)}
                </section>
              )) : <p className="lattice-muted">No submitted reviews were included in this packet.</p>}
              {packet.state === "released" && cycleState.get(packet.cycleId) === "acknowledgement" ? (
                <div className="lattice-form-stack">
                  <Label htmlFor={`ack-${packet.cycleId}`}>Optional comment</Label>
                  <Textarea id={`ack-${packet.cycleId}`} value={comment[packet.cycleId] ?? ""} onChange={(event) => setComment((current) => ({ ...current, [packet.cycleId]: event.target.value }))} placeholder="Anything you want on record alongside your acknowledgement" />
                  <Button disabled={action.pending === `ack-${packet.cycleId}`} onClick={() => action.run(`ack-${packet.cycleId}`, () => postJson(`/api/lattice/organizations/${organizationId}/cycles/${packet.cycleId}/program`, { action: "acknowledge", comment: comment[packet.cycleId] ?? "" }), "Packet acknowledged.")}>
                    {action.pending === `ack-${packet.cycleId}` ? <LoaderCircle className="animate-spin" /> : <Check />} Acknowledge packet
                  </Button>
                </div>
              ) : packet.acknowledgementComment ? <p className="lattice-muted">Your comment: {packet.acknowledgementComment}</p> : null}
            </article>
          )) : <p className="lattice-muted">Packets appear here when a cycle reaches acknowledgement.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Growth: goals, feedback, one-to-ones
// ---------------------------------------------------------------------------

export function GrowthPanel({
  organizationId,
  program,
  members,
  canManage,
}: {
  organizationId: string;
  program: ProgramSnapshot;
  members: WorkspaceMember[];
  canManage: boolean;
}) {
  const action = useAction();
  const url = `/api/lattice/organizations/${organizationId}/growth`;
  const me = program.myMemberId;
  const goalOwners = members.filter((member) => member.id === me || program.directReportIds.includes(member.id) || canManage);
  const [goalOwner, setGoalOwner] = useState(me ?? "");
  const [goalVisibility, setGoalVisibility] = useState("public");
  const [feedbackRecipient, setFeedbackRecipient] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("praise");
  const [feedbackVisibility, setFeedbackVisibility] = useState("private");
  const [meetingCounterpart, setMeetingCounterpart] = useState("");
  const myManagerId = members.find((member) => member.id === me)?.managerId ?? null;
  const counterparts = members.filter((member) => member.id === myManagerId || program.directReportIds.includes(member.id));

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
    }), "Goal created.");
    if (ok) form.reset();
  }

  async function giveFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await action.run("feedback", () => postJson(url, {
      action: "give_feedback",
      recipientId: feedbackRecipient,
      kind: feedbackKind,
      body: new FormData(form).get("body"),
      visibility: feedbackVisibility,
    }), "Feedback shared.");
    if (ok) form.reset();
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action.run("meeting", () => postJson(url, {
      action: "schedule_one_on_one",
      counterpartId: meetingCounterpart,
      scheduledFor: new FormData(event.currentTarget).get("scheduledFor"),
    }), "One-to-one scheduled.");
  }

  return (
    <div className="lattice-review-stack">
      <Feedback error={action.error} notice={action.notice} />
      <div className="lattice-builder-grid">
        <Card>
          <CardHeader><CardTitle><Target aria-hidden="true" /> Set a goal</CardTitle><CardDescription>For yourself or a direct report. Manager-only goals are hidden from peers.</CardDescription></CardHeader>
          <CardContent>
            <form className="lattice-form-stack" onSubmit={createGoal}>
              <div className="grid gap-2"><Label htmlFor="goal-owner">Owner</Label><MemberSelect id="goal-owner" members={goalOwners} value={goalOwner} onChange={setGoalOwner} placeholder="Choose an owner" /></div>
              <div className="grid gap-2"><Label htmlFor="goal-title">Goal</Label><Input id="goal-title" name="title" placeholder="Ship self-serve onboarding" required minLength={3} /></div>
              <div className="grid gap-2"><Label htmlFor="goal-description">Definition of done</Label><Textarea id="goal-description" name="description" placeholder="Activation rate above 40% for new workspaces" /></div>
              <div className="lattice-two-field-grid">
                <div className="grid gap-2"><Label htmlFor="goal-due">Due</Label><Input id="goal-due" name="dueDate" type="date" /></div>
                <div className="grid gap-2"><Label htmlFor="goal-visibility">Visibility</Label><Select value={goalVisibility} onValueChange={setGoalVisibility}><SelectTrigger id="goal-visibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Everyone</SelectItem><SelectItem value="manager">Owner and manager</SelectItem></SelectContent></Select></div>
              </div>
              <Button type="submit" disabled={action.pending === "goal" || !goalOwner}>{action.pending === "goal" ? <LoaderCircle className="animate-spin" /> : <Plus />} Create goal</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle><MessageSquareHeart aria-hidden="true" /> Give feedback</CardTitle><CardDescription>Feedback text never enters the audit log; only the fact that it was given.</CardDescription></CardHeader>
          <CardContent>
            <form className="lattice-form-stack" onSubmit={giveFeedback}>
              <div className="grid gap-2"><Label htmlFor="feedback-recipient">Recipient</Label><MemberSelect id="feedback-recipient" members={members.filter((member) => member.id !== me)} value={feedbackRecipient} onChange={setFeedbackRecipient} placeholder="Choose a colleague" /></div>
              <div className="lattice-two-field-grid">
                <div className="grid gap-2"><Label htmlFor="feedback-kind">Type</Label><Select value={feedbackKind} onValueChange={setFeedbackKind}><SelectTrigger id="feedback-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="praise">Praise</SelectItem><SelectItem value="constructive">Constructive</SelectItem></SelectContent></Select></div>
                <div className="grid gap-2"><Label htmlFor="feedback-visibility">Visible to</Label><Select value={feedbackVisibility} onValueChange={setFeedbackVisibility}><SelectTrigger id="feedback-visibility"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Recipient only</SelectItem><SelectItem value="manager">Recipient and manager</SelectItem><SelectItem value="public">Everyone</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="feedback-body">Feedback</Label><Textarea id="feedback-body" name="body" placeholder="Specific, observable, and kind" required minLength={3} /></div>
              <Button type="submit" disabled={action.pending === "feedback" || !feedbackRecipient}>{action.pending === "feedback" ? <LoaderCircle className="animate-spin" /> : <Send />} Share feedback</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="lattice-subheading"><h3>Goals</h3><Badge variant="outline">{program.goals.length}</Badge></div>
      {program.goals.length ? program.goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} canCheckIn={goal.ownerId === me || program.directReportIds.includes(goal.ownerId) || canManage} pending={action.pending === `goal-${goal.id}`} onCheckIn={(progress, status, note) => action.run(`goal-${goal.id}`, () => postJson(url, { action: "check_in_goal", goalId: goal.id, progress, status, note }), "Check-in recorded.")} />
      )) : <Empty icon={Target} title="No goals yet" copy="Set the first goal above. Goals and their check-ins feed the employee timeline and reports." />}

      <div className="lattice-subheading"><h3>Feedback</h3><Badge variant="outline">{program.feedback.length}</Badge></div>
      {program.feedback.length ? (
        <Card><CardContent className="lattice-table-card"><Table>
          <TableHeader><TableRow><TableHead>From → to</TableHead><TableHead>Feedback</TableHead><TableHead>Visibility</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>{program.feedback.map((item) => (
            <TableRow key={item.id}>
              <TableCell><strong>{item.authorName} → {item.recipientName}</strong><span>{item.kind}</span></TableCell>
              <TableCell className="lattice-wrap-cell">{item.body}</TableCell>
              <TableCell><Badge variant="secondary">{item.visibility}</Badge></TableCell>
              <TableCell>{formatDate(item.createdAt)}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></CardContent></Card>
      ) : <Empty icon={MessageSquareHeart} title="No feedback yet" copy="Feedback you give or receive appears here, respecting each item's visibility." />}

      <div className="lattice-subheading"><h3>One-to-ones</h3><Badge variant="outline">{program.oneOnOnes.length}</Badge></div>
      {counterparts.length ? (
        <Card><CardContent>
          <form className="lattice-inline-actions lattice-meeting-form" onSubmit={schedule}>
            <div className="grid gap-2"><Label htmlFor="meeting-counterpart">With</Label><MemberSelect id="meeting-counterpart" members={counterparts} value={meetingCounterpart} onChange={setMeetingCounterpart} placeholder="Manager or report" /></div>
            <div className="grid gap-2"><Label htmlFor="meeting-date">Date</Label><Input id="meeting-date" name="scheduledFor" type="date" required /></div>
            <Button type="submit" disabled={!meetingCounterpart || action.pending === "meeting"}><CalendarClock /> Schedule</Button>
          </form>
        </CardContent></Card>
      ) : <p className="lattice-muted">One-to-ones are between an employee and their manager. Add reporting lines in the directory import to schedule one.</p>}
      {program.oneOnOnes.map((meeting) => (
        <MeetingCard key={meeting.id} meeting={meeting} pending={action.pending.startsWith(`meeting-${meeting.id}`)} run={(key, body, success) => action.run(`meeting-${meeting.id}-${key}`, () => postJson(url, { ...body, meetingId: meeting.id }), success)} />
      ))}
    </div>
  );
}

function GoalCard({
  goal,
  canCheckIn,
  pending,
  onCheckIn,
}: {
  goal: ProgramSnapshot["goals"][number];
  canCheckIn: boolean;
  pending: boolean;
  onCheckIn: (progress: number, status: GoalStatus, note: string) => void;
}) {
  const [progress, setProgress] = useState(String(goal.progress));
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [note, setNote] = useState("");
  return (
    <Card>
      <CardHeader>
        <div className="lattice-card-heading-row">
          <div><CardTitle>{goal.title}</CardTitle><CardDescription>{goal.ownerName} · due {formatDate(goal.dueDate)} · {goal.visibility === "manager" ? "owner and manager" : "everyone"}</CardDescription></div>
          <Badge variant={goal.status === "off_track" ? "destructive" : goal.status === "done" ? "default" : "secondary"}><Flag /> {GOAL_STATUS_LABELS[goal.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="lattice-form-stack">
        {goal.description ? <p className="lattice-muted">{goal.description}</p> : null}
        <ProgressBar value={goal.progress} label={`${goal.title} progress`} />
        <p className="lattice-muted">{goal.progress}% · {goal.checkIns.length} check-in{goal.checkIns.length === 1 ? "" : "s"}</p>
        {canCheckIn ? (
          <div className="lattice-inline-actions lattice-checkin-row">
            <Input aria-label="Progress percent" type="number" min={0} max={100} value={progress} onChange={(event) => setProgress(event.target.value)} className="lattice-number-input" />
            <Select value={status} onValueChange={(value) => setStatus(value as GoalStatus)}>
              <SelectTrigger aria-label="Goal status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Check-in note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed?" />
            <Button disabled={pending} onClick={() => { onCheckIn(Math.max(0, Math.min(100, Number(progress) || 0)), status, note); setNote(""); }}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />} Check in</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MeetingCard({
  meeting,
  pending,
  run,
}: {
  meeting: ProgramSnapshot["oneOnOnes"][number];
  pending: boolean;
  run: (key: string, body: Record<string, unknown>, success?: string) => Promise<boolean>;
}) {
  const [item, setItem] = useState("");
  const [notes, setNotes] = useState(meeting.sharedNotes);
  const completed = meeting.status === "completed";
  return (
    <Card>
      <CardHeader>
        <div className="lattice-card-heading-row">
          <div><CardTitle>{meeting.managerName} · {meeting.reportName}</CardTitle><CardDescription>{formatDate(meeting.scheduledFor)}</CardDescription></div>
          <Badge variant={completed ? "default" : "secondary"}>{completed ? "Completed" : "Scheduled"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="lattice-form-stack">
        <div>
          <h4>Shared agenda</h4>
          {meeting.agenda.length ? (
            <ul className="lattice-agenda">
              {meeting.agenda.map((entry) => (
                <li key={entry.id}>
                  <Label className="checkbox-label">
                    <Checkbox checked={entry.done} disabled={completed || pending} onCheckedChange={() => run("toggle", { action: "toggle_agenda_item", itemId: entry.id })} />
                    <span className={entry.done ? "is-done" : ""}>{entry.text}</span>
                  </Label>
                  <small>{entry.authorName}</small>
                </li>
              ))}
            </ul>
          ) : <p className="lattice-muted">No agenda items yet. Either participant can add one.</p>}
          {!completed ? (
            <form className="lattice-inline-actions" onSubmit={async (event) => { event.preventDefault(); if (await run("agenda", { action: "add_agenda_item", text: item })) setItem(""); }}>
              <Input aria-label="New agenda item" value={item} onChange={(event) => setItem(event.target.value)} placeholder="Topic to discuss" />
              <Button type="submit" variant="outline" disabled={!item.trim() || pending}><Plus /> Add</Button>
            </form>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`notes-${meeting.id}`}>Shared notes</Label>
          <Textarea id={`notes-${meeting.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Decisions and follow-ups both participants can see" />
        </div>
        <div className="lattice-inline-actions">
          <Button variant="outline" disabled={pending || notes === meeting.sharedNotes} onClick={() => run("notes", { action: "save_notes", sharedNotes: notes }, "Notes saved.")}>Save notes</Button>
          {!completed ? <Button disabled={pending} onClick={() => run("complete", { action: "complete_one_on_one" }, "One-to-one completed.")}><Check /> Mark complete</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Employee timeline
// ---------------------------------------------------------------------------

export function TimelinePanel({ program, members }: { program: ProgramSnapshot; members: WorkspaceMember[] }) {
  const visible = members.filter((member) =>
    member.id === program.myMemberId
    || program.directReportIds.includes(member.id)
    || program.timelineReviews.some((review) => review.subjectId === member.id)
    || program.goals.some((goal) => goal.ownerId === member.id),
  );
  const [subjectId, setSubjectId] = useState(program.myMemberId ?? visible[0]?.id ?? "");
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

  return (
    <div className="lattice-review-stack">
      <Card>
        <CardHeader><CardTitle>Employee evidence timeline</CardTitle><CardDescription>Goals, check-ins, feedback, submitted reviews, packets, and one-to-ones you are allowed to see — newest first.</CardDescription></CardHeader>
        <CardContent className="lattice-simulator">
          <div className="grid gap-2"><Label htmlFor="timeline-subject">Employee</Label><MemberSelect id="timeline-subject" members={visible} value={subjectId} onChange={setSubjectId} placeholder="Choose an employee" /></div>
        </CardContent>
      </Card>
      {entries.length ? (
        <ol className="lattice-timeline">
          {entries.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.at}>{formatDate(entry.at)}</time>
              <div><Badge variant="outline">{entry.kind.replaceAll("_", " ")}</Badge><strong>{entry.title}</strong>{entry.detail ? <p>{entry.detail}</p> : null}</div>
            </li>
          ))}
        </ol>
      ) : <Empty icon={Timer} title="No evidence yet" copy="Set a goal, give feedback, or complete a review cycle and it will appear on this timeline." />}
    </div>
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
  const [cycleId, setCycleId] = useState(ALL);
  const [teamId, setTeamId] = useState(ALL);
  const teams = [...new Map(members.filter((member) => member.teamId).map((member) => [member.teamId!, member.teamName ?? "Team"])).entries()];
  const report = program.reportInput
    ? buildReport(program.reportInput, { cycleId: cycleId === ALL ? null : cycleId, teamId: teamId === ALL ? null : teamId })
    : null;

  return (
    <div className="lattice-review-stack">
      <Card>
        <CardHeader>
          <div className="lattice-card-heading-row">
            <div><CardTitle><BarChart3 aria-hidden="true" /> Program report</CardTitle><CardDescription>Filters apply to every figure below. Feedback text and review answers never leave their records.</CardDescription></div>
            {canExport ? <Button asChild variant="outline"><a href={`/api/lattice/organizations/${organizationId}/export`} download><Download /> Export workspace (v1.0.0)</a></Button> : null}
          </div>
        </CardHeader>
        <CardContent className="lattice-two-field-grid">
          <div className="grid gap-2"><Label htmlFor="report-cycle">Cycle</Label><Select value={cycleId} onValueChange={setCycleId}><SelectTrigger id="report-cycle"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All cycles</SelectItem>{program.cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2"><Label htmlFor="report-team">Team</Label><Select value={teamId} onValueChange={setTeamId}><SelectTrigger id="report-team"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>All teams</SelectItem>{teams.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></div>
        </CardContent>
      </Card>
      {report ? (
        <>
          <div className="lattice-stat-grid">
            <Card><CardHeader><CardDescription>Review completion</CardDescription><CardTitle>{report.reviews.completion}%</CardTitle></CardHeader><CardContent>{report.reviews.submitted}/{report.reviews.total} submitted</CardContent></Card>
            <Card><CardHeader><CardDescription>Packets acknowledged</CardDescription><CardTitle>{report.packets.acknowledgement}%</CardTitle></CardHeader><CardContent>{report.packets.acknowledged}/{report.packets.released} released</CardContent></Card>
            <Card><CardHeader><CardDescription>Goals</CardDescription><CardTitle>{report.goals.total}</CardTitle></CardHeader><CardContent>{report.goals.at_risk + report.goals.off_track} at risk or off track</CardContent></Card>
            <Card><CardHeader><CardDescription>Feedback</CardDescription><CardTitle>{report.feedback.total}</CardTitle></CardHeader><CardContent>{report.feedback.praise} praise · {report.feedback.constructive} constructive</CardContent></Card>
          </div>
          <div className="lattice-builder-grid">
            <Card>
              <CardHeader><CardTitle>Completion by direction</CardTitle></CardHeader>
              <CardContent className="lattice-form-stack">
                {report.byDirection.map((row) => (
                  <div key={row.direction} className="lattice-bar-row">
                    <span>{REVIEW_DIRECTION_LABELS[row.direction]}</span>
                    <ProgressBar value={row.completion} label={`${row.direction} completion`} />
                    <small>{row.submitted}/{row.total}</small>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Calibrated rating distribution</CardTitle></CardHeader>
              <CardContent className="lattice-form-stack">
                {([5, 4, 3, 2, 1] as const).map((rating) => {
                  const total = Object.values(report.calibration).reduce((sum, value) => sum + value, 0);
                  return (
                    <div key={rating} className="lattice-bar-row">
                      <span>Rating {rating}</span>
                      <ProgressBar value={total ? Math.round((report.calibration[rating] / total) * 100) : 0} label={`Rating ${rating} share`} />
                      <small>{report.calibration[rating]}</small>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          {report.byTeam.length ? (
            <Card><CardHeader><CardTitle>Completion by team</CardTitle></CardHeader><CardContent className="lattice-table-card"><Table>
              <TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Submitted</TableHead><TableHead>Assigned</TableHead><TableHead>Completion</TableHead></TableRow></TableHeader>
              <TableBody>{report.byTeam.map((team) => <TableRow key={team.teamId}><TableCell><strong>{team.teamName}</strong></TableCell><TableCell>{team.submitted}</TableCell><TableCell>{team.total}</TableCell><TableCell>{team.completion}%</TableCell></TableRow>)}</TableBody>
            </Table></CardContent></Card>
          ) : <Empty icon={BarChart3} title="No review data for this filter" copy="Launch a cycle or widen the filters to see completion by team." />}
        </>
      ) : <Empty icon={BarChart3} title="Reports need the report permission" copy="Ask a workspace owner for “View program reports and analytics”." />}
    </div>
  );
}
