import { FieldValue } from "firebase-admin/firestore";

import targetsSeed from "@/data/targets.json";
import { getAdminDb } from "@/lib/firebase/admin";

type InterestPayload = {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  target?: unknown;
  note?: unknown;
  consent?: unknown;
  company?: unknown;
};

const validTargets = new Set(targetsSeed.map((target) => target.slug));
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  let payload: InterestPayload;

  try {
    payload = (await request.json()) as InterestPayload;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = cleanText(payload.name, 80);
  const email = cleanText(payload.email, 254).toLowerCase();
  const role = cleanText(payload.role, 60);
  const target = cleanText(payload.target, 80);
  const note = cleanText(payload.note, 500);

  if (cleanText(payload.company, 120)) {
    return Response.json({ ok: true });
  }

  if (
    name.length < 2 ||
    !emailPattern.test(email) ||
    !role ||
    !validTargets.has(target) ||
    payload.consent !== true
  ) {
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

  const submission = await db.collection("interest").add({
    name,
    email,
    role,
    target,
    note,
    consent: true,
    source: "saasassin-catalog",
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, id: submission.id });
}
