"use client";

import {
  getMultiFactorResolver,
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  TotpMultiFactorGenerator,
  type Auth,
  type AuthCredential,
  type AuthProvider,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";

import { parseAuthProviders, type AuthProviderId } from "@/lib/fleet/account/identity";

import { authErrorCode } from "./auth-errors";

/** Optional providers are listed in NEXT_PUBLIC_FLEET_AUTH_PROVIDERS once switched on in Firebase. */
export function enabledProviders(): AuthProviderId[] {
  return parseAuthProviders(process.env.NEXT_PUBLIC_FLEET_AUTH_PROVIDERS);
}

/** Authenticator-app (TOTP) two-step verification, once the owner has switched it on in Firebase. */
export function totpEnabled() {
  return process.env.NEXT_PUBLIC_FLEET_MFA_TOTP === "enabled";
}

export function createProvider(id: AuthProviderId): AuthProvider {
  switch (id) {
    case "microsoft": {
      const provider = new OAuthProvider("microsoft.com");
      provider.setCustomParameters({ prompt: "select_account" });
      return provider;
    }
    case "github": {
      const provider = new GithubAuthProvider();
      provider.addScope("user:email");
      return provider;
    }
    case "apple": {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      return provider;
    }
    default: {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return provider;
    }
  }
}

/** The credential a failed popup sign-in carried, so it can be linked after the person signs in their usual way. */
export function credentialFromError(provider: AuthProviderId, error: unknown): AuthCredential | null {
  const failure = error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0];
  try {
    if (provider === "google") return GoogleAuthProvider.credentialFromError(failure);
    if (provider === "github") return GithubAuthProvider.credentialFromError(failure);
    return OAuthProvider.credentialFromError(failure);
  } catch {
    return null;
  }
}

export function emailFromError(error: unknown) {
  const data = (error as { customData?: { email?: unknown } })?.customData;
  return typeof data?.email === "string" ? data.email : "";
}

export function isMultiFactorRequired(error: unknown) {
  return authErrorCode(error) === "multi-factor-auth-required";
}

export type TotpChallenge = { resolver: MultiFactorResolver; hintUid: string; displayName: string };

/**
 * Turns a "second factor required" error into a TOTP challenge. Returns null when the account
 * only has factors this product cannot complete (for example SMS, which is not offered).
 */
export function totpChallengeFromError(auth: Auth, error: unknown): TotpChallenge | null {
  const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
  const hint = resolver.hints.find((entry) => entry.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  return hint ? { resolver, hintUid: hint.uid, displayName: hint.displayName || "Authenticator app" } : null;
}

export async function completeTotpChallenge(challenge: TotpChallenge, code: string) {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(challenge.hintUid, code.replace(/\s+/g, ""));
  return challenge.resolver.resolveSignIn(assertion);
}
