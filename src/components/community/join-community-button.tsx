"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

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
      router.push(`/apps/community?c=${encodeURIComponent(tenantId)}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={join} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null} Join community</Button>
      {error ? <p className="text-sm text-[var(--destructive)]" role="alert">{error}</p> : null}
    </div>
  );
}
