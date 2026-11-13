import { Bookmark, CalendarDays, Check, GraduationCap, Hash, Lightbulb, Lock, Megaphone, MessageCircle, PartyPopper, Pin, Search, ThumbsUp } from "lucide-react";

import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Sample data for the preview: a fictional makers' community, shown inside the product UI only. */
const spaces = [
  { name: "Introductions", icon: Hash, unread: 0 },
  { name: "Show & tell", icon: Hash, unread: 4, active: true },
  { name: "Announcements", icon: Megaphone, unread: 1 },
  { name: "Workshop nights", icon: CalendarDays, unread: 0 },
  { name: "Founding members", icon: Lock, unread: 0 },
];

/** Opaque tints, so overlapping avatars in a group stay readable. */
const tones = [
  "bg-[color-mix(in_oklab,var(--primary)_16%,var(--card))] text-primary",
  "bg-[color-mix(in_oklab,var(--brand-accent)_30%,var(--card))] text-accent-foreground",
  "bg-[color-mix(in_oklab,var(--chart-3)_45%,var(--card))] text-secondary-foreground",
  "bg-secondary text-secondary-foreground",
];

function Person({ initials, tone = 0, size = "default" }: { initials: string; tone?: number; size?: "default" | "sm" }) {
  return (
    <Avatar size={size}>
      <AvatarFallback className={cn("font-semibold", tones[tone % tones.length])}>{initials}</AvatarFallback>
    </Avatar>
  );
}

function Reaction({ icon: Icon, count, mine }: { icon: typeof ThumbsUp; count: number; mine?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        mine ? "bg-primary/10 text-primary ring-primary/30" : "bg-background text-muted-foreground ring-border",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {count}
    </span>
  );
}

