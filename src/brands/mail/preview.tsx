import { AlarmClock, Archive, CalendarDays, Clock3, FileText, Inbox, Search, Send, Star, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";

/** Fictional threads, shown inside the product UI only. */
const threads = [
  { from: "Priya Raman", subject: "Contract redlines — second pass", snippet: "I've accepted most of your edits; two notes on clause 7 before we…", time: "9:41", unread: true, selected: true },
  { from: "Ops calendar", subject: "Invitation: Quarterly planning", snippet: "Thu 14:00 – 15:30 · Room 4 and video link", time: "9:12", unread: true, invite: true },
  { from: "Marco Bianchi", subject: "Re: Launch checklist", snippet: "Docs are merged. Waiting on the pricing page copy, then we're…", time: "8:57", unread: true },
  { from: "Lena Okafor", subject: "Intro: design partner at Northwind", snippet: "Looping you in — Sam runs the platform team and asked about…", time: "Yesterday", unread: false, star: true },
  { from: "Finance", subject: "Expense report approved", snippet: "Your October report was approved and will be paid on the…", time: "Yesterday", unread: false },
  { from: "Jun Park", subject: "Re: Offsite dates", snippet: "Either week works for me. If we pick the 14th I can book…", time: "Mon", unread: false },
];

function Key({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-border bg-secondary px-1 font-sans text-[10px] font-semibold text-secondary-foreground shadow-[0_1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** The inbox: folders, split tabs, a keyboard-selected thread, the reading pane and the palette. */
export function MailPreview() {
  return (
    <div className="relative grid min-h-[460px] bg-background text-[13px] md:grid-cols-[180px_minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,0.9fr)]">
      <aside className="hidden flex-col gap-0.5 border-r border-border bg-sidebar p-3 text-sidebar-foreground md:flex">
        {[
          [Inbox, "Inbox", "12", true],
          [Archive, "Done", "", false],
          [AlarmClock, "Snoozed", "3", false],
          [Clock3, "Scheduled", "1", false],
          [FileText, "Drafts", "2", false],
          [Star, "Starred", "", false],
          [UsersRound, "Contacts", "", false],
        ].map(([Icon, label, count, active]) => {
          const ItemIcon = Icon as typeof Inbox;
          return (
            <div
              key={String(label)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5",
                active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-muted-foreground",
              )}
            >
              <ItemIcon className="size-3.5" aria-hidden="true" />
              {String(label)}
              {count ? <span className="ml-auto text-[11px] tabular-nums">{String(count)}</span> : null}
            </div>
          );
        })}
        <div className="mt-auto rounded-md border border-border p-2.5 text-[11px] leading-snug text-muted-foreground">
          <span className="font-semibold text-foreground">Imported</span> 2,418 messages from archive.mbox
        </div>
      </aside>

      <section className="min-w-0 border-r border-border">
        <div className="flex items-center gap-1 overflow-hidden border-b border-border px-3 pt-3">
          {[
            ["Important", "4", true],
            ["Calendar", "2", false],
            ["News", "12", false],
          ].map(([label, count, active]) => (
            <span
              key={String(label)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5",
                active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground",
              )}
            >
              {String(label)}
              {count ? <span className="text-[11px] text-muted-foreground tabular-nums">{String(count)}</span> : null}
            </span>
          ))}
          <span className="mb-2 ml-auto hidden items-center gap-1.5 text-muted-foreground 2xl:flex">
            <Search className="size-3.5" aria-hidden="true" />
            <Key>/</Key>
          </span>
        </div>
        <ul>
          {threads.map((thread) => (
            <li
              key={thread.subject}
              className={cn(
                "relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-border/70 px-4 py-2.5",
                thread.selected && "bg-accent/60",
              )}
            >
              {thread.selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
              <div className="flex min-w-0 items-center gap-2">
                {thread.unread ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : <span className="size-1.5 shrink-0" />}
                <span className={cn("truncate", thread.unread ? "font-semibold" : "text-muted-foreground")}>{thread.from}</span>
                {thread.invite ? <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                {thread.star ? <Star className="size-3.5 shrink-0 fill-current text-brand-accent" aria-hidden="true" /> : null}
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{thread.time}</span>
              <p className="col-span-2 mt-0.5 truncate pl-3.5">
                <span className={cn(thread.unread && "font-medium")}>{thread.subject}</span>
                <span className="text-muted-foreground"> — {thread.snippet}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Key>j</Key><Key>k</Key> move</span>
          <span className="flex items-center gap-1.5"><Key>e</Key> done</span>
          <span className="flex items-center gap-1.5"><Key>h</Key> snooze</span>
          <span className="flex items-center gap-1.5"><Key>z</Key> undo</span>
        </div>
      </section>

      <section className="hidden min-w-0 p-5 lg:block">
        <p className="text-[11px] text-muted-foreground">Important · 3 messages</p>
        <h3 className="brand-heading mt-1.5 text-lg leading-snug">Contract redlines — second pass</h3>
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">PR</span>
            <span className="font-semibold">Priya Raman</span>
            <span className="ml-auto text-[11px] text-muted-foreground">9:41</span>
          </div>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            I&rsquo;ve accepted most of your edits. Two notes on clause 7 before we send it back — can you take a look before Thursday?
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-muted-foreground">
          <Send className="size-3.5" aria-hidden="true" />
          Reply
          <Key className="ml-auto">r</Key>
        </div>
      </section>

      <div className="absolute right-6 bottom-6 hidden w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)] xl:block">
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5 text-muted-foreground">
          <Search className="size-3.5" aria-hidden="true" />
          snooze
          <span className="ml-auto flex gap-1"><Key>⌘</Key><Key>K</Key></span>
        </div>
        {[
          ["Snooze until tomorrow 9:00", "h", true],
          ["Snooze until Monday", "", false],
          ["Follow up if no reply", "f", false],
        ].map(([label, key, active]) => (
          <div key={String(label)} className={cn("flex items-center gap-2 px-3.5 py-2", active && "bg-accent text-accent-foreground")}>
            <AlarmClock className="size-3.5" aria-hidden="true" />
            {String(label)}
            {key ? <Key className="ml-auto">{String(key)}</Key> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export { Key };
