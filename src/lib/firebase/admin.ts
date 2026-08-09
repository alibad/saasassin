import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | null | undefined;

export function isFirebaseConfigured() {
  const hasCertificate = Boolean(
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY,
  );
  const hasApplicationCredentials = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );

  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      (hasCertificate || hasApplicationCredentials),
  );
}

function getAdminApp(): App | null {
  if (adminApp !== undefined) {
    return adminApp;
  }

  if (!isFirebaseConfigured()) {
    adminApp = null;
    return adminApp;
  }

  const existing = getApps()[0];
  if (existing) {
    adminApp = existing;
    return adminApp;
  }

  const credential =
    process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
      ? cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        })
      : applicationDefault();

  adminApp = initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  return adminApp;
}

export function getAdminDb(): Firestore | null {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
}
