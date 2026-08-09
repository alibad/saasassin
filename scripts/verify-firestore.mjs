import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const hasCertificate =
  process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
const hasApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!process.env.FIREBASE_PROJECT_ID || (!hasCertificate && !hasApplicationCredentials)) {
  console.error("Firebase runtime credentials are not configured.");
  process.exit(1);
}

const credential = hasCertificate
  ? cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    })
  : applicationDefault();

const app = initializeApp({
  credential,
  projectId: process.env.FIREBASE_PROJECT_ID,
});
const db = getFirestore(app);

const [targets, roadmap, missions] = await Promise.all([
  db.collection("targets").count().get(),
  db.collection("roadmap").count().get(),
  db.collection("missions").count().get(),
]);

const checkRef = db.collection("system_checks").doc("runtime-verification");

try {
  await checkRef.set({
    purpose: "Temporary SaaSassin runtime verification",
    checkedAt: new Date().toISOString(),
  });
  const check = await checkRef.get();

  if (!check.exists) {
    throw new Error("The verification write could not be read back.");
  }

  console.log(
    `Firestore verified: ${targets.data().count} targets, ${roadmap.data().count} roadmap items, ${missions.data().count} mission, temporary write/read succeeded.`,
  );
} finally {
  await checkRef.delete();
}
