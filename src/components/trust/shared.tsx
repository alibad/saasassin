"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTROL_STATUS_LABELS, type ControlStatus, type EvidenceFreshness, type RiskLevel } from "@/lib/trust/model";

import type { TrustSnapshot } from "./types";

export const panel = "rounded-none border-2 border-[#171715] bg-[#fffdf7] shadow-[4px_4px_0_#171715]";

const STATUS_STYLES: Record<ControlStatus, string> = {
  not_started: "bg-white text-[#171715]",
  in_progress: "bg-[#dfe5ff] text-[#171715]",
  implemented: "bg-[#e8ff59] text-[#171715]",
  needs_evidence: "bg-[#ffd8cf] text-[#7a1b06]",
  not_applicable: "bg-[#ecebe5] text-[#57564f]",
};

export function StatusBadge({ status }: { status: ControlStatus }) {
  return (
    <Badge variant="outline" className={`rounded-none border-[#171715] ${STATUS_STYLES[status]}`}>
      {CONTROL_STATUS_LABELS[status]}
    </Badge>
  );
}

const FRESHNESS: Record<EvidenceFreshness, [string, string]> = {
  fresh: ["Current", "bg-[#e8ff59]"],
  no_expiry: ["No expiry", "bg-white"],
  expiring_soon: ["Expiring soon", "bg-[#fff1b8]"],
  expired: ["Expired", "bg-[#ffd8cf] text-[#7a1b06]"],
};

export function FreshnessBadge({ freshness }: { freshness: EvidenceFreshness }) {
  const [label, style] = FRESHNESS[freshness];
  return <Badge variant="outline" className={`rounded-none border-[#171715] text-[#171715] ${style}`}>{label}</Badge>;
}

const LEVEL_STYLES: Record<RiskLevel, string> = {
  low: "bg-white",
  medium: "bg-[#fff1b8]",
  high: "bg-[#ffc2a8]",
  critical: "bg-[#ff7458] text-white",
};

export function RiskBadge({ level, score }: { level: RiskLevel; score: number }) {
  return (
    <Badge variant="outline" className={`rounded-none border-[#171715] capitalize text-[#171715] ${LEVEL_STYLES[level]}`}>
      {level} · {score}
    </Badge>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
      {children}
      {hint ? <p className="text-xs text-[#6d6c64]">{hint}</p> : null}
    </div>
  );
}

const NONE = "__none";

export function MemberSelect({
  id,
  members,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  members: TrustSnapshot["members"];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const emails = [...new Set([...members.map((member) => member.email), ...(value ? [value] : [])])].filter(Boolean);
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full rounded-none border-[#171715]"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {emails.map((email) => <SelectItem key={email} value={email}>{email}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function SimpleSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  id?: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <SelectTrigger id={id} className={`w-full rounded-none border-[#171715] ${className ?? ""}`}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ControlPicker({
  controls,
  selected,
  onChange,
}: {
  controls: TrustSnapshot["controls"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return controls.filter((control) =>
      !needle || `${control.requirementRefs.join(" ")} ${control.title} ${control.category}`.toLowerCase().includes(needle),
    );
  }, [controls, query]);
  return (
    <div className="grid gap-2">
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter controls (e.g. CC6 or access)" className="rounded-none border-[#171715]" aria-label="Filter controls" />
      <ScrollArea className="h-44 border border-[#171715] bg-white">
        <div className="grid gap-1 p-2">
          {filtered.map((control) => {
            const checked = selected.includes(control.id);
            return (
              <label key={control.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    onChange(value ? [...selected, control.id] : selected.filter((entry) => entry !== control.id))
                  }
                />
                <span><strong>{control.requirementRefs.join(", ")}</strong> {control.title}</span>
              </label>
            );
          })}
          {filtered.length === 0 ? <p className="p-2 text-sm text-[#6d6c64]">No controls match.</p> : null}
        </div>
      </ScrollArea>
      <p className="text-xs text-[#6d6c64]">{selected.length} selected</p>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-2 border-dashed border-[#171715] bg-white/60 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm text-[#6d6c64]">{children}</div> : null}
    </div>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: value.length === 10 ? "UTC" : undefined }).format(date);
}
