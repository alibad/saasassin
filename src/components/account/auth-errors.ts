import { AccountApiError } from "./client";

/** Firebase Auth error code of an error, without the "auth/" prefix ("" when there is none). */
export function authErrorCode(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return code.replace(/^auth\//, "");
}

const messages: Record<string, string> = {
  "email-already-in-use": "An account already uses this email. Sign in instead.",
  "invalid-credential": "That email and password don't match. Try again or reset your password.",
  "wrong-password": "That password isn't right. Try again or reset your password.",
  "user-not-found": "That email and password don't match. Try again or reset your password.",
  "invalid-login-credentials": "That email and password don't match. Try again or reset your password.",
  "weak-password": "Use at least eight characters for your password.",
  "missing-password": "Enter your password.",
  "invalid-email": "Enter a valid email address.",
  "missing-email": "Enter your email address.",
  "too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "popup-closed-by-user": "The sign-in window was closed before it finished.",
  "cancelled-popup-request": "Another sign-in window is already open.",
  "popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "operation-not-allowed": "That sign-in method isn't switched on for this workspace yet. Use another one.",
  "unauthorized-domain": "Sign-in isn't set up for this web address yet.",
  "network-request-failed": "You appear to be offline. Check your connection and try again.",
  "user-disabled": "This account has been disabled. Contact your workspace admin.",
  "requires-recent-login": "For your security, confirm it's you and try again.",
  "invalid-verification-code": "That code isn't right. Check your authenticator app and try again.",
  "missing-code": "Enter the six-digit code from your authenticator app.",
  "invalid-multi-factor-session": "That sign-in took too long. Start again.",
  "multi-factor-auth-required": "Enter the code from your authenticator app to finish signing in.",
  "provider-already-linked": "That sign-in method is already connected to your account.",
  "credential-already-in-use": "That sign-in is already connected to a different account.",
  "account-exists-with-different-credential": "An account already uses this email with a different sign-in method.",
  "no-such-provider": "That sign-in method isn't connected to your account.",
  "unverified-email": "Verify your email address first.",
  "maximum-second-factor-count-exceeded": "You've added as many authenticator apps as an account can have.",
  "second-factor-already-in-use": "That authenticator app is already set up on your account.",
  "user-token-expired": "Your sign-in has expired. Sign in again to continue.",
  "user-mismatch": "That's a different account than the one you're signed in with.",
  "expired-action-code": "That link has expired. Request a new one.",
};

/** A sentence a person can act on, never a raw error code. */
export function readableAuthError(error: unknown, fallback = "Something went wrong. Try again.") {
  if (error instanceof AccountApiError) return error.message;
  const code = authErrorCode(error);
  if (code && messages[code]) return messages[code];
  if (code === "admin-restricted-operation") return "That sign-in method isn't available here. Use another one.";
  if (code.startsWith("internal-error") || code) return fallback;
  return error instanceof Error && error.message && !/firebase/i.test(error.message) ? error.message : fallback;
}
