import Link from "next/link";

import { FeedbackMark } from "@/brands/feedback/mark";

export function PublicUnavailable({ message }: { message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-brand-subtle px-4 py-12 text-foreground">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center">
        <FeedbackMark size={40} className="mx-auto" />
        <h1 className="brand-heading mt-5 text-2xl">This page is taking a break</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{message} Try again in a moment.</p>
        <Link href="/apps/feedback" className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Go to Feedback
        </Link>
      </div>
    </main>
  );
}
