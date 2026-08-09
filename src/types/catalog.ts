export type Strategy = "Build" | "Assemble" | "Back";

export type TargetStatus = "Research" | "Recruiting" | "Queued" | "Active";

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
  status: "Now" | "Next" | "Later";
  targetSlug: string | null;
  outcome: string;
  deliverables: string[];
  successMetric: string;
};
