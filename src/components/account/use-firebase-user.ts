"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

import { accountRequest, sessionEndpoint } from "./client";

/**
 * The browser's Firebase user (undefined while loading, null when this device has no sign-in).
 * `touch()` re-renders after in-place changes such as linking a provider or enrolling a factor.
 */
export function useFirebaseUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [, setVersion] = useState(0);

  useEffect(() => {
    let auth: ReturnType<typeof getFirebaseClientAuth>;
    try {
      auth = getFirebaseClientAuth();
    } catch {
      queueMicrotask(() => setUser(null));
      return;
    }
    return onAuthStateChanged(auth, (next) => setUser(next));
  }, []);

  const touch = useCallback(() => setVersion((value) => value + 1), []);
  return { user, touch };
}

/** Clears this product's session cookie and the browser's Firebase sign-in. */
export async function signOutOfProduct(product: string) {
  await accountRequest(sessionEndpoint(product), { method: "DELETE" }).catch(() => undefined);
  try {
    await signOut(getFirebaseClientAuth());
  } catch {
    // Not configured in this environment; the cookie is already gone.
  }
}
