import type {
  ControlStatus,
  EffectiveControl,
  EvidenceFreshness,
  EvidenceRecord,
  GapTask,
  PolicyRecord,
  ProgramSettings,
  Readiness,
  RiskLevel,
  RiskRecord,
  VendorRecord,
} from "@/lib/trust/model";

export type TrustSnapshot = {
  tenant: { id: string; name: string };
  role: string;
  me: { email: string; name: string };
  libraryVersion: string;
  frameworks: Array<{ id: "soc2" | "iso27001"; name: string; summary: string; disclaimer: string; version: string; controlCount: number }>;
  policyTemplates: Array<{ id: string; title: string; summary: string }>;
  settings: ProgramSettings;
  /** Everyone expected to acknowledge policies (members plus employees in scope), lower-cased. */
  people: string[];
  readiness: Readiness;
  tasks: GapTask[];
  controls: EffectiveControl[];
  evidence: Array<EvidenceRecord & { freshness: EvidenceFreshness; expiry: string | null }>;
  policies: Array<PolicyRecord & { status: "draft" | "approved" | "revision_pending"; reviewDue: string | null }>;
  risks: Array<RiskRecord & { score: number; level: RiskLevel }>;
  vendors: Array<VendorRecord & { nextReview: string | null; overdue: boolean }>;
  members: Array<{ uid: string; email: string; name: string; role: string }>;
  audit: Array<{ id: string; action: string; actor: { uid: string; email: string }; target: { type: string; id: string }; details: Record<string, unknown>; occurredAt: string | null }>;
};

export type ActFn = (payload: Record<string, unknown>) => Promise<boolean>;

export type SectionProps = {
  snapshot: TrustSnapshot;
  act: ActFn;
  busy: boolean;
  canEdit: boolean;
  isAdmin: boolean;
};

export type { ControlStatus };
