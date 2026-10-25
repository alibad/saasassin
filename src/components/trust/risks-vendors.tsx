"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  CADENCE_LABELS,
  REVIEW_CADENCES,
  RISK_TREATMENTS,
  riskLevel,
  riskScore,
  VENDOR_TIERS,
  type ReviewCadence,
  type RiskTreatment,
  type VendorTier,
} from "@/lib/trust/model";

import { ControlPicker, EmptyState, Field, formatDate, MemberSelect, panel, RiskBadge, SimpleSelect } from "./shared";
import type { SectionProps, TrustSnapshot } from "./types";

type Risk = TrustSnapshot["risks"][number];
type Vendor = TrustSnapshot["vendors"][number];

const SCALE = [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }));
const HEAT = (score: number) =>
  ({ low: "bg-white", medium: "bg-[#fff1b8]", high: "bg-[#ffc2a8]", critical: "bg-[#ff7458] text-white" })[riskLevel(score)];

export function RisksSection({ snapshot, act, busy, canEdit }: SectionProps) {
  const [editing, setEditing] = useState<Risk | "new" | null>(null);
  const open = snapshot.risks.filter((risk) => risk.status === "open");

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Risk register</h2>
          <p className="text-sm text-[#6d6c64]">Score = likelihood × impact (1–25). Low 1–4, medium 5–9, high 10–15, critical 16–25.</p>
        </div>
        {canEdit ? <Button className="rounded-none" onClick={() => setEditing("new")}><Plus /> Add risk</Button> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <figure aria-label="Open risks heat map" className="w-fit">
          <div className="grid grid-cols-[auto_repeat(5,2.5rem)] gap-1 text-center text-xs">
            {[5, 4, 3, 2, 1].map((likelihood) => (
              <div key={likelihood} className="contents">
                <span className="flex items-center pr-1 font-semibold">L{likelihood}</span>
                {[1, 2, 3, 4, 5].map((impact) => {
                  const count = open.filter((risk) => risk.likelihood === likelihood && risk.impact === impact).length;
                  return (
                    <span key={impact} className={`flex size-10 items-center justify-center border border-[#171715] font-bold ${HEAT(likelihood * impact)}`}>
                      {count || ""}
                    </span>
                  );
                })}
              </div>
            ))}
            <span />
            {[1, 2, 3, 4, 5].map((impact) => <span key={impact} className="font-semibold">I{impact}</span>)}
          </div>
          <figcaption className="mt-2 text-xs text-[#6d6c64]">Open risks by likelihood (L) and impact (I)</figcaption>
        </figure>
        {snapshot.risks.length === 0 ? (
          <EmptyState title="No risks recorded.">Add the risks your team already worries about: lost laptops, leaked credentials, a critical vendor outage.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Risk</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="hidden sm:table-cell">Treatment</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.risks.map((risk) => (
                  <TableRow key={risk.id} className={risk.status === "closed" ? "opacity-60" : undefined}>
                    <TableCell className="min-w-40 whitespace-normal">
                      <p className="font-semibold">{risk.title}</p>
                      <p className="text-xs text-[#6d6c64]">{risk.status === "closed" ? "Closed" : "Open"} · {risk.controlIds.length} linked controls</p>
                    </TableCell>
                    <TableCell><RiskBadge level={risk.level} score={risk.score} /></TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">{risk.treatment}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{risk.ownerEmail || <span className="text-[#a33a1f]">Unassigned</span>}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditing(risk)}>
                        <Pencil /> {canEdit ? "Edit" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      {editing ? (
        <RiskDialog key={editing === "new" ? "new" : editing.id} risk={editing === "new" ? null : editing} snapshot={snapshot} act={act} busy={busy} canEdit={canEdit} onClose={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

function RiskDialog({ risk, snapshot, act, busy, canEdit, onClose }: { risk: Risk | null; snapshot: TrustSnapshot; act: SectionProps["act"]; busy: boolean; canEdit: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(risk?.title ?? "");
  const [description, setDescription] = useState(risk?.description ?? "");
  const [likelihood, setLikelihood] = useState(String(risk?.likelihood ?? 3));
  const [impact, setImpact] = useState(String(risk?.impact ?? 3));
  const [treatment, setTreatment] = useState<RiskTreatment>(risk?.treatment ?? "mitigate");
  const [treatmentPlan, setTreatmentPlan] = useState(risk?.treatmentPlan ?? "");
  const [ownerEmail, setOwnerEmail] = useState(risk?.ownerEmail ?? "");
  const [status, setStatus] = useState<"open" | "closed">(risk?.status ?? "open");
  const [controlIds, setControlIds] = useState<string[]>(risk?.controlIds ?? []);
  const score = riskScore(Number(likelihood), Number(impact));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{risk ? "Edit risk" : "Add risk"}</DialogTitle>
          <DialogDescription>Score likelihood and impact from 1 (rare / minor) to 5 (almost certain / severe).</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <Field label="Title" htmlFor="risk-title">
            <Input id="risk-title" value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Description" htmlFor="risk-description">
            <Textarea id="risk-description" value={description} onChange={(event) => setDescription(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Likelihood" htmlFor="risk-likelihood"><SimpleSelect id="risk-likelihood" value={likelihood} onChange={setLikelihood} options={SCALE} disabled={!canEdit} /></Field>
            <Field label="Impact" htmlFor="risk-impact"><SimpleSelect id="risk-impact" value={impact} onChange={setImpact} options={SCALE} disabled={!canEdit} /></Field>
            <div className="flex items-end"><RiskBadge level={riskLevel(score)} score={score} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Treatment" htmlFor="risk-treatment">
              <SimpleSelect id="risk-treatment" value={treatment} onChange={setTreatment} disabled={!canEdit} options={RISK_TREATMENTS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />
            </Field>
            <Field label="Status" htmlFor="risk-status">
              <SimpleSelect id="risk-status" value={status} onChange={setStatus} disabled={!canEdit} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} />
            </Field>
          </div>
          <Field label="Treatment plan" htmlFor="risk-plan">
            <Textarea id="risk-plan" value={treatmentPlan} onChange={(event) => setTreatmentPlan(event.target.value)} className="rounded-none border-[#171715]" />
          </Field>
          <Field label="Owner" htmlFor="risk-owner"><MemberSelect id="risk-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} /></Field>
          <Field label="Mitigating controls"><ControlPicker controls={snapshot.controls} selected={controlIds} onChange={setControlIds} /></Field>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button
              className="rounded-none"
              disabled={busy || title.trim().length < 2}
              onClick={async () => {
                const ok = await act({
                  action: "saveRisk",
                  ...(risk ? { riskId: risk.id } : {}),
                  title,
                  description,
                  likelihood: Number(likelihood),
                  impact: Number(impact),
                  treatment,
                  treatmentPlan,
                  ownerEmail,
                  status,
                  controlIds,
                });
                if (ok) onClose();
              }}
            >
              Save risk
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TIER_STYLE: Record<VendorTier, string> = { low: "bg-white", medium: "bg-[#fff1b8]", high: "bg-[#ffc2a8]", critical: "bg-[#ff7458] text-white" };

export function VendorsSection({ snapshot, act, busy, canEdit, isAdmin }: SectionProps) {
  const [editing, setEditing] = useState<Vendor | "new" | null>(null);
  const [removing, setRemoving] = useState<Vendor | null>(null);

  return (
    <section className={`${panel} p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Vendors</h2>
          <p className="text-sm text-[#6d6c64]">Inventory vendors that touch your data, tier them, and keep reviews on schedule.</p>
        </div>
        {canEdit ? <Button className="rounded-none" onClick={() => setEditing("new")}><Plus /> Add vendor</Button> : null}
      </div>
      {snapshot.vendors.length === 0 ? (
        <EmptyState title="No vendors yet.">Start with your cloud provider, identity provider, and anything that stores customer data.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="hidden sm:table-cell">Next review</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="min-w-36 whitespace-normal">
                    <p className="font-semibold">{vendor.name}</p>
                    <p className="text-xs text-[#6d6c64]">{vendor.service}{vendor.dataAccess ? ` · ${vendor.dataAccess}` : ""}</p>
                  </TableCell>
                  <TableCell><Badge variant="outline" className={`rounded-none border-[#171715] capitalize text-[#171715] ${TIER_STYLE[vendor.tier]}`}>{vendor.tier}</Badge></TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {vendor.overdue ? <strong className="text-[#a33a1f]">Overdue{vendor.nextReview ? ` (${formatDate(vendor.nextReview)})` : ""}</strong> : formatDate(vendor.nextReview)}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{vendor.ownerEmail || "Unassigned"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="outline" className="rounded-none border-[#171715]" onClick={() => setEditing(vendor)}><Pencil /> {canEdit ? "Edit" : "View"}</Button>
                    {isAdmin ? <Button size="icon" variant="ghost" aria-label={`Remove ${vendor.name}`} onClick={() => setRemoving(vendor)}><Trash2 /></Button> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editing ? (
        <VendorDialog key={editing === "new" ? "new" : editing.id} vendor={editing === "new" ? null : editing} snapshot={snapshot} act={act} busy={busy} canEdit={canEdit} onClose={() => setEditing(null)} />
      ) : null}
      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="rounded-none border-2 border-[#171715]">
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>The vendor leaves the inventory. The removal is recorded in the activity log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" className="rounded-none" disabled={busy} onClick={async () => {
              if (removing && (await act({ action: "deleteVendor", vendorId: removing.id }))) setRemoving(null);
            }}>Remove vendor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function VendorDialog({ vendor, snapshot, act, busy, canEdit, onClose }: { vendor: Vendor | null; snapshot: TrustSnapshot; act: SectionProps["act"]; busy: boolean; canEdit: boolean; onClose: () => void }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [service, setService] = useState(vendor?.service ?? "");
  const [tier, setTier] = useState<VendorTier>(vendor?.tier ?? "medium");
  const [dataAccess, setDataAccess] = useState(vendor?.dataAccess ?? "");
  const [ownerEmail, setOwnerEmail] = useState(vendor?.ownerEmail ?? "");
  const [lastReviewedAt, setLastReviewedAt] = useState(vendor?.lastReviewedAt ?? "");
  const [reviewCadence, setReviewCadence] = useState<ReviewCadence>(vendor?.reviewCadence ?? "annual");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#171715]">
        <DialogHeader>
          <DialogTitle>{vendor ? vendor.name : "Add vendor"}</DialogTitle>
          <DialogDescription>Tier by the sensitivity of data the vendor can reach and how critical it is to your service.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <Field label="Name" htmlFor="vendor-name"><Input id="vendor-name" value={name} onChange={(event) => setName(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Service provided" htmlFor="vendor-service"><Input id="vendor-service" value={service} onChange={(event) => setService(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Data access" htmlFor="vendor-data"><Input id="vendor-data" value={dataAccess} onChange={(event) => setDataAccess(event.target.value)} placeholder="e.g. customer PII, source code" className="rounded-none border-[#171715]" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Risk tier" htmlFor="vendor-tier"><SimpleSelect id="vendor-tier" value={tier} onChange={setTier} disabled={!canEdit} options={VENDOR_TIERS.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} /></Field>
            <Field label="Review cadence" htmlFor="vendor-cadence"><SimpleSelect id="vendor-cadence" value={reviewCadence} onChange={setReviewCadence} disabled={!canEdit} options={REVIEW_CADENCES.map((value) => ({ value, label: CADENCE_LABELS[value] }))} /></Field>
          </div>
          <Field label="Last reviewed" htmlFor="vendor-reviewed"><Input id="vendor-reviewed" type="date" value={lastReviewedAt} onChange={(event) => setLastReviewedAt(event.target.value)} className="rounded-none border-[#171715]" /></Field>
          <Field label="Owner" htmlFor="vendor-owner"><MemberSelect id="vendor-owner" members={snapshot.members} value={ownerEmail} onChange={setOwnerEmail} disabled={!canEdit} /></Field>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" className="rounded-none" onClick={onClose}>Close</Button>
          {canEdit ? (
            <Button className="rounded-none" disabled={busy || !name.trim()} onClick={async () => {
              const ok = await act({ action: "saveVendor", ...(vendor ? { vendorId: vendor.id } : {}), name, service, tier, dataAccess, ownerEmail, lastReviewedAt, reviewCadence });
              if (ok) onClose();
            }}>Save vendor</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
