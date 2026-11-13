"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getFirebaseClientAuth } from "@/lib/firebase/client";
import type { ApiErrorBody, MeResponse } from "@/lib/fleet/account/types";

/** Browser helpers shared by the account components: API calls, session refresh and the /me store. */

export class AccountApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    this.code = code;
  }
}

export function accountApiBase(product: string) {
  return `/api/fleet/${encodeURIComponent(product)}`;
}

/** Performance keeps its own session endpoint; every other product uses the fleet one. */
export function sessionEndpoint(product: string) {
  return product === "performance" ? "/api/lattice/session" : `${accountApiBase(product)}/session`;
}

export async function accountRequest<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...rest,
      headers: json === undefined ? headers : { "Content-Type": "application/json", ...headers },
      body: json === undefined ? rest.body : JSON.stringify(json),
    });
  } catch {
    throw new AccountApiError("You appear to be offline. Check your connection and try again.", 0);
  }
  const body = (await response.json().catch(() => ({}))) as Partial<ApiErrorBody> & T;
  if (!response.ok) {
    throw new AccountApiError(body.error ?? "Something went wrong. Try again.", response.status, body.code);
  }
  return body as T;
}

export function isReauthRequired(error: unknown) {
  return error instanceof AccountApiError && error.code === "reauth_required";
}

/**
 * Re-issues this product's session cookie from a fresh ID token: after re-authentication (so the
 * server sees a recent sign-in), after verifying an email, and after security changes that
 * revoke older sessions.
 */
export async function refreshProductSession(product: string) {
  const auth = getFirebaseClientAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new AccountApiError("Your sign-in has expired. Sign in again to continue.", 401);
  const idToken = await user.getIdToken(true);
  await accountRequest(sessionEndpoint(product), { method: "POST", json: { idToken } });
}

/* ---------------------------------------------------------------------------------------- */
/* Shared /me store, so the account menu, switcher and settings never fetch it twice.        */
/* ---------------------------------------------------------------------------------------- */

type AccountState = { data: MeResponse | null; error: string | null; loading: boolean };

type Store = {
  state: AccountState;
  listeners: Set<() => void>;
  inflight: Promise<void> | null;
  loaded: boolean;
};

const stores = new Map<string, Store>();
const initialState: AccountState = { data: null, error: null, loading: true };

function storeFor(product: string) {
  let store = stores.get(product);
  if (!store) {
    store = { state: initialState, listeners: new Set(), inflight: null, loaded: false };
    stores.set(product, store);
  }
  return store;
}

function setState(product: string, next: Partial<AccountState>) {
  const store = storeFor(product);
  store.state = { ...store.state, ...next };
  for (const listener of store.listeners) listener();
}

export function refreshAccount(product: string) {
  const store = storeFor(product);
  if (store.inflight) return store.inflight;
  store.inflight = accountRequest<MeResponse>(`${accountApiBase(product)}/me`)
    .then((data) => setState(product, { data, error: null, loading: false }))
    .catch((error: unknown) => setState(product, {
      error: error instanceof Error ? error.message : "Could not load your account.",
      loading: false,
    }))
    .finally(() => {
      store.loaded = true;
      store.inflight = null;
    });
  return store.inflight;
}

/** Replaces the cached account after a write that returned fresh data. */
export function setAccount(product: string, update: (current: MeResponse) => MeResponse) {
  const current = storeFor(product).state.data;
  if (current) setState(product, { data: update(current) });
}

export function useAccount(product: string) {
  const subscribe = useCallback((listener: () => void) => {
    const store = storeFor(product);
    store.listeners.add(listener);
    return () => {
      store.listeners.delete(listener);
    };
  }, [product]);
  const state = useSyncExternalStore(subscribe, () => storeFor(product).state, () => initialState);

  useEffect(() => {
    const store = storeFor(product);
    if (!store.loaded && !store.inflight) void refreshAccount(product);
  }, [product]);

  return { ...state, refresh: () => refreshAccount(product) };
}
