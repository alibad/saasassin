"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function CourseError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
      <div className="grid max-w-md gap-3 rounded-3xl bg-card p-8 text-center ring-1 ring-border">
        <h1 className="brand-heading text-3xl">This course didn&apos;t load</h1>
        <p className="text-muted-foreground">Something went wrong on our side. Your progress is saved; try again in a moment.</p>
        <Button className="mx-auto mt-2 rounded-xl" onClick={reset}><RefreshCw aria-hidden="true" /> Try again</Button>
      </div>
    </main>
  );
}
