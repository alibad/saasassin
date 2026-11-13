import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { validateInterestPayload, type InterestPayload } from "@/lib/interest-validation";

export async function POST(request: Request) {
  let payload: InterestPayload;

  try {
    payload = (await request.json()) as InterestPayload;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validation = validateInterestPayload(payload);

  if (validation.status === "honeypot") {
    return Response.json({ ok: true });
  }

  if (validation.status === "invalid") {
    return Response.json(
      { error: "Please complete the required fields and confirm consent." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  if (!db) {
    return Response.json(
      {
        error:
          "Firebase is not connected yet. Your submission was not stored—please try again after configuration.",
      },
      { status: 503 },
    );
  }

  const { company, currentTool, teamSize, migrationWindow, ...required } = validation.interest;

  const record: Record<string, unknown> = {
    name: required.name,
    email: required.email,
    role: required.role,
    target: required.target,
    note: required.note,
    consent: true,
    source: required.source,
    interviewConsent: required.interviewConsent,
    createdAt: FieldValue.serverTimestamp(),
  };

  if (company) record.company = company;
  if (currentTool) record.currentTool = currentTool;
  if (teamSize) record.teamSize = teamSize;
  if (migrationWindow) record.migrationWindow = migrationWindow;

  const submission = await db.collection("interest").add(record);

  return Response.json({ ok: true, id: submission.id });
}
