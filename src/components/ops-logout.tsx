"use client";

import { useRouter } from "next/navigation";

export function OpsLogout() {
  const router = useRouter();

  async function logOut() {
    await fetch("/api/ops/logout", { method: "POST" });
    router.refresh();
  }

  return (
    <button className="text-link mission-hero-link" type="button" onClick={logOut}>
      End session
    </button>
  );
}
