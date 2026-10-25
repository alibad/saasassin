"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

export function CreatorSignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await fetch("/api/fleet/creator/session", { method: "DELETE" }).catch(() => null);
    try { await signOut(getFirebaseClientAuth()); } catch { /* server session is already cleared */ }
    router.push("/apps/creator");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSignOut} disabled={pending}>
      <LogOut aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
