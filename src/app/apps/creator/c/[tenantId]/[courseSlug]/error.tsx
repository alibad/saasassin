"use client";

import { Button } from "@/components/ui/button";

export default function CourseError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="fleet-app grid min-h-screen place-items-center bg-[#f6f1e7] px-4 text-neutral-900">
      <div className="max-w-md space-y-3 border-2 border-neutral-900 bg-white p-8 shadow-[4px_4px_0_0_#171717]">
        <h1 className="text-2xl font-bold">This course could not be loaded</h1>
        <p className="text-neutral-700">Something went wrong on our side. Your progress is saved; try again in a moment.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
