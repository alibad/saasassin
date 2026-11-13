import { getComparisonInterestSources } from "../data/comparisons";
import targetsSeed from "../data/targets.json";
import { CONTACT_PAGE_SOURCE, GENERAL_INTEREST_TARGET } from "./contact";

/**
 * Server-side validation for POST /api/interest. Kept free of Firebase so it can be
 * unit-tested; the route only stores what `validateInterestPayload` accepts.
 */

export type InterestPayload = {
  name?: unknown;
  email?: unknown;
  role?: unknown;
  target?: unknown;
  note?: unknown;
  consent?: unknown;
  company?: unknown;
  website?: unknown;
  source?: unknown;
  currentTool?: unknown;
  teamSize?: unknown;
  migrationWindow?: unknown;
  interviewConsent?: unknown;
};

export type ValidInterest = {
  name: string;
  email: string;
  role: string;
  target: string;
  note: string;
  source: string;
  interviewConsent: boolean;
  company: string;
  currentTool: string;
  teamSize: string;
  migrationWindow: string;
};

export type InterestValidation =
  | { status: "honeypot" }
  | { status: "invalid" }
  | { status: "valid"; interest: ValidInterest };

export const DEFAULT_INTEREST_SOURCE = "saasassin-catalog";

/** Catalog targets, plus the reserved "general" target used by the site-wide contact page. */
export const validInterestTargets = new Set([
  ...targetsSeed.map((target) => target.slug),
  GENERAL_INTEREST_TARGET,
]);

export const validInterestRoles = new Set([
  "Builder",
  "Maintainer",
  "Design partner",
  "Funder",
  "Researcher",
  // Someone evaluating a SaaSassin product for their own team (contact and compare pages).
  "Adopter",
]);

export const validInterestSources = new Set([
  DEFAULT_INTEREST_SOURCE,
  "canny-fider-mission",
  CONTACT_PAGE_SOURCE,
  ...getComparisonInterestSources(),
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function validateInterestPayload(payload: InterestPayload): InterestValidation {
  if (cleanText(payload.website, 120)) {
    return { status: "honeypot" };
  }

  const requestedSource = cleanText(payload.source, 80);
  const interest: ValidInterest = {
    name: cleanText(payload.name, 80),
    email: cleanText(payload.email, 254).toLowerCase(),
    role: cleanText(payload.role, 60),
    target: cleanText(payload.target, 80),
    note: cleanText(payload.note, 500),
    source: validInterestSources.has(requestedSource) ? requestedSource : DEFAULT_INTEREST_SOURCE,
    interviewConsent: payload.interviewConsent === true,
    company: cleanText(payload.company, 120),
    currentTool: cleanText(payload.currentTool, 80),
    teamSize: cleanText(payload.teamSize, 40),
    migrationWindow: cleanText(payload.migrationWindow, 60),
  };

  if (
    interest.name.length < 2 ||
    !emailPattern.test(interest.email) ||
    !validInterestRoles.has(interest.role) ||
    !validInterestTargets.has(interest.target) ||
    payload.consent !== true
  ) {
    return { status: "invalid" };
  }

  return { status: "valid", interest };
}
