export type FleetAppStatus = "Working product" | "Foundation ready" | "Waiting upstream";

export type FleetModule = {
  name: string;
  description: string;
  entities: string[];
};

export type FleetStage = {
  title: string;
  outcome: string;
  state: "complete" | "next" | "later" | "blocked";
};

export type FleetApp = {
  slug: string;
  targetSlug: string;
  subdomain: string;
  productName: string;
  targetName: string;
  category: string;
  strategy: "Build" | "Assemble" | "Back";
  status: FleetAppStatus;
  accent: string;
  promise: string;
  audience: string;
  primaryJob: string;
  migrationWedge: string;
  firstDemo: string;
  modules: FleetModule[];
  workflow: string[];
  invariants: string[];
  exclusions: string[];
  stages: FleetStage[];
};