/** The community feed: spaces, posts with reactions and replies, and the next event. */
export function CommunityPreview() {
  return (
    <div className="grid bg-background text-left text-[13px] leading-relaxed md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)_250px]">
      <aside className="hidden border-r border-border bg-brand-subtle p-4 md:block">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-[12px] font-bold text-primary-foreground">RM</span>
          <div className="min-w-0">
            <p className="brand-heading truncate text-[14px] leading-tight">Riverside Makers</p>
            <p className="text-[11px] text-muted-foreground">318 members</p>
          </div>
        </div>
        <p className="mt-6 text-[11px] font-semibold text-muted-foreground">Spaces</p>
        <ul className="mt-2 grid gap-0.5">
          {spaces.map(({ name, icon: Icon, unread, active }) => (
            <li
              key={name}
              className={cn(
                "flex items-center gap-2 rounded-[10px] px-2.5 py-1.5",
                active ? "bg-background font-semibold shadow-xs ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{name}</span>
              {unread ? (
                <span className="ml-auto rounded-full bg-brand-accent px-1.5 text-[10px] font-semibold text-brand-accent-foreground">{unread}</span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[11px] font-semibold text-muted-foreground">Courses</p>
        <div className="mt-2 rounded-[12px] bg-background p-3 ring-1 ring-border">
          <p className="flex items-center gap-1.5 font-semibold">
            <GraduationCap className="size-3.5 text-primary" aria-hidden="true" />
            Joinery basics
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Lesson 4 of 6 · next unlocks Friday</p>
          <Progress value={66} className="mt-2" />
        </div>
      </aside>

      <section className="min-w-0 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="brand-heading flex items-center gap-1.5 text-lg">
            <Hash className="size-4 text-muted-foreground" aria-hidden="true" />
            Show &amp; tell
          </h3>
          <div className="flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3 text-muted-foreground sm:w-56">
            <Search className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Search posts…</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-[16px] border border-border bg-card p-3">
          <Person initials="YO" tone={3} size="sm" />
          <span className="text-muted-foreground">Share something with Show &amp; tell…</span>
        </div>

        <article className="mt-4 rounded-[16px] border border-border bg-card p-4">
          <div className="flex items-center gap-2.5">
            <Person initials="PN" tone={0} />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">
                Priya Nair <span className="font-normal text-muted-foreground">@priya · 2h</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Moderator</p>
            </div>
            <Pin className="ml-auto size-3.5 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-3 text-[14px]">
            Finished the walnut side table from last month&rsquo;s workshop night. Dovetails took three tries — photos of the failed ones in the
            thread so you can laugh with me.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden="true">
            <div className="h-20 rounded-[12px] bg-[linear-gradient(135deg,var(--chart-1),var(--chart-3))] opacity-80" />
            <div className="h-20 rounded-[12px] bg-[linear-gradient(135deg,var(--chart-2),var(--chart-5))] opacity-80" />
            <div className="h-20 rounded-[12px] bg-[linear-gradient(135deg,var(--chart-4),var(--chart-1))] opacity-80" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Reaction icon={ThumbsUp} count={24} mine />
            <Reaction icon={PartyPopper} count={11} />
            <Reaction icon={Lightbulb} count={3} />
            <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <MessageCircle className="size-3.5" aria-hidden="true" />
              8 replies
            </span>
            <Bookmark className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
        </article>

        <article className="mt-3 rounded-[16px] border border-border bg-card p-4">
          <div className="flex items-center gap-2.5">
            <Person initials="TR" tone={1} />
            <p className="font-semibold leading-tight">
              Tomás Ruiz <span className="font-normal text-muted-foreground">@tomas · 5h</span>
            </p>
          </div>
          <p className="mt-3 text-[14px]">
            First bowl off the lathe! <span className="font-medium text-primary">@priya</span> your sharpening tip saved me.
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <Reaction icon={ThumbsUp} count={9} />
            <Reaction icon={PartyPopper} count={14} mine />
            <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <MessageCircle className="size-3.5" aria-hidden="true" />3 replies
            </span>
          </div>
        </article>
      </section>

      <aside className="hidden border-l border-border bg-card p-4 lg:block">
        <p className="text-[11px] font-semibold text-muted-foreground">Next event</p>
        <div className="mt-2 overflow-hidden rounded-[16px] ring-1 ring-border">
          <div className="flex items-center gap-3 bg-primary p-3 text-primary-foreground">
            <div className="rounded-[10px] bg-primary-foreground/15 px-2 py-1 text-center leading-none">
              <p className="text-[10px] font-semibold">NOV</p>
              <p className="brand-heading text-xl">21</p>
            </div>
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Open workshop night</p>
              <p className="text-[11px] opacity-85">Thu · 6:30 pm · Unit 4</p>
            </div>
          </div>
          <div className="p-3">
            <div className="flex items-center justify-between">
              <AvatarGroup>
                <Person initials="PN" tone={0} size="sm" />
                <Person initials="TR" tone={1} size="sm" />
                <Person initials="JP" tone={2} size="sm" />
                <AvatarGroupCount className="size-6 text-[10px]">+23</AvatarGroupCount>
              </AvatarGroup>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                <Check className="size-3" aria-hidden="true" />
                Going
              </span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">26 going · Add to calendar (.ics)</p>
          </div>
        </div>
        <p className="mt-5 text-[11px] font-semibold text-muted-foreground">Inbox</p>
        <ul className="mt-2 grid gap-2">
          {[
            ["JP", "June Park replied to your post", 2],
            ["TR", "Tomás mentioned you in Show & tell", 1],
          ].map(([initials, text, tone]) => (
            <li key={String(text)} className="flex items-start gap-2">
              <Person initials={String(initials)} tone={Number(tone)} size="sm" />
              <span className="text-[12px] leading-snug">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[11px] font-semibold text-muted-foreground">New this week</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["@junebug", "@kofi", "@ines-m", "@sam_w"].map((handle) => (
            <Badge key={handle} variant="secondary" className="text-[10px]">
              {handle}
            </Badge>
          ))}
        </div>
      </aside>
    </div>
  );
}
