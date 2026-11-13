"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

import { resolveClientAuthEmulator } from "@/lib/firebase/emulators";

function getFirebaseClientApp() {
  if (getApps().length) {
    return getApp();
  }

  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error("Firebase Authentication is not configured for this environment.");
  }

  return initializeApp(config);
}

export function getFirebaseClientAuth() {
  const auth = getAuth(getFirebaseClientApp());
  // Development only: NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST with a `demo-` project.
  const emulatorUrl = resolveClientAuthEmulator({
    nodeEnv: process.env.NODE_ENV,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    authHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  });
  if (emulatorUrl && !auth.emulatorConfig) {
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  }
  return auth;
}
