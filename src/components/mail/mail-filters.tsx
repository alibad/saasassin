"use client";

import { useState, type FormEvent } from "react";
import { CircleAlert, FlaskConical, LoaderCircle, Plus, Play, Trash2, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  conditionNeedsValue,
  describeActions,
  describeConditions,
  FILTER_FIELD_LABELS,
  FILTER_FIELDS,
  type FilterActions,
  type FilterCondition,
  type FilterField,
  type FilterRule,
} from "@/lib/mail/filters";

import { api, tenantPath } from "./mail-api";

export type FilterPreview = {
  scanned: number;
  messages: number;
  threads: number;
  withoutListId: number;
  sample: Array<{ id: string; subject: string; state: string; lastMessageAt: string; fromAddresses: string[] }>;
};

const EMPTY_ACTIONS: FilterActions = { label: null, archive: false, star: false, markRead: false, skipInbox: false };

const ACTION_OPTIONS: Array<{ key: Exclude<keyof FilterActions, "label">; label: string; hint: string }> = [
  { key: "skipInbox", label: "Skip the inbox", hint: "New mail never brings the thread back; new threads land in Done." },
  { key: "archive", label: "Archive", hint: "Move the thread to Done." },
  { key: "star", label: "Star", hint: "Star the thread." },
  { key: "markRead", label: "Mark read", hint: "Matching mail arrives already read." },
];

function errorText(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback;
}

