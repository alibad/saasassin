import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

export type OpsInterestRecord = {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  target: string;
  currentTool: string;
  migrationWindow: string;
  interviewConsent: boolean;
  source: string;
  createdAt: string;
};

export type OpsSnapshot = {
  configured: boolean;
  records: OpsInterestRecord[];
  totals: {
    applications: number;
    designPartners: number;
    builders: number;
    interviews: number;
  };
};

function text(value: unknown) {
  return typeof value === "string" ? value : "—";
}

function dateText(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return "Pending";
}

export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const db = getAdminDb();
  if (!db) {
    return {
      configured: false,
      records: [],
      totals: { applications: 0, designPartners: 0, builders: 0, interviews: 0 },
    };
  }

  const snapshot = await db
    .collection("interest")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const records = snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: text(data.name),
      email: text(data.email),
      company: text(data.company),
      role: text(data.role),
      target: text(data.target),
      currentTool: text(data.currentTool),
      migrationWindow: text(data.migrationWindow),
      interviewConsent: data.interviewConsent === true,
      source: text(data.source),
      createdAt: dateText(data.createdAt),
    };
  });

  return {
    configured: true,
    records,
    totals: {
      applications: records.length,
      designPartners: records.filter((record) => record.role === "Design partner").length,
      builders: records.filter((record) => record.role === "Builder").length,
      interviews: records.filter((record) => record.interviewConsent).length,
    },
  };
}
