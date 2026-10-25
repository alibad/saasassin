import type {
  GoalStatus,
  NominationState,
  RatingSummary,
  ReportInput,
  ReviewDirection,
  ReviewPacketContent,
} from "@/lib/lattice/program";

export type ProgramNomination = {
  id: string;
  cycleId: string;
  subjectId: string;
  subjectName: string;
  peerId: string;
  peerName: string;
  state: NominationState;
  nominatedByName: string;
  canDecide: boolean;
};

export type ProgramReviewProgress = {
  cycleId: string;
  reviewerId: string;
  reviewerName: string;
  outstanding: number;
  submitted: number;
};

export type ProgramCalibrationRow = {
  cycleId: string;
  subjectId: string;
  subjectName: string;
  summary: RatingSummary;
  rating: number | null;
  note: string;
};

export type ProgramPacket = {
  cycleId: string;
  cycleName: string;
  subjectId: string;
  subjectName: string;
  state: "released" | "acknowledged" | "withdrawn";
  content: ReviewPacketContent;
  releasedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgementComment: string;
  reopenCount: number;
};

export type ProgramGoal = {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  dueDate: string | null;
  progress: number;
  status: GoalStatus;
  visibility: "public" | "manager";
  createdAt: string | null;
  checkIns: Array<{ at: string; progress: number; status: GoalStatus; note: string }>;
};

export type ProgramFeedback = {
  id: string;
  authorId: string;
  authorName: string;
  recipientId: string;
  recipientName: string;
  kind: "praise" | "constructive";
  body: string;
  visibility: "private" | "manager" | "public";
  createdAt: string | null;
};

export type ProgramOneOnOne = {
  id: string;
  managerId: string;
  managerName: string;
  reportId: string;
  reportName: string;
  scheduledFor: string;
  status: "scheduled" | "completed";
  agenda: Array<{ id: string; text: string; authorName: string; done: boolean }>;
  sharedNotes: string;
};

export type ProgramNotification = {
  id: string;
  kind: "reminder" | "escalation" | "packet_released" | "nomination";
  title: string;
  body: string;
  createdAt: string | null;
  read: boolean;
};

export type ProgramCycleMeta = {
  id: string;
  name: string;
  state: string;
  dueDate: string | null;
  directions: ReviewDirection[];
  peerNominationEnabled: boolean;
  calibrationEnabled: boolean;
  lastRemindedAt: string | null;
};

export type ProgramSnapshot = {
  now: string;
  myMemberId: string | null;
  directReportIds: string[];
  cycles: ProgramCycleMeta[];
  nominations: ProgramNomination[];
  progress: ProgramReviewProgress[];
  calibration: ProgramCalibrationRow[];
  packets: ProgramPacket[];
  goals: ProgramGoal[];
  feedback: ProgramFeedback[];
  oneOnOnes: ProgramOneOnOne[];
  notifications: ProgramNotification[];
  timelineReviews: Array<{ id: string; subjectId: string; direction: ReviewDirection; cycleName: string; submittedAt: string | null }>;
  reportInput: ReportInput | null;
};

export const EMPTY_PROGRAM: ProgramSnapshot = {
  now: new Date(0).toISOString(),
  myMemberId: null,
  directReportIds: [],
  cycles: [],
  nominations: [],
  progress: [],
  calibration: [],
  packets: [],
  goals: [],
  feedback: [],
  oneOnOnes: [],
  notifications: [],
  timelineReviews: [],
  reportInput: null,
};
