import { ChevronUp, MessageCircle, Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** Sample board for the preview: a fictional notes app, shown inside the product UI only. */
type Status = "Open" | "Planned" | "In progress" | "Completed";

const posts: { votes: number; title: string; body: string; status: Status; comments: number; tag: string; voted?: boolean }[] = [
  { votes: 142, title: "Offline mode for the mobile app", body: "I take notes on the train and lose everything when the signal drops.", status: "Planned", comments: 38, tag: "mobile", voted: true },
  { votes: 97, title: "Share a notebook with a read-only link", body: "Clients need to see the notes without an account.", status: "In progress", comments: 21, tag: "sharing" },
  { votes: 64, title: "Markdown tables", body: "Pasting tables from a doc breaks the layout.", status: "Completed", comments: 12, tag: "editor" },
  { votes: 51, title: "Calendar view for daily notes", body: "A month grid to jump to any day's note.", status: "Open", comments: 9, tag: "views" },
];

export const statusClass: Record<Status, string> = {
  Open: "border border-border text-muted-foreground",
  Planned: "bg-secondary text-secondary-foreground",
  "In progress": "bg-accent text-accent-foreground",
  Completed: "bg-primary text-primary-foreground",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold", statusClass[status], className)}>{status}</span>
  );
}

export function VoteBox({ votes, voted, className }: { votes: number; voted?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "flex w-12 shrink-0 flex-col items-center justify-center rounded-[10px] border py-1.5 font-bold tabular-nums",
        voted ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground",
        className,
      )}
    >
      <ChevronUp className="size-4" aria-hidden="true" />
      <span className="text-[13px] leading-none">{votes}</span>
    </span>
  );
}

const roadmap: { status: Status; items: string[] }[] = [
  { status: "Planned", items: ["Offline mode for the mobile app", "Templates for meeting notes"] },
  { status: "In progress", items: ["Share a notebook with a read-only link"] },
  { status: "Completed", items: ["Markdown tables", "Dark mode on Android"] },
];

/** A public board: ideas with one-person-one-vote counts and statuses, beside the roadmap. */
export function FeedbackPreview() {
  return (
    <div className="bg-background text-[13px]">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex size-8 items-center justify-center rounded-[10px] bg-foreground text-[12px] font-extrabold text-background" aria-hidden="true">
          O
        </span>
        <div className="min-w-0">
          <p className="brand-heading truncate text-[15px] leading-tight">Orbit Notes</p>
          <p className="text-[11px] text-muted-foreground">Feature ideas · public board</p>
        </div>
        <nav className="ml-auto hidden items-center gap-1 text-[12px] font-semibold sm:flex">
          {["Ideas", "Roadmap", "Changelog"].map((tab, index) => (
            <span key={tab} className={cn("rounded-full px-3 py-1", index === 0 ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}>
              {tab}
            </span>
          ))}
        </nav>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground">
              <Search className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Search ideas…</span>
            </div>
            <span className="inline-flex h-9 items-center rounded-[10px] border border-border px-3 font-semibold">Top</span>
            <span className="inline-flex h-9 items-center rounded-[10px] bg-primary px-3 font-semibold text-primary-foreground">Post an idea</span>
          </div>
          <ul className="mt-4 grid gap-2.5">
            {posts.map((post) => (
              <li key={post.title} className="flex gap-3 rounded-[12px] border border-border bg-card p-3">
                <VoteBox votes={post.votes} voted={post.voted} />
                <div className="min-w-0">
                  <p className="font-bold leading-snug">{post.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-[12px] text-muted-foreground">{post.body}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <StatusPill status={post.status} />
                    <span className="flex items-center gap-1">
                      <MessageCircle className="size-3" aria-hidden="true" />
                      {post.comments}
                    </span>
                    <span>#{post.tag}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="hidden border-l border-border bg-brand-subtle p-4 lg:block">
          <p className="text-[11px] font-bold text-muted-foreground">Roadmap</p>
          <div className="mt-3 grid gap-3">
            {roadmap.map((column) => (
              <div key={column.status} className="rounded-[12px] border border-border bg-card p-3">
                <StatusPill status={column.status} />
                <ul className="mt-2 grid gap-1.5">
                  {column.items.map((item) => (
                    <li key={item} className="flex gap-2 text-[12px] leading-snug">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--chart-1)]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[12px] border border-dashed border-border p-3 text-[12px]">
            <p className="font-bold">Changelog · Nov 12</p>
            <p className="mt-0.5 text-muted-foreground">Markdown tables are here — thanks to 64 voters.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
