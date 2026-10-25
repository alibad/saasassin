import { z } from "zod";

import { REVIEW_CADENCES, RISK_TREATMENTS, VENDOR_TIERS } from "./model";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");
const optionalDay = z.union([day, z.literal("")]).default("");
const email = z.union([z.email("Use a valid email address.").max(200), z.literal("")]).default("");
const id = z.string().trim().min(1).max(120);

export const trustActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setFrameworks"), frameworkIds: z.array(z.enum(["soc2", "iso27001"])).min(1, "Select at least one framework.") }),
  z.object({
    action: z.literal("updateControl"),
    controlId: id,
    ownerEmail: email,
    status: z.enum(["not_started", "in_progress", "implemented", "needs_evidence", "not_applicable"]),
    naJustification: z.string().trim().max(1000).default(""),
    notes: z.string().trim().max(2000).default(""),
  }),
  z.object({
    action: z.literal("addEvidence"),
    title: z.string().trim().min(2, "Give the evidence a title.").max(160),
    description: z.string().trim().max(2000).default(""),
    kind: z.enum(["link", "text"]),
    url: z.string().trim().max(2000).default(""),
    text: z.string().trim().max(20000).default(""),
    controlIds: z.array(id).min(1, "Link the evidence to at least one control.").max(50),
    collectedAt: day,
    cadence: z.enum(REVIEW_CADENCES),
    expiresAt: optionalDay,
  }),
  z.object({ action: z.literal("deleteEvidence"), evidenceId: id }),
  z.object({
    action: z.literal("reviewEvidence"),
    evidenceId: id,
    decision: z.enum(["accepted", "rejected"]),
    note: z.string().trim().max(1000).default(""),
  }),
  z.object({
    action: z.literal("createPolicy"),
    templateId: z.string().trim().max(80).default("blank"),
    title: z.string().trim().min(2, "Name the policy.").max(160),
    ownerEmail: email,
    reviewCadence: z.enum(REVIEW_CADENCES).default("annual"),
  }),
  z.object({ action: z.literal("revisePolicy"), policyId: id, body: z.string().trim().min(20, "Policy text is too short.").max(50000) }),
  z.object({ action: z.literal("approvePolicy"), policyId: id, version: z.number().int().min(1) }),
  z.object({ action: z.literal("acknowledgePolicy"), policyId: id }),
  z.object({
    action: z.literal("saveRisk"),
    riskId: z.string().max(120).optional(),
    title: z.string().trim().min(2, "Name the risk.").max(160),
    description: z.string().trim().max(2000).default(""),
    likelihood: z.number().int().min(1).max(5),
    impact: z.number().int().min(1).max(5),
    treatment: z.enum(RISK_TREATMENTS),
    treatmentPlan: z.string().trim().max(2000).default(""),
    ownerEmail: email,
    status: z.enum(["open", "closed"]).default("open"),
    controlIds: z.array(id).max(50).default([]),
  }),
  z.object({
    action: z.literal("saveVendor"),
    vendorId: z.string().max(120).optional(),
    name: z.string().trim().min(1, "Name the vendor.").max(160),
    service: z.string().trim().max(200).default(""),
    tier: z.enum(VENDOR_TIERS),
    dataAccess: z.string().trim().max(500).default(""),
    ownerEmail: email,
    lastReviewedAt: optionalDay,
    reviewCadence: z.enum(REVIEW_CADENCES).default("annual"),
  }),
  z.object({ action: z.literal("deleteVendor"), vendorId: id }),
  z.object({
    action: z.literal("saveTrustCenter"),
    published: z.boolean(),
    displayName: z.string().trim().max(120).default(""),
    headline: z.string().trim().max(400).default(""),
    contactEmail: email,
    showFrameworks: z.boolean(),
    showReadiness: z.boolean(),
    showControlCategories: z.boolean(),
    publishedPolicyIds: z.array(id).max(100).default([]),
  }),
  z.object({ action: z.literal("setEmployees"), emails: z.array(z.email("Each line must be an email address.")).max(1000) }),
  z.object({ action: z.literal("recordAcknowledgement"), policyId: id, email: z.email("Use a valid email address.") }),
  z.object({ action: z.literal("inviteMember"), email: z.email("Use a valid email address."), role: z.enum(["admin", "member", "viewer"]) }),
]);

export type TrustAction = z.infer<typeof trustActionSchema>;

/** Actions only owners and admins may perform. Viewers (e.g. auditors) are always read-only. */
export const PRIVILEGED_ACTIONS: TrustAction["action"][] = [
  "setFrameworks",
  "approvePolicy",
  "saveTrustCenter",
  "inviteMember",
  "setEmployees",
  "recordAcknowledgement",
  "deleteEvidence",
  "reviewEvidence",
  "deleteVendor",
];

export function roleCanPerform(role: string, action: TrustAction["action"]) {
  if (role === "owner" || role === "admin") return true;
  if (role === "viewer") return action === "acknowledgePolicy";
  return !PRIVILEGED_ACTIONS.includes(action);
}
