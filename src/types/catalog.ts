export type Strategy = "Build" | "Assemble" | "Back";

export type TargetStatus = "Research" | "Recruiting" | "Queued" | "Active" | "Waiting";

export type ScoreBreakdown = {
  economicPain: number;
  demand: number;
  tractability: number;
  ossWhitespace: number;
  portability: number;
  economics: number;
};

export type Target = {
  slug: string;
  name: string;
  rank: number;
  category: string;
  score: number;
  strategy: Strategy;
  status: TargetStatus;
  phase: string;
  priceSignal: string;
  summary: string;
  whyNow: string;
  wedge: string;
  ossLandscape: string;
  recommendedMove: string;
  risk: string;
  sourceUrl: string;
  challengerName: string | null;
  challengerUrl: string | null;
  metrics: ScoreBreakdown;
  milestones: string[];
};

export type RoadmapItem = {
  id: string;
  order: number;
  window: string;
  title: string;
  kicker: string;
  status: "Completed" | "Now" | "Next" | "Later" | "Waiting";
  targetSlug: string | null;
  outcome: string;
  deliverables: string[];
  successMetric: string;
};

export type MissionGoal = {
  qualifiedBuilders: number;
  designPartners: number;
  userInterviews: number;
  migrations: number;
  hostedCustomers: number;
};

export type MissionPhase = {
  id: string;
  label: string;
  title: string;
  status: "Now" | "Next" | "Later" | "Waiting";
  deliverables: string[];
  exitGate: string;
};

export type MissionSource = {
  label: string;
  url: string;
};

export type Mission = {
  slug: string;
  title: string;
  kicker: string;
  status: "Discovery" | "Recruiting" | "Building" | "Migrating" | "Verified" | "Waiting";
  targetSlug: string;
  challengerName: string;
  challengerUrl: string;
  summary: string;
  statusNote: string;
  startedAt: string;
  exitMetric: string;
  goals: MissionGoal;
  proofPoints: string[];
  phases: MissionPhase[];
  sources: MissionSource[];
};
