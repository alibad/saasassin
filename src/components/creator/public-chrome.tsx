import type { ReactNode } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export function PublicChrome({ schoolName, children, right }: { schoolName: string; children: ReactNode; right?: ReactNode }) {
  return (
    <main className="fleet-app min-h-screen bg-[#f6f1e7] text-neutral-900">
      <header className="border-b-2 border-neutral-900 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-bold">
            <span className="grid size-8 place-items-center border-2 border-neutral-900 bg-[#ff3d93] text-white"><GraduationCap className="size-4" aria-hidden="true" /></span>
            {schoolName}
          </span>
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-neutral-500">
        Hosted on <Link className="underline" href="/apps/creator">SaaSassin Creator</Link> — open, exportable course hosting.
      </footer>
    </main>
  );
}