function PreviewResult({ preview }: { preview: FilterPreview }) {
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm" role="status">
      <p>
        <strong>{preview.messages}</strong> of {preview.scanned} messages match, in <strong>{preview.threads}</strong> thread{preview.threads === 1 ? "" : "s"}.
      </p>
      {preview.withoutListId ? (
        <p className="text-muted-foreground">{preview.withoutListId} messages were imported before mailing-list ids were recorded and cannot match a List-Id condition.</p>
      ) : null}
      {preview.sample.length ? (
        <ul className="grid gap-1">
          {preview.sample.map((thread) => (
            <li key={thread.id} className="flex items-center justify-between gap-2 border-t pt-1">
              <span className="min-w-0 truncate">{thread.subject || "(no subject)"} <span className="text-muted-foreground">· {thread.fromAddresses.join(", ")}</span></span>
              <Badge variant="outline">{thread.state === "archived" ? "Done" : thread.state === "trash" ? "Trash" : "Inbox"}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FiltersPanel({ tenantId, filters, readOnly, onChange }: { tenantId: string; filters: FilterRule[]; readOnly: boolean; onChange: () => void }) {
  const [name, setName] = useState("");
  const [match, setMatch] = useState<"all" | "any">("all");
  const [conditions, setConditions] = useState<FilterCondition[]>([{ field: "from", value: "" }]);
  const [actions, setActions] = useState<FilterActions>(EMPTY_ACTIONS);
  const [preview, setPreview] = useState<FilterPreview | null>(null);
  const [pending, setPending] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState<FilterRule | null>(null);
  const [applyPreview, setApplyPreview] = useState<FilterPreview | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "loading" | "running">("idle");
  const [applyResult, setApplyResult] = useState("");

  function updateCondition(index: number, patch: Partial<FilterCondition>) {
    setConditions((current) => current.map((condition, position) => (position === index ? { ...condition, ...patch } : condition)));
    setPreview(null);
  }

  async function runPreview() {
    setPending("preview");
    setError("");
    try {
      const { preview: result } = await api<{ preview: FilterPreview }>(tenantPath(tenantId, "/filters/preview"), { method: "POST", json: { match, conditions } });
      setPreview(result);
    } catch (caught) {
      setError(errorText(caught, "Could not test the filter."));
    }
    setPending(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending("save");
    setError("");
    try {
      await api(tenantPath(tenantId, "/filters"), { method: "POST", json: { name, match, conditions, actions } });
      setName("");
      setConditions([{ field: "from", value: "" }]);
      setActions(EMPTY_ACTIONS);
      setPreview(null);
      onChange();
    } catch (caught) {
      setError(errorText(caught, "Could not save the filter."));
    }
    setPending(null);
  }

  async function toggle(rule: FilterRule, enabled: boolean) {
    setError("");
    try {
      await api(tenantPath(tenantId, `/filters/${rule.id}`), { method: "PATCH", json: { enabled } });
      onChange();
    } catch (caught) {
      setError(errorText(caught, "Could not change the filter."));
    }
  }

  async function remove(rule: FilterRule) {
    setError("");
    try {
      await api(tenantPath(tenantId, `/filters/${rule.id}`), { method: "DELETE" });
      onChange();
    } catch (caught) {
      setError(errorText(caught, "Could not delete the filter."));
    }
  }

  async function openApply(rule: FilterRule) {
    setApplying(rule);
    setApplyPreview(null);
    setApplyResult("");
    setApplyState("loading");
    try {
      const { preview: result } = await api<{ preview: FilterPreview }>(tenantPath(tenantId, "/filters/preview"), { method: "POST", json: { match: rule.match, conditions: rule.conditions } });
      setApplyPreview(result);
    } catch (caught) {
      setApplyResult(errorText(caught, "Could not test the filter."));
    }
    setApplyState("idle");
  }

  async function confirmApply() {
    if (!applying) return;
    setApplyState("running");
    try {
      const { result } = await api<{ result: { matchedThreads: number; changedThreads: number } }>(tenantPath(tenantId, `/filters/${applying.id}/apply`), { method: "POST" });
      setApplyResult(`Applied to ${result.changedThreads} of ${result.matchedThreads} matching thread${result.matchedThreads === 1 ? "" : "s"} (the rest already matched or are in Trash).`);
      onChange();
    } catch (caught) {
      setApplyResult(errorText(caught, "The filter was not applied."));
    }
    setApplyState("idle");
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>Rules run on every message you import. Existing mail only changes when you press Apply to existing mail.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {filters.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{rule.name} {rule.enabled ? null : <Badge variant="outline">Off</Badge>}</p>
                <p className="text-sm text-muted-foreground">If {describeConditions(rule)} → {describeActions(rule.actions)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={rule.enabled} disabled={readOnly} aria-label={`${rule.enabled ? "Turn off" : "Turn on"} filter ${rule.name}`} onCheckedChange={(value) => void toggle(rule, value)} />
                <Button size="sm" variant="outline" disabled={readOnly} onClick={() => void openApply(rule)}><Play /> Apply to existing mail</Button>
                <Button size="icon" variant="ghost" disabled={readOnly} aria-label={`Delete filter ${rule.name}`} onClick={() => void remove(rule)}><Trash2 /></Button>
              </div>
            </li>
          ))}
          {filters.length === 0 ? <li className="text-sm text-muted-foreground">No filters yet. New mail lands in the inbox and is sorted only by splits.</li> : null}
        </ul>

        {readOnly ? null : (
          <form className="grid gap-4 rounded-md border p-3" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="filter-name">Filter name</Label>
                <Input id="filter-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="Receipts" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-match">Match</Label>
                <Select value={match} onValueChange={(value) => { setMatch(value as "all" | "any"); setPreview(null); }}>
                  <SelectTrigger id="filter-match" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions</SelectItem>
                    <SelectItem value="any">Any condition</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Conditions</legend>
              {conditions.map((condition, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Select value={condition.field} onValueChange={(value) => updateCondition(index, { field: value as FilterField, value: value === "has-attachment" ? "yes" : condition.field === "has-attachment" ? "" : condition.value })}>
                    <SelectTrigger aria-label={`Condition ${index + 1} field`} className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FILTER_FIELDS.map((field) => <SelectItem key={field} value={field}>{FILTER_FIELD_LABELS[field]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {conditionNeedsValue(condition.field) ? (
                    <Input
                      aria-label={`Condition ${index + 1} value`}
                      value={condition.value}
                      onChange={(event) => updateCondition(index, { value: event.target.value })}
                      placeholder={condition.field === "from" ? "@acme.com" : condition.field === "list-id" ? "weekly.letters.io" : condition.field === "to" ? "team@acme.com" : "invoice"}
                      maxLength={200}
                    />
                  ) : (
                    <Select value={condition.value || "yes"} onValueChange={(value) => updateCondition(index, { value })}>
                      <SelectTrigger aria-label={`Condition ${index + 1} value`} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button type="button" size="icon" variant="ghost" aria-label={`Remove condition ${index + 1}`} disabled={conditions.length === 1} onClick={() => { setConditions((current) => current.filter((_, position) => position !== index)); setPreview(null); }}><X /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="justify-self-start" disabled={conditions.length >= 6} onClick={() => setConditions((current) => [...current, { field: "subject", value: "" }])}><Plus /> Add condition</Button>
            </fieldset>

            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Then</legend>
              <div className="grid gap-1.5 sm:max-w-xs">
                <Label htmlFor="filter-label">Apply label (optional)</Label>
                <Input id="filter-label" value={actions.label ?? ""} onChange={(event) => setActions((current) => ({ ...current, label: event.target.value || null }))} maxLength={40} placeholder="Receipts" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTION_OPTIONS.map((option) => (
                  <label key={option.key} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={actions[option.key]} onCheckedChange={(value) => setActions((current) => ({ ...current, [option.key]: value === true }))} />
                    <span><span className="font-medium">{option.label}</span> <span className="text-muted-foreground">— {option.hint}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {preview ? <PreviewResult preview={preview} /> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void runPreview()}>
                {pending === "preview" ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Test against existing mail
              </Button>
              <Button type="submit" disabled={pending !== null}>{pending === "save" ? <LoaderCircle className="animate-spin" /> : <Plus />} Save filter</Button>
            </div>
          </form>
        )}
        {error ? (
          <Alert variant="destructive"><CircleAlert /><AlertTitle>That did not work</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
        ) : null}
      </CardContent>

      <Dialog open={applying !== null} onOpenChange={(open) => { if (!open) setApplying(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply “{applying?.name}” to existing mail?</DialogTitle>
            <DialogDescription>
              {applying ? <>If {describeConditions(applying)} → {describeActions(applying.actions)}. Threads in Trash are never touched. This is recorded in the audit log.</> : null}
            </DialogDescription>
          </DialogHeader>
          {applyState === "loading" ? <p className="text-sm text-muted-foreground"><LoaderCircle className="mr-1 inline size-4 animate-spin" /> Testing against existing mail…</p> : null}
          {applyPreview ? <PreviewResult preview={applyPreview} /> : null}
          {applyResult ? <p className="text-sm" role="status">{applyResult}</p> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplying(null)}>Close</Button>
            <Button onClick={() => void confirmApply()} disabled={applyState !== "idle" || !applyPreview || applyPreview.threads === 0 || Boolean(applyResult)}>
              {applyState === "running" ? <LoaderCircle className="animate-spin" /> : <Play />} Apply to {applyPreview?.threads ?? 0} thread{applyPreview?.threads === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
