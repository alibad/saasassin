"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import { api } from "./api";

export function JoinCommunityButton({ tenantId, inviteCode }: { tenantId: string; inviteCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/community/join", { method: "POST", body: JSON.stringify({ tenantId, inviteCode }) });
      router.push(`/apps/community?workspace=${encodeURIComponent(tenantId)}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "You couldn't join just now. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button size="lg" className="h-11 rounded-full text-base" onClick={join} disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : null} Join the community <ArrowRight />
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
