import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A titled settings card: what it is in one sentence, then its controls. */
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] sm:p-6", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="brand-heading text-lg">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Page title for a workspace section. */
export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="brand-heading text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
