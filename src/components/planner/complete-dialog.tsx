"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { apiJson, minutesLabel } from "./format";

/** What is being completed: a one-off task (PATCH) or one occurrence of a repeating task (POST). */
export type CompleteTarget = {
  title: string;
  estimateMinutes: number;
  url: string;
  method: "PATCH" | "POST";
  body: Record<string, unknown>;
  success: string;
};

export function CompleteDialog({
  target,
  onClose,
  busy,
  mutate,
}: {
  target: CompleteTarget | null;
  onClose: (completed: boolean) => void;
  busy: boolean;
  mutate: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}) {
  const [actual, setActual] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    if (!target) return;
    const trimmed = actual.trim();
    const minutes = trimmed === "" ? null : Number(trimmed);
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 2400)) return setError("Actual time is whole minutes between 1 and 2400, or leave it empty.");
    const ok = await mutate(
      () => apiJson(target.url, { method: target.method, body: JSON.stringify({ ...target.body, ...(minutes !== null ? { actualMinutes: minutes } : {}) }) }),
      target.success,
    );
    if (ok) {
      setActual("");
      onClose(true);
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open) { setActual(""); setError(null); onClose(false); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark “{target?.title}” done</DialogTitle>
          <DialogDescription>
            Estimated {minutesLabel(target?.estimateMinutes ?? 0)}. Recording how long it really took powers estimate accuracy under Insights — optional.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          <Label htmlFor="actual-minutes">Actual time (minutes)</Label>
          <Input id="actual-minutes" type="number" min={1} max={2400} inputMode="numeric" placeholder={String(target?.estimateMinutes ?? "")} value={actual} onChange={(event) => setActual(event.target.value)} />
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>
          <Button disabled={busy} onClick={complete}><CheckCircle2 /> Mark done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
