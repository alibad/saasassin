import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config({ path: path.join(projectRoot, ".env") });

const hasCertificate =
  process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
const hasApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!process.env.FIREBASE_PROJECT_ID || (!hasCertificate && !hasApplicationCredentials)) {
  console.error(
    "Set FIREBASE_PROJECT_ID plus either GOOGLE_APPLICATION_CREDENTIALS or the Firebase certificate variables.",
  );
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

const [targets, roadmap] = await Promise.all([
  readFile(path.join(projectRoot, "src/data/targets.json"), "utf8").then(JSON.parse),
  readFile(path.join(projectRoot, "src/data/roadmap.json"), "utf8").then(JSON.parse),
]);

const batch = db.batch();

for (const target of targets) {
  batch.set(db.collection("targets").doc(target.slug), {
    ...target,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

for (const item of roadmap) {
  batch.set(db.collection("roadmap").doc(item.id), {
    ...item,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

await batch.commit();
console.log(`Seeded ${targets.length} targets and ${roadmap.length} roadmap items.`);
