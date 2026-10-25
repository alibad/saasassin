import type { Permission } from "@/lib/lattice/permissions";
import type { ReviewCycleState } from "@/lib/lattice/state-machine";

export type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  createdAt: string | null;
};

export type WorkspaceRole = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  builtIn: boolean;
};

export type WorkspaceMember = {
  id: string;
  authUid: string | null;
  name: string;
  email: string;
  title: string;
  teamId: string | null;
  teamName: string | null;
  managerId: string | null;
  managerName: string | null;
  roleId: string;
  status: "active" | "invited" | "inactive";
};

export type ReviewQuestion = {
  id: string;
  prompt: string;
  type: "text" | "rating";
  required: boolean;
};

export type ReviewTemplate = {
  id: string;
  name: string;
  directions: Array<"self" | "manager" | "peer" | "upward">;
  questions: ReviewQuestion[];
  createdAt: string | null;
};

export type ReviewCycle = {
  id: string;
  name: string;
  templateId: string;
  templateName: string;
  state: ReviewCycleState;
  dueDate: string | null;
  peerNominationEnabled: boolean;
  calibrationEnabled: boolean;
  assignedReviews: number;
  submittedReviews: number;
  createdAt: string | null;
};

export type AssignedReview = {
  id: string;
  cycleId: string;
  cycleName: string;
  templateId: string;
  subjectId: string;
  subjectName: string;
  reviewerId: string;
  direction: "self" | "manager" | "peer" | "upward";
  state: "draft" | "submitted";
  answers: Record<string, string | number>;
  updatedAt: string | null;
  submittedAt: string | null;
};

export type AuditEvent = {
  id: string;
  actorId: string;
  actorName: string;
  eventType: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string | null;
};

export type WorkspaceSnapshot = {
  user: { uid: string; email: string; name: string };
  memberships: Array<{ organizationId: string; organizationName: string }>;
  organization: WorkspaceOrganization | null;
  currentMember: WorkspaceMember | null;
  currentRole: WorkspaceRole | null;
  permissions: Permission[];
  members: WorkspaceMember[];
  roles: WorkspaceRole[];
  templates: ReviewTemplate[];
  cycles: ReviewCycle[];
  assignedReviews: AssignedReview[];
  auditEvents: AuditEvent[];
};
