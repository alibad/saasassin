"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BellOff,
  BellRing,
  BookUser,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Clock3,
  Command,
  Download,
  FileUp,
  History,
  Inbox,
  LoaderCircle,
  MailOpen,
  Menu,
  Newspaper,
  Paperclip,
  PenLine,
  Plug,
  RefreshCw,
  Reply,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Undo2,
  Users,
  X,
} from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { readableAuthError } from "@/components/account/auth-errors";
import { accountApiBase, accountRequest, refreshAccount, useAccount } from "@/components/account/client";
import { TeamPanel } from "@/components/account/team-panel";
import { acceptPendingInvitation, WorkspaceSwitcher } from "@/components/account/workspace-switcher";
import { MailMark } from "@/brands/mail/mark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { productLinks } from "@/lib/brand/links";
import { ThemeToggle } from "@/lib/brand/theme-toggle";
import { scheduleStatus } from "@/lib/mail/schedule";
import {
  applyThreadAction,
  assignSplit,
  formatAddress,
  hasReplySinceReminder,
  inverseAction,
  isReminderDue,
  isSnoozed,
  PRIMARY_SPLIT,
  quoteBody,
  replySubject,
  sortThreads,
  splitCounts,
  threadView,
} from "@/lib/mail/workflow";
import { cn } from "@/lib/utils";

import { AuditPanel, ConnectionsPanel, SnippetsPanel, SplitsPanel } from "./mail-admin";
import { api, tenantPath, type Draft, type Mailbox, type Message, type SearchHit, type ThreadAction, type ThreadRecord } from "./mail-api";
import { ContactsPanel } from "./mail-contacts";
import { CommandPalette, ComposeDialog, DateActionDialog, ImportDialog, LabelDialog, ShortcutsDialog, TrashDialog, type ComposeSeed, type PaletteCommand } from "./mail-dialogs";
import { FiltersPanel } from "./mail-filters";
import { AddressAvatar, displayName, MailPeopleProvider, usePeople } from "./mail-people";
import { UnsubscribeHelper } from "./mail-unsubscribe";
import styles from "./mail.module.css";

const PRODUCT = "mail";
const TENANT_KEY = "mail:last-workspace";
const links = productLinks(PRODUCT);

type View = "inbox" | "starred" | "snoozed" | "reminders" | "drafts" | "scheduled" | "archived" | "trash" | "search" | `label:${string}`;
type Page = "mail" | "contacts" | "rules" | "connections" | "team" | "activity";

const PAGES: Array<{ id: Exclude<Page, "mail">; label: string; icon: typeof Inbox; description: string }> = [
  { id: "contacts", label: "Contacts", icon: BookUser, description: "Everyone in your mail, and how much you write to each other." },
  { id: "rules", label: "Splits & filters", icon: SlidersHorizontal, description: "Split your inbox, file mail automatically and keep reusable snippets." },
  { id: "connections", label: "Accounts", icon: Plug, description: "Where your mail comes from." },
  { id: "team", label: "Team", icon: Users, description: "Who shares this mailbox, and what they can do." },
  { id: "activity", label: "Activity", icon: History, description: "Every import, triage action and change in this mailbox." },
];

function isPage(value: string | null): value is Page {
  return value === "mail" || PAGES.some((page) => page.id === value);
}

function readStoredTenant() {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

function storeTenant(id: string | null) {
  try {
    if (id) window.localStorage.setItem(TENANT_KEY, id);
    else window.localStorage.removeItem(TENANT_KEY);
  } catch {
    /* per-viewer convenience only */
  }
}

function shortDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 6 && days > 0) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

function senderOf(thread: ThreadRecord) {
  const senders = thread.participants.filter((participant) => thread.fromAddresses.includes(participant.email));
  return senders.length ? senders : thread.participants.slice(0, 1);
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn(styles.kbd, className)}>{children}</kbd>;
}

/** An icon button with a tooltip that names the action and its shortcut. */
function ActionButton({ label, keys, onClick, disabled, children, pressed }: { label: string; keys?: string[]; onClick: () => void; disabled?: boolean; children: ReactNode; pressed?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent className="gap-2">{label}{keys?.map((key) => <Kbd key={key} className="border-background/30 bg-transparent text-background">{key}</Kbd>)}</TooltipContent>
    </Tooltip>
  );
}

/* ======================================================================== */

/** The signed-in Mail app: workspaces, the keyboard-first inbox, and the team around it. */
export function MailWorkspace() {
  return (
    <TooltipProvider delayDuration={300}>
      <Toaster />
      <Suspense fallback={<ShellSkeleton />}>
        <MailShell />
      </Suspense>
    </TooltipProvider>
  );
}

function Wordmark() {
  return (
    <Link href={links.home} className="flex items-center gap-2 text-foreground" aria-label="Mail home">
      <MailMark size={24} />
      <span className="brand-heading text-[1.05rem]">Mail</span>
    </Link>
  );
}

function MailShell() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { data, error, loading, refresh } = useAccount(PRODUCT);
  const [chosen, setChosen] = useState<string | null>(null);
  const [stored] = useState(readStoredTenant);
  const workspaces = data?.workspaces ?? [];
  const requested = params.get("workspace");
  const rawPage = params.get("view");
  const page: Page = isPage(rawPage) ? rawPage : "mail";
  const has = (id: string | null) => Boolean(id && workspaces.some((workspace) => workspace.id === id));
  const tenantId = has(chosen) ? chosen : has(requested) ? requested : has(stored) ? stored : workspaces[0]?.id ?? null;

  const replaceParams = useCallback((update: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    update(next);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    if (!requested || !data) return;
    if (has(requested)) {
      storeTenant(requested);
      replaceParams((next) => next.delete("workspace"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `has` reads `workspaces` from `data`
  }, [requested, data, replaceParams]);

  const switchTo = useCallback((id: string) => {
    setChosen(id);
    storeTenant(id);
    replaceParams((next) => {
      next.delete("workspace");
      next.delete("view");
    });
  }, [replaceParams]);

  const openPage = useCallback((next: Page) => {
    replaceParams((query) => {
      if (next === "mail") query.delete("view");
      else query.set("view", next);
    });
  }, [replaceParams]);

  if (!data) {
    if (error && !loading) {
      return (
        <div className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
          <div className="grid max-w-sm justify-items-center gap-3 text-center">
            <MailMark size={36} />
            <h1 className="brand-heading text-xl">Mail couldn&apos;t load your account</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button onClick={() => void refresh()}><RefreshCw /> Try again</Button>
              <Button variant="outline" asChild><Link href={links.signIn}>Sign in again</Link></Button>
            </div>
          </div>
        </div>
      );
    }
    return <ShellSkeleton />;
  }

  if (!tenantId) return <Welcome onCreated={switchTo} />;

  return (
    <MailApp
      key={tenantId}
      tenantId={tenantId}
      userEmail={data.profile.email}
      page={page}
      onPage={openPage}
      onSwitch={switchTo}
      onLeft={() => {
        storeTenant(null);
        setChosen(null);
        void refreshAccount(PRODUCT);
      }}
    />
  );
}

function Welcome({ onCreated }: { onCreated: (id: string) => void }) {
  const { data } = useAccount(PRODUCT);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstName = data?.profile.name?.split(/\s+/)[0] ?? "";
  const invitations = data?.pendingInvitations ?? [];

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { tenant } = await accountRequest<{ tenant: { id: string } }>(`${accountApiBase(PRODUCT)}/tenants`, { method: "POST", json: { name: name.trim() } });
      await refreshAccount(PRODUCT);
      onCreated(tenant.id);
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountMenu product={PRODUCT} accountHref={`${links.home}/account`} signInHref={links.signIn} />
        </div>
      </header>
      <main className="mx-auto grid max-w-lg gap-6 px-4 py-14 sm:py-20">
        <div className="grid gap-2">
          <h1 className="brand-heading text-3xl sm:text-4xl">{firstName ? `Welcome, ${firstName}.` : "Welcome to Mail."}</h1>
          <p className="text-muted-foreground">Create a mailbox, bring your mail in, and get through it from the keyboard: split inbox, snooze, follow-ups and undo on everything.</p>
        </div>
        {invitations.length ? (
          <Card>
            <CardContent className="grid gap-3">
              <p className="text-sm font-semibold">You&apos;ve been invited</p>
              {invitations.map((invitation) => (
                <div key={invitation.invitationId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-medium">{invitation.workspaceName}</p>
                    <p className="truncate text-xs text-muted-foreground">{invitation.roleLabel}{invitation.invitedByName ? ` · from ${invitation.invitedByName}` : ""}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void acceptPendingInvitation(PRODUCT, invitation)
                      .then(() => onCreated(invitation.tenantId))
                      .catch((caught: unknown) => toast({ title: "Couldn't join", description: readableAuthError(caught), variant: "destructive" }))}
                  >
                    Join
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent>
            <form className="grid gap-3" onSubmit={create}>
              <Label htmlFor="mail-workspace-name">Mailbox name</Label>
              <Input id="mail-workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Studio inbox" minLength={2} maxLength={80} required autoFocus />
              {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
              <Button type="submit" size="lg" disabled={saving || name.trim().length < 2}>{saving ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create mailbox</Button>
              <p className="text-xs text-muted-foreground">You&apos;ll be the owner and can invite your team next.</p>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh bg-background">
      <div className="hidden w-60 shrink-0 border-r border-border bg-sidebar p-4 lg:grid lg:content-start lg:gap-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="h-7 w-full" />)}
      </div>
      <div className="hidden w-[460px] shrink-0 gap-2 border-r border-border p-3 md:grid md:content-start">
        {Array.from({ length: 9 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
      </div>
      <div className="flex-1 p-6"><Skeleton className="h-8 w-2/3" /></div>
    </div>
  );
}

/* ======================================================================== */

/** Single-thread undo replays the inverse action; bulk undo restores the server-recorded fields. */
type Undo = { label: string; threadId?: string; action?: ThreadAction; opId?: string };

type BulkAction =
  | { type: "archive" }
  | { type: "trash" }
  | { type: "restore" }
  | { type: "star"; value: boolean }
  | { type: "read"; value: boolean }
  | { type: "label"; label: string; value: boolean };

function MailApp({
  tenantId,
  userEmail,
  page,
  onPage,
  onSwitch,
  onLeft,
}: {
  tenantId: string;
  userEmail: string;
  page: Page;
  onPage: (page: Page) => void;
  onSwitch: (id: string) => void;
  onLeft: () => void;
}) {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("inbox");
  const [split, setSplit] = useState<string>(PRIMARY_SPLIT);
  const [cursor, setCursor] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [actionError, setActionError] = useState("");
  const [undo, setUndo] = useState<Undo | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [unindexed, setUnindexed] = useState(0);
  const [reindexing, setReindexing] = useState(false);
  const [dialog, setDialog] = useState<null | "trash" | "snooze" | "remind" | "label" | "shortcuts" | "import" | "compose" | "palette">(null);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const goPrefix = useRef(0);
  const readOnly = mailbox?.role === "viewer";

  const load = useCallback(async () => {
    try {
      const data = await api<Mailbox>(tenantPath(tenantId, "/mailbox"));
      setMailbox(data);
      setLoadError("");
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not load the mailbox.");
    }
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    api<Mailbox>(tenantPath(tenantId, "/mailbox"))
      .then((data) => {
        if (!cancelled) setMailbox(data);
      })
      .catch((caught: Error) => !cancelled && setLoadError(caught.message));
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  // Snoozes and follow-ups resurface on the clock; re-evaluate every minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const threads = useMemo(() => sortThreads(mailbox?.threads ?? []), [mailbox]);
  const splits = useMemo(() => mailbox?.splits ?? [], [mailbox]);
  const counts = useMemo(() => splitCounts(threads, splits, now), [threads, splits, now]);
  const labels = useMemo(() => [...new Set(threads.flatMap((thread) => thread.labels))].sort((a, b) => a.localeCompare(b)), [threads]);
  const byId = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);

  const visible = useMemo(() => {
    if (view === "search") return (hits ?? []).map((hit) => byId.get(hit.threadId)).filter((thread): thread is ThreadRecord => Boolean(thread));
    if (view === "drafts" || view === "scheduled") return [];
    return threads.filter((thread) => {
      const where = threadView(thread, now);
      if (view === "inbox") return where === "inbox" && assignSplit(thread, splits) === split;
      if (view === "starred") return thread.starred && where !== "trash";
      if (view === "snoozed") return where === "snoozed";
      if (view === "reminders") return Boolean(thread.reminder) && thread.state !== "trash";
      if (view === "archived") return where === "archived";
      if (view === "trash") return where === "trash";
      if (view.startsWith("label:")) return thread.labels.includes(view.slice(6)) && where !== "trash";
      return false;
    });
  }, [view, hits, byId, threads, now, splits, split]);

  const selectedThreads = [...picked].map((id) => byId.get(id)).filter((thread): thread is ThreadRecord => Boolean(thread));
  const inboxUnread = Object.values(counts).reduce((sum, count) => sum + count.unread, 0);
  const activeIndex = Math.min(cursor, Math.max(0, visible.length - 1));
  const selected = visible[activeIndex] ?? null;
  const openThread = openId ? byId.get(openId) ?? null : null;
  const target = openThread ?? selected;

  function patchLocal(threadId: string, patch: Partial<ThreadRecord>) {
    setMailbox((current) => (current ? { ...current, threads: current.threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread)) } : current));
  }

  const act = useCallback(
    async (thread: ThreadRecord, action: ThreadAction, label?: string, options: { recordUndo?: boolean } = {}) => {
      if (readOnly) {
        setActionError("Your viewer role cannot change threads.");
        return;
      }
      setActionError("");
      let patch: Partial<ThreadRecord>;
      try {
        patch = applyThreadAction(thread, action, new Date());
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "That action is not possible.");
        return;
      }
      const inverse = inverseAction(thread, action);
      patchLocal(thread.id, patch);
      if (options.recordUndo !== false && inverse && label) setUndo({ threadId: thread.id, action: inverse, label });
      try {
        await api(tenantPath(tenantId, `/threads/${thread.id}`), { method: "POST", json: { action } });
      } catch (caught) {
        patchLocal(thread.id, thread);
        setActionError(caught instanceof Error ? caught.message : "The change was not saved.");
      }
    },
    [readOnly, tenantId],
  );

  const leaveThreadAfter = useCallback(() => setOpenId(null), []);

  const mergeThreads = useCallback((updated: ThreadRecord[]) => {
    setMailbox((current) => {
      if (!current) return current;
      const next = new Map(updated.map((thread) => [thread.id, thread]));
      return { ...current, threads: current.threads.map((thread) => next.get(thread.id) ?? thread) };
    });
  }, []);

  const bulk = useCallback(
    async (action: BulkAction, label: string) => {
      if (readOnly) {
        setActionError("Your viewer role cannot change threads.");
        return;
      }
      const ids = [...picked].filter((id) => byId.has(id));
      if (!ids.length) return;
      setActionError("");
      try {
        const result = await api<{ opId: string; threads: ThreadRecord[] }>(tenantPath(tenantId, "/bulk"), { method: "POST", json: { threadIds: ids, action } });
        mergeThreads(result.threads);
        setUndo({ label: `${label} ${ids.length} thread${ids.length === 1 ? "" : "s"}`, opId: result.opId });
        if (action.type !== "label") setPicked(new Set());
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "The change was not saved.");
      }
    },
    [byId, mergeThreads, readOnly, picked, tenantId],
  );

  const runUndo = useCallback(async () => {
    if (!undo) return;
    setUndo(null);
    if (undo.opId) {
      try {
        const result = await api<{ threads: ThreadRecord[] }>(tenantPath(tenantId, `/bulk/${undo.opId}/undo`), { method: "POST" });
        mergeThreads(result.threads);
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "Undo failed.");
      }
      return;
    }
    const thread = undo.threadId ? byId.get(undo.threadId) : null;
    if (thread && undo.action) void act(thread, undo.action, undefined, { recordUndo: false });
  }, [act, byId, mergeThreads, tenantId, undo]);

  function toggleSelected(id: string, value?: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (value ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const openThreadById = useCallback(
    async (thread: ThreadRecord) => {
      setOpenId(thread.id);
      setMessages(null);
      try {
        const data = await api<{ messages: Message[] }>(tenantPath(tenantId, `/threads/${thread.id}`));
        setMessages(data.messages);
      } catch (caught) {
        setActionError(caught instanceof Error ? caught.message : "Could not open the thread.");
        setMessages([]);
      }
      if (thread.unread && !readOnly) void act(thread, { type: "read", value: true }, undefined, { recordUndo: false });
    },
    [act, readOnly, tenantId],
  );

  const startReply = useCallback(
    (thread: ThreadRecord) => {
      const last = messages && messages[0]?.threadId === thread.id ? messages[messages.length - 1] : null;
      const existing = mailbox?.drafts.find((draft) => draft.threadId === thread.id);
      if (existing) {
        setComposeSeed(existing);
      } else {
        const replyTo = last?.from ? formatAddress(last.from) : thread.participants.find((participant) => participant.email !== userEmail.toLowerCase())?.email ?? "";
        setComposeSeed({
          threadId: thread.id,
          to: replyTo,
          cc: "",
          subject: replySubject(thread.subject),
          body: last ? quoteBody(last.text, last.from, last.date) : "",
        });
      }
      setDialog("compose");
    },
    [mailbox?.drafts, messages, userEmail],
  );

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSearching(true);
    setView("search");
    onPage("mail");
    setOpenId(null);
    setCursor(0);
    try {
      const data = await api<{ hits: SearchHit[]; unindexed?: number }>(tenantPath(tenantId, `/search?q=${encodeURIComponent(trimmed)}`));
      setHits(data.hits);
      setUnindexed(data.unindexed ?? 0);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Search failed.");
      setHits([]);
    }
    setSearching(false);
  }

  async function buildIndex() {
    setReindexing(true);
    try {
      await api(tenantPath(tenantId, "/search/reindex"), { method: "POST" });
      setUnindexed(0);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "The search index could not be built.");
    }
    setReindexing(false);
  }

  function goTo(next: View) {
    setPicked(new Set());
    setView(next);
    setOpenId(null);
    setCursor(0);
    onPage("mail");
  }

  const splitOrder = useMemo(() => [PRIMARY_SPLIT, ...splits.map((rule) => rule.id)], [splits]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog((current) => (current === "palette" ? null : current ?? "palette"));
        return;
      }
      const element = event.target as HTMLElement | null;
      if (element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))) {
        if (event.key === "Escape" && element === searchRef.current) searchRef.current?.blur();
        return;
      }
      if (dialog || page !== "mail" || event.metaKey || event.ctrlKey || event.altKey) return;
      // Some keyboards/automation report Shift+3 as "3"; treat it as # (trash).
      const key = event.key === "3" && event.shiftKey ? "#" : event.key;

      if (Date.now() - goPrefix.current < 1200) {
        goPrefix.current = 0;
        const map: Record<string, View> = { i: "inbox", s: "starred", n: "snoozed", d: "drafts", a: "archived", t: "trash", f: "reminders" };
        if (map[key]) {
          event.preventDefault();
          goTo(map[key]);
          return;
        }
      }

      switch (key) {
        case "g":
          goPrefix.current = Date.now();
          return;
        case "j":
        case "ArrowDown":
          event.preventDefault();
          if (openId) {
            const index = visible.findIndex((thread) => thread.id === openId);
            const next = visible[index + 1];
            if (next) {
              setCursor(index + 1);
              void openThreadById(next);
            }
          } else setCursor(Math.min(activeIndex + 1, Math.max(0, visible.length - 1)));
          return;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          if (openId) {
            const index = visible.findIndex((thread) => thread.id === openId);
            const previous = visible[index - 1];
            if (previous) {
              setCursor(index - 1);
              void openThreadById(previous);
            }
          } else setCursor(Math.max(0, activeIndex - 1));
          return;
        case "Enter":
        case "o":
          if (selected && !openId) {
            event.preventDefault();
            void openThreadById(selected);
          }
          return;
        case "Escape":
          if (picked.size && !openId) setPicked(new Set());
          else setOpenId(null);
          return;
        case "x": {
          const id = openId ?? visible[activeIndex]?.id;
          if (id) {
            event.preventDefault();
            toggleSelected(id);
          }
          return;
        }
        case "J":
        case "K":
          if (!openId && visible.length) {
            event.preventDefault();
            const nextIndex = key === "J" ? Math.min(activeIndex + 1, visible.length - 1) : Math.max(0, activeIndex - 1);
            setPicked((current) => new Set([...current, visible[activeIndex].id, visible[nextIndex].id]));
            setCursor(nextIndex);
          }
          return;
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
          return;
        case "?":
          event.preventDefault();
          setDialog("shortcuts");
          return;
        case "c":
          event.preventDefault();
          setComposeSeed(null);
          setDialog("compose");
          return;
        case "z":
          if (undo) void runUndo();
          return;
        case "Tab":
          if (view === "inbox" && !openId) {
            event.preventDefault();
            const index = splitOrder.indexOf(split);
            const next = splitOrder[(index + (event.shiftKey ? -1 : 1) + splitOrder.length) % splitOrder.length];
            setSplit(next);
            setCursor(0);
            setPicked(new Set());
          }
          return;
      }

      // With threads selected (x, Shift+J/K), triage keys act on the whole selection.
      const bulkIds = [...picked].filter((id) => byId.has(id));
      if (bulkIds.length && !openId) {
        const chosen = bulkIds.map((id) => byId.get(id)!);
        const inDoneOrTrash = view === "archived" || view === "trash";
        switch (key) {
          case "e":
            event.preventDefault();
            void bulk(inDoneOrTrash ? { type: "restore" } : { type: "archive" }, inDoneOrTrash ? "Moved to Inbox:" : "Done:");
            return;
          case "#":
            event.preventDefault();
            if (view === "trash") void bulk({ type: "restore" }, "Restored");
            else {
              setBulkMode(true);
              setDialog("trash");
            }
            return;
          case "s":
            event.preventDefault();
            void bulk({ type: "star", value: !chosen.every((thread) => thread.starred) }, chosen.every((thread) => thread.starred) ? "Unstarred" : "Starred");
            return;
          case "u":
            event.preventDefault();
            void bulk({ type: "read", value: chosen.some((thread) => thread.unread) }, chosen.some((thread) => thread.unread) ? "Marked read:" : "Marked unread:");
            return;
          case "l":
            event.preventDefault();
            setBulkMode(true);
            setDialog("label");
            return;
        }
      }

      if (!target) return;
      switch (key) {
        case "e":
          event.preventDefault();
          if (threadView(target, now) === "inbox") void act(target, { type: "archive" }, "Marked done");
          else void act(target, { type: "restore" }, "Moved to Inbox");
          leaveThreadAfter();
          return;
        case "#":
          event.preventDefault();
          if (target.state === "trash") void act(target, { type: "restore" }, "Restored");
          else setDialog("trash");
          return;
        case "s":
          event.preventDefault();
          void act(target, { type: "star", value: !target.starred }, target.starred ? "Unstarred" : "Starred");
          return;
        case "u":
          event.preventDefault();
          void act(target, { type: "read", value: target.unread }, target.unread ? "Marked read" : "Marked unread");
          return;
        case "h":
          event.preventDefault();
          setDialog("snooze");
          return;
        case "f":
          event.preventDefault();
          setDialog("remind");
          return;
        case "l":
          event.preventDefault();
          setDialog("label");
          return;
        case "r":
          event.preventDefault();
          startReply(target);
          return;
        case "m":
          event.preventDefault();
          void act(target, { type: "mute", value: !target.muted }, target.muted ? "Unmuted" : "Muted: new replies skip the inbox");
          if (!target.muted) leaveThreadAfter();
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- render ---------- */

  const accountMenu = (
    <AccountMenu
      product={PRODUCT}
      accountHref={`${links.home}/account`}
      teamHref={`${links.home}?view=team`}
      signInHref={links.signIn}
      currentTenantId={tenantId}
      onSwitchWorkspace={onSwitch}
      workspaceNoun="mailbox"
    />
  );

  if (!mailbox) {
    return (
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        {loadError ? (
          <div className="mx-auto grid w-full max-w-lg gap-4 p-6 pt-20">
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{loadError.includes("role") ? "No access to this mailbox" : "This mailbox couldn't be opened"}</AlertTitle>
              <AlertDescription>
                {loadError}
                <Button className="mt-2 w-fit" size="sm" variant="outline" onClick={() => void load()}><RefreshCw /> Try again</Button>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <ShellSkeleton />
        )}
      </div>
    );
  }

  const navItems: Array<{ id: View; label: string; icon: typeof Inbox; count?: number; keys?: string[] }> = [
    { id: "inbox", label: "Inbox", icon: Inbox, count: inboxUnread, keys: ["g", "i"] },
    { id: "starred", label: "Starred", icon: Star, count: threads.filter((thread) => thread.starred && thread.state !== "trash").length, keys: ["g", "s"] },
    { id: "snoozed", label: "Snoozed", icon: Clock3, count: threads.filter((thread) => threadView(thread, now) === "snoozed").length, keys: ["g", "n"] },
    { id: "reminders", label: "Follow-ups", icon: BellRing, count: threads.filter((thread) => isReminderDue(thread, now)).length, keys: ["g", "f"] },
    { id: "drafts", label: "Drafts", icon: PenLine, count: mailbox.drafts.length, keys: ["g", "d"] },
    { id: "scheduled", label: "Scheduled", icon: CalendarClock, count: mailbox.drafts.filter((draft) => draft.status === "scheduled").length },
    { id: "archived", label: "Done", icon: Archive, keys: ["g", "a"] },
    { id: "trash", label: "Trash", icon: Trash2, keys: ["g", "t"] },
  ];

  const commands: PaletteCommand[] = [
    { id: "compose", label: "Compose new message", hint: "c", run: () => { setComposeSeed(null); setDialog("compose"); } },
    { id: "search", label: "Search mail", hint: "/", run: () => window.setTimeout(() => searchRef.current?.focus(), 50) },
    ...navItems.map((item) => ({ id: `go-${item.id}`, label: `Go to ${item.label}`, hint: item.keys?.join(" "), run: () => goTo(item.id) })),
    ...[{ id: PRIMARY_SPLIT, name: "Primary" }, ...splits].map((rule) => ({
      id: `split-${rule.id}`,
      label: `Open split: ${rule.name}`,
      run: () => {
        goTo("inbox");
        setSplit(rule.id);
      },
    })),
    ...labels.map((label) => ({ id: `label-${label}`, label: `Go to label: ${label}`, run: () => goTo(`label:${label}`) })),
    ...(target && !readOnly && page === "mail"
      ? [
          { id: "t-archive", label: `Mark “${target.subject || "(no subject)"}” done`, hint: "e", run: () => { void act(target, threadView(target, now) === "inbox" ? { type: "archive" } : { type: "restore" }, "Marked done"); setOpenId(null); } },
          { id: "t-reply", label: "Reply", hint: "r", run: () => startReply(target) },
          { id: "t-snooze", label: "Snooze thread", hint: "h", run: () => setDialog("snooze") },
          { id: "t-remind", label: "Follow up if nobody replies", hint: "f", run: () => setDialog("remind") },
          { id: "t-star", label: target.starred ? "Unstar thread" : "Star thread", hint: "s", run: () => void act(target, { type: "star", value: !target.starred }, target.starred ? "Unstarred" : "Starred") },
          { id: "t-label", label: "Label thread", hint: "l", run: () => setDialog("label") },
          { id: "t-mute", label: target.muted ? "Unmute thread" : "Mute thread (replies skip the inbox)", hint: "m", run: () => void act(target, { type: "mute", value: !target.muted }, target.muted ? "Unmuted" : "Muted: new replies skip the inbox") },
          { id: "t-unread", label: target.unread ? "Mark as read" : "Mark as unread", hint: "u", run: () => void act(target, { type: "read", value: target.unread }, target.unread ? "Marked read" : "Marked unread") },
          { id: "t-trash", label: "Move thread to Trash", hint: "#", run: () => setDialog("trash") },
        ]
      : []),
    ...(readOnly ? [] : [{ id: "import", label: "Import mail (.eml, .mbox)", run: () => setDialog("import") }]),
    ...PAGES.map((entry) => ({ id: `page-${entry.id}`, label: `Open ${entry.label}`, run: () => onPage(entry.id) })),
    { id: "export", label: "Export this mailbox (JSON)", run: () => window.location.assign(tenantPath(tenantId, "/export")) },
    { id: "shortcuts", label: "Keyboard shortcuts", hint: "?", run: () => setDialog("shortcuts") },
  ];

  const listTitle = view === "search" ? `Results for “${query.trim()}”` : view.startsWith("label:") ? view.slice(6) : navItems.find((item) => item.id === view)?.label;
  const pageMeta = PAGES.find((entry) => entry.id === page);

  const sidebar = (
    <>
      <div className="flex h-12 items-center px-4"><Wordmark /></div>
      <div className="grid gap-2 px-3 pb-3">
        <WorkspaceSwitcher product={PRODUCT} currentTenantId={tenantId} onSwitch={onSwitch} workspaceNoun="mailbox" className="w-full max-w-none bg-card" />
        <Button className="w-full justify-between" onClick={() => { setComposeSeed(null); setDialog("compose"); }} disabled={readOnly}>
          <span className="flex items-center gap-2"><PenLine /> Compose</span>
          <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground/80">c</Kbd>
        </Button>
      </div>
      <nav className="grid gap-4 overflow-y-auto px-3 pb-3" aria-label="Mailboxes">
        <div className="grid gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={styles.navItem} data-active={page === "mail" && view === item.id} data-hint={Boolean(item.keys)} onClick={() => goTo(item.id)}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                {item.count ? <span className={styles.navCount}>{item.count}</span> : null}
                {item.keys ? <span className={styles.navHint}>{item.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</span> : null}
              </button>
            );
          })}
        </div>
        {labels.length ? (
          <div className="grid gap-0.5">
            <p className="px-2.5 pb-1 text-[0.6875rem] font-semibold text-muted-foreground">Labels</p>
            {labels.map((label) => (
              <button key={label} type="button" className={styles.navItem} data-active={page === "mail" && view === `label:${label}`} onClick={() => goTo(`label:${label}`)}>
                <Tag aria-hidden="true" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-0.5">
          <p className="px-2.5 pb-1 text-[0.6875rem] font-semibold text-muted-foreground">Mailbox</p>
          {PAGES.map((entry) => {
            const Icon = entry.icon;
            return (
              <button key={entry.id} type="button" className={styles.navItem} data-active={page === entry.id} onClick={() => onPage(entry.id)}>
                <Icon aria-hidden="true" />
                <span>{entry.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="mt-auto grid gap-1 border-t border-sidebar-border p-3">
        <button type="button" className={styles.navItem} onClick={() => setDialog("import")} disabled={readOnly}>
          <FileUp aria-hidden="true" /> <span>Import mail</span>
        </button>
        <a className={styles.navItem} href={tenantPath(tenantId, "/export")} download>
          <Download aria-hidden="true" /> <span>Export mailbox</span>
        </a>
      </div>
    </>
  );

  return (
    <MailPeopleProvider people={mailbox.people ?? []}>
      <div className="flex min-h-dvh bg-background text-foreground lg:h-dvh lg:overflow-hidden">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex" aria-label="Mail">
          {sidebar}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
            <div className="flex items-center gap-1 lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Open navigation"><Menu /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  <DropdownMenuLabel className="flex items-center gap-2"><MailMark size={18} /> Mail</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return <DropdownMenuItem key={item.id} onSelect={() => goTo(item.id)}><Icon /> {item.label}{item.count ? <span className="ml-auto text-xs text-muted-foreground">{item.count}</span> : null}</DropdownMenuItem>;
                  })}
                  <DropdownMenuSeparator />
                  {PAGES.map((entry) => {
                    const Icon = entry.icon;
                    return <DropdownMenuItem key={entry.id} onSelect={() => onPage(entry.id)}><Icon /> {entry.label}</DropdownMenuItem>;
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("import")} disabled={readOnly}><FileUp /> Import mail</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <MailMark size={20} className="hidden sm:block" />
            </div>
            <form
              className="flex h-8 min-w-0 max-w-xl flex-1 items-center gap-2 rounded-lg border border-transparent bg-secondary px-2.5 focus-within:border-ring focus-within:bg-background"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                void runSearch(query);
                searchRef.current?.blur();
              }}
            >
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                aria-label="Search mail"
                placeholder="Search mail — from: subject: has:invite"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:outline-none" data-slot="inline-input"
              />
              {query ? (
                <button type="button" aria-label="Clear search" className="text-muted-foreground hover:text-foreground" onClick={() => { setQuery(""); setHits(null); if (view === "search") goTo("inbox"); }}><X className="size-4" /></button>
              ) : <Kbd className="hidden sm:inline-grid">/</Kbd>}
            </form>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="hidden gap-1.5 text-muted-foreground md:inline-flex" onClick={() => setDialog("palette")}>
                <Command className="size-3.5" /> Commands <Kbd>⌘K</Kbd>
              </Button>
              <Button size="icon-sm" className="lg:hidden" aria-label="Compose" onClick={() => { setComposeSeed(null); setDialog("compose"); }} disabled={readOnly}><PenLine /></Button>
              <ThemeToggle />
              {accountMenu}
            </div>
          </header>

          {page === "mail" ? (
            <div className="flex min-h-0 flex-1">
              <section className={cn("flex min-w-0 flex-1 flex-col border-border md:w-[420px] md:flex-none md:border-r xl:w-[480px]", openId && "hidden md:flex")} aria-label="Threads">
                <div className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
                  {view === "inbox" ? (
                    <div className="-mb-px flex min-w-0 items-center gap-5 overflow-x-auto" role="tablist" aria-label="Splits">
                      {[{ id: PRIMARY_SPLIT, name: "Primary" }, ...splits].map((rule) => (
                        <button
                          key={rule.id}
                          type="button"
                          role="tab"
                          aria-selected={split === rule.id}
                          className={styles.splitTab}
                          onClick={() => { setSplit(rule.id); setCursor(0); setOpenId(null); }}
                        >
                          {rule.name}
                          {counts[rule.id]?.unread ? <span className={styles.splitCount}>{counts[rule.id].unread}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <h2 className="truncate text-sm font-semibold">{listTitle}</h2>
                  )}
                  <span className="ml-auto hidden items-center gap-1 text-xs text-muted-foreground xl:flex">{view === "inbox" ? <><Kbd>Tab</Kbd> next split</> : null}</span>
                  {view === "search" ? <Button size="xs" variant="ghost" onClick={() => { setQuery(""); setHits(null); goTo("inbox"); }}>Clear</Button> : null}
                </div>
                {view === "search" && unindexed > 0 ? (
                  <p className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground" role="status">
                    {unindexed} older message{unindexed === 1 ? " was" : "s were"} searched the slow way (same results).
                    {readOnly ? null : (
                      <Button size="xs" variant="link" className="h-auto p-0" disabled={reindexing} onClick={() => void buildIndex()}>
                        {reindexing ? <LoaderCircle className="animate-spin" /> : null} Speed up search
                      </Button>
                    )}
                  </p>
                ) : null}
                {actionError ? (
                  <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <span className="flex-1">{actionError}</span>
                    <button type="button" aria-label="Dismiss" onClick={() => setActionError("")}><X className="size-4" /></button>
                  </div>
                ) : null}
                {selectedThreads.length ? (
                  <div className="flex flex-wrap items-center gap-1 border-b border-border bg-accent/60 px-3 py-1.5 text-sm" role="toolbar" aria-label="Selected threads">
                    <span className="mr-1 font-medium">{selectedThreads.length} selected</span>
                    {view === "archived" || view === "trash" ? (
                      <ActionButton label="Move to Inbox" keys={["e"]} disabled={readOnly} onClick={() => void bulk({ type: "restore" }, "Moved to Inbox:")}><Inbox /></ActionButton>
                    ) : (
                      <ActionButton label="Done" keys={["e"]} disabled={readOnly} onClick={() => void bulk({ type: "archive" }, "Done:")}><Archive /></ActionButton>
                    )}
                    <ActionButton label="Label" keys={["l"]} disabled={readOnly} onClick={() => { setBulkMode(true); setDialog("label"); }}><Tag /></ActionButton>
                    <ActionButton label={selectedThreads.some((thread) => thread.unread) ? "Mark read" : "Mark unread"} keys={["u"]} disabled={readOnly} onClick={() => void bulk({ type: "read", value: selectedThreads.some((thread) => thread.unread) }, selectedThreads.some((thread) => thread.unread) ? "Marked read:" : "Marked unread:")}><MailOpen /></ActionButton>
                    {view === "trash" ? null : <ActionButton label="Trash" keys={["#"]} disabled={readOnly} onClick={() => { setBulkMode(true); setDialog("trash"); }}><Trash2 /></ActionButton>}
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setPicked(new Set())}>Clear <Kbd>esc</Kbd></Button>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {view === "drafts" || view === "scheduled" ? (
                    <DraftList
                      drafts={view === "scheduled" ? mailbox.drafts.filter((draft) => draft.status === "scheduled").sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")) : mailbox.drafts}
                      now={now}
                      scheduledView={view === "scheduled"}
                      onOpen={(draft) => { setComposeSeed(draft); setDialog("compose"); }}
                    />
                  ) : searching ? (
                    <div className="grid gap-2 p-3">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
                  ) : visible.length === 0 ? (
                    <EmptyState view={view} hasMail={threads.length > 0} onImport={() => setDialog("import")} readOnly={readOnly} />
                  ) : (
                    <ol className={styles.threadList}>
                      {visible.map((thread, index) => {
                        const due = isReminderDue(thread, now);
                        const hit = view === "search" ? hits?.find((entry) => entry.threadId === thread.id) : null;
                        return (
                          <ThreadRow
                            key={thread.id}
                            thread={thread}
                            checked={picked.has(thread.id)}
                            selected={index === activeIndex}
                            open={thread.id === openId}
                            due={due}
                            snippet={hit?.snippet ?? thread.snippet}
                            onCheck={(value) => toggleSelected(thread.id, value)}
                            onOpen={() => { setCursor(index); void openThreadById(thread); }}
                          />
                        );
                      })}
                    </ol>
                  )}
                </div>
              </section>

              <section className={cn("min-w-0 flex-1 overflow-y-auto", !openId && "hidden md:block")} aria-label="Thread">
                {openThread ? (
                  <ThreadReader
                    thread={openThread}
                    messages={messages}
                    now={now}
                    readOnly={readOnly}
                    onBack={() => setOpenId(null)}
                    onArchive={() => { void act(openThread, threadView(openThread, now) === "inbox" ? { type: "archive" } : { type: "restore" }, threadView(openThread, now) === "inbox" ? "Marked done" : "Moved to Inbox"); setOpenId(null); }}
                    onTrash={() => (openThread.state === "trash" ? void act(openThread, { type: "restore" }, "Restored") : setDialog("trash"))}
                    onStar={() => void act(openThread, { type: "star", value: !openThread.starred }, openThread.starred ? "Unstarred" : "Starred")}
                    onSnooze={() => setDialog("snooze")}
                    onRemind={() => setDialog("remind")}
                    onClearReminder={() => void act(openThread, { type: "clear-reminder" }, "Follow-up cleared", { recordUndo: false })}
                    onLabel={() => setDialog("label")}
                    onReply={() => startReply(openThread)}
                    onUnread={() => { void act(openThread, { type: "read", value: false }, "Marked unread"); setOpenId(null); }}
                    onMute={() => {
                      void act(openThread, { type: "mute", value: !openThread.muted }, openThread.muted ? "Unmuted" : "Muted: new replies skip the inbox");
                      if (!openThread.muted) setOpenId(null);
                    }}
                    onDraftUnsubscribe={(seed) => { setComposeSeed(seed); setDialog("compose"); }}
                  />
                ) : (
                  <ReaderEmpty count={visible.length} label={listTitle ?? "Inbox"} />
                )}
              </section>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 lg:px-8 lg:py-8">
                <div className="grid gap-1">
                  <h1 className="brand-heading text-2xl sm:text-[1.75rem]">{pageMeta?.label}</h1>
                  <p className="text-sm text-muted-foreground">{pageMeta?.description}</p>
                </div>
                {page === "rules" ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    <div className="lg:col-span-2"><FiltersPanel tenantId={tenantId} filters={mailbox.filters ?? []} readOnly={readOnly} onChange={() => void load()} /></div>
                    <SplitsPanel tenantId={tenantId} splits={splits} readOnly={readOnly} onChange={() => void load()} />
                    <SnippetsPanel tenantId={tenantId} templates={mailbox.templates} readOnly={readOnly} onChange={() => void load()} />
                  </div>
                ) : null}
                {page === "contacts" ? (
                  <ContactsPanel
                    tenantId={tenantId}
                    readOnly={readOnly}
                    onOpenThread={(thread) => {
                      onPage("mail");
                      void openThreadById(byId.get(thread.id) ?? thread);
                    }}
                  />
                ) : null}
                {page === "connections" ? <ConnectionsPanel mailbox={mailbox} onImport={() => setDialog("import")} readOnly={readOnly} /> : null}
                {page === "team" ? <TeamPanel product={PRODUCT} productName="Mail" tenantId={tenantId} onLeft={onLeft} /> : null}
                {page === "activity" ? <AuditPanel tenantId={tenantId} /> : null}
              </div>
            </div>
          )}

          <footer className="hidden h-9 shrink-0 items-center gap-4 border-t border-border px-4 text-xs text-muted-foreground lg:flex" aria-label="Keyboard shortcuts">
            {page === "mail" ? (
              <>
                <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> move</span>
                <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
                <span className="flex items-center gap-1"><Kbd>e</Kbd> done</span>
                <span className="flex items-center gap-1"><Kbd>h</Kbd> snooze</span>
                <span className="flex items-center gap-1"><Kbd>r</Kbd> reply</span>
                <span className="flex items-center gap-1"><Kbd>x</Kbd> select</span>
                <span className="flex items-center gap-1"><Kbd>z</Kbd> undo</span>
                <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => setDialog("shortcuts")}><Kbd>?</Kbd> all shortcuts</button>
              </>
            ) : (
              <span className="flex items-center gap-1"><Kbd>⌘K</Kbd> commands</span>
            )}
            <button type="button" className="ml-auto flex items-center gap-1.5 hover:text-foreground" onClick={() => onPage("connections")}>
              <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" /> Imported mail · Gmail and Outlook not connected
            </button>
          </footer>
        </div>

        {undo ? (
          <div className="fixed bottom-12 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-xl" role="status">
            <span>{undo.label}</span>
            <Button size="xs" variant="ghost" onClick={() => void runUndo()}><Undo2 /> Undo <Kbd>z</Kbd></Button>
            <button type="button" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground" onClick={() => setUndo(null)}><X className="size-4" /></button>
          </div>
        ) : null}

        <TrashDialog
          open={dialog === "trash"}
          subject={target?.subject ?? ""}
          count={bulkMode ? selectedThreads.length : 1}
          onOpenChange={(open) => {
            setDialog(open ? "trash" : null);
            if (!open) setBulkMode(false);
          }}
          onConfirm={() => {
            if (bulkMode) void bulk({ type: "trash" }, "Moved to Trash:");
            else if (target) void act(target, { type: "trash" }, "Moved to Trash");
            setDialog(null);
            setBulkMode(false);
            setOpenId(null);
          }}
        />
        <DateActionDialog
          open={dialog === "snooze" || dialog === "remind"}
          mode={dialog === "remind" ? "remind" : "snooze"}
          onOpenChange={(open) => !open && setDialog(null)}
          onPick={(iso) => {
            if (target) {
              if (dialog === "remind") void act(target, { type: "remind", at: iso }, "Follow-up set", { recordUndo: false });
              else {
                void act(target, { type: "snooze", until: iso }, `Snoozed until ${new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}`);
                setOpenId(null);
              }
            }
            setDialog(null);
          }}
        />
        <LabelDialog
          open={dialog === "label"}
          onOpenChange={(open) => {
            setDialog(open ? "label" : null);
            if (!open) setBulkMode(false);
          }}
          current={bulkMode ? labels.filter((label) => selectedThreads.length > 0 && selectedThreads.every((thread) => thread.labels.includes(label))) : target?.labels ?? []}
          known={labels}
          onToggle={(label, value) => {
            if (bulkMode) {
              void bulk({ type: "label", label, value }, value ? `Labelled ${label}:` : `Removed ${label}:`);
              return;
            }
            if (!target) return;
            void act(target, { type: "label", label, value }, value ? `Labelled ${label}` : `Removed ${label}`);
          }}
        />
        {dialog === "palette" ? <CommandPalette open commands={commands} onOpenChange={(open) => setDialog(open ? "palette" : null)} /> : null}
        <ShortcutsDialog open={dialog === "shortcuts"} onOpenChange={(open) => setDialog(open ? "shortcuts" : null)} />
        {dialog === "import" ? <ImportDialog open tenantId={tenantId} readOnly={readOnly} onOpenChange={(open) => setDialog(open ? "import" : null)} onImported={() => void load()} /> : null}
        {dialog === "compose" ? (
          <ComposeDialog
            open
            seed={composeSeed}
            tenantId={tenantId}
            templates={mailbox.templates}
            readOnly={readOnly}
            onOpenChange={(open) => setDialog(open ? "compose" : null)}
            onSaved={(draft) =>
              setMailbox((current) =>
                current ? { ...current, drafts: [draft, ...current.drafts.filter((entry) => entry.id !== draft.id)] } : current,
              )
            }
            onDiscarded={(draftId) => setMailbox((current) => (current ? { ...current, drafts: current.drafts.filter((entry) => entry.id !== draftId) } : current))}
          />
        ) : null}
      </div>
    </MailPeopleProvider>
  );
}

/* ======================================================================== */

function ThreadRow({
  thread,
  checked,
  selected,
  open,
  due,
  snippet,
  onCheck,
  onOpen,
}: {
  thread: ThreadRecord;
  checked: boolean;
  selected: boolean;
  open: boolean;
  due: boolean;
  snippet: string;
  onCheck: (value: boolean) => void;
  onOpen: () => void;
}) {
  const people = usePeople();
  const senders = senderOf(thread);
  const first = senders[0] ?? null;
  const names = senders.map((sender) => displayName(sender, people.byEmail.get(sender.email.toLowerCase())).split(/\s+/)[0]);
  const senderText = senders.length > 1 ? names.slice(0, 3).join(", ") : first ? displayName(first, people.byEmail.get(first.email.toLowerCase())) : "Unknown sender";
  return (
    <li className={styles.threadItem} data-checked={checked}>
      <Checkbox
        className={styles.rowCheck}
        checked={checked}
        aria-label={`Select “${thread.subject || "(no subject)"}”`}
        onCheckedChange={(value) => onCheck(value === true)}
      />
      <button
        type="button"
        className={styles.threadRow}
        data-checked={checked}
        data-selected={selected}
        data-unread={thread.unread}
        data-open={open}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
      >
        {thread.unread ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
        <AddressAvatar address={first} size="md" className={styles.rowAvatar} />
        <span className={styles.rowSender}>
          <span>{senderText}</span>
          {thread.messageCount > 1 ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{thread.messageCount}</span> : null}
        </span>
        <span className={styles.rowMeta}>
          {due ? <Badge className="h-5 px-1.5 text-[0.6875rem]">Follow up</Badge> : null}
          {thread.labels.slice(0, 1).map((label) => <Badge key={label} variant="secondary" className="h-5 px-1.5 text-[0.6875rem]">{label}</Badge>)}
          {thread.hasCalendarInvite ? <CalendarDays aria-label="Calendar invite" className="size-3.5" /> : null}
          {thread.muted ? <BellOff aria-label="Muted" className="size-3.5" /> : null}
          {thread.starred ? <Star aria-label="Starred" className="size-3.5 fill-primary text-primary" /> : null}
          <time dateTime={thread.lastMessageAt}>{shortDate(thread.lastMessageAt)}</time>
        </span>
        <span className={styles.rowSubject}>
          <strong>{thread.subject || "(no subject)"}</strong>
          <span> — {snippet}</span>
        </span>
      </button>
    </li>
  );
}

function ReaderEmpty({ count, label }: { count: number; label: string }) {
  return (
    <div className={styles.emptyState}>
      <span className="grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><MailOpen className="size-5" /></span>
      <p className="text-base font-medium text-foreground">{count ? `${count} in ${label}` : `${label} is clear`}</p>
      <p className="flex flex-wrap items-center justify-center gap-1">Move with <Kbd>j</Kbd> <Kbd>k</Kbd> and press <Kbd>↵</Kbd> to read. <Kbd>?</Kbd> shows every shortcut.</p>
    </div>
  );
}

function EmptyState({ view, hasMail, onImport, readOnly }: { view: View; hasMail: boolean; onImport: () => void; readOnly: boolean }) {
  if (!hasMail) {
    return (
      <div className={styles.emptyState}>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><FileUp className="size-5" /></span>
        <h3 className="brand-heading text-xl">Bring your mail in</h3>
        <p>Import .eml files or an .mbox export from Gmail, Outlook or Apple Mail. Conversations are threaded and sorted into your splits.</p>
        <Button onClick={onImport} disabled={readOnly}><FileUp /> Import mail</Button>
      </div>
    );
  }
  if (view === "inbox") {
    return (
      <div className={styles.emptyState}>
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary"><Sparkles className="size-5" /></span>
        <h3 className="brand-heading text-xl">You&apos;re through it</h3>
        <p>Nothing left in this split. Snoozed mail and follow-ups come back on their own.</p>
      </div>
    );
  }
  const copy: Partial<Record<string, ReactNode>> = {
    starred: <>Star a conversation with <Kbd>s</Kbd> to keep it here.</>,
    snoozed: <>Nothing snoozed. Press <Kbd>h</Kbd> on a conversation to bring it back later.</>,
    reminders: <>No follow-ups. Press <Kbd>f</Kbd> to be reminded if nobody replies.</>,
    archived: <>Conversations you finish land here. Press <Kbd>e</Kbd> to mark one done.</>,
    trash: "Trash is empty.",
    search: "Nothing matches. Try fewer words, or from:, subject:, has:invite.",
  };
  return (
    <div className={styles.emptyState}>
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
      <p>{copy[view] ?? "No conversations with this label."}</p>
    </div>
  );
}

function DraftList({ drafts, now, scheduledView, onOpen }: { drafts: Draft[]; now: Date; scheduledView: boolean; onOpen: (draft: Draft) => void }) {
  if (!drafts.length) {
    return (
      <div className={styles.emptyState}>
        {scheduledView ? <CalendarClock className="size-6 text-muted-foreground" aria-hidden="true" /> : <PenLine className="size-6 text-muted-foreground" aria-hidden="true" />}
        <p>{scheduledView ? "Nothing scheduled. Choose Send later in a draft to queue it." : <>No drafts. Press <Kbd>c</Kbd> to write or <Kbd>r</Kbd> to reply.</>}</p>
      </div>
    );
  }
  return (
    <ol className={styles.threadList}>
      {drafts.map((draft) => (
        <li key={draft.id} className={styles.threadItem}>
          <button type="button" className={styles.threadRow} onClick={() => onOpen(draft)}>
            <span className={cn(styles.rowAvatar, "grid size-8 place-items-center rounded-full bg-secondary text-muted-foreground")}><PenLine className="size-3.5" /></span>
            <span className={styles.rowSender}><span>{draft.to || "No recipient yet"}</span></span>
            <span className={styles.rowMeta}>
              <DraftBadge draft={draft} now={now} />
              {draft.updatedAt ? <time dateTime={draft.updatedAt}>{shortDate(draft.updatedAt)}</time> : null}
            </span>
            <span className={styles.rowSubject}><strong>{draft.subject || "(no subject)"}</strong><span> — {draft.body.slice(0, 120)}</span></span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function DraftBadge({ draft, now }: { draft: Draft; now: Date }) {
  const state = scheduleStatus(draft, now);
  const when = draft.scheduledFor ? new Date(draft.scheduledFor).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  if (state === "queued") return <Badge variant="outline" className="h-5 px-1.5 text-[0.6875rem]"><CalendarClock /> {when} · needs an account to send</Badge>;
  if (state === "due_unsent") return <Badge variant="destructive" className="h-5 px-1.5 text-[0.6875rem]">Due {when} · not sent</Badge>;
  if (state === "send_blocked") return <Badge variant="outline" className="h-5 px-1.5 text-[0.6875rem]">Not sent</Badge>;
  return <Badge variant="secondary" className="h-5 px-1.5 text-[0.6875rem]">Draft</Badge>;
}

function ThreadReader({
  thread,
  messages,
  now,
  readOnly,
  onBack,
  onArchive,
  onTrash,
  onStar,
  onSnooze,
  onRemind,
  onClearReminder,
  onLabel,
  onReply,
  onUnread,
  onMute,
  onDraftUnsubscribe,
}: {
  thread: ThreadRecord;
  messages: Message[] | null;
  now: Date;
  readOnly: boolean;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onStar: () => void;
  onSnooze: () => void;
  onRemind: () => void;
  onClearReminder: () => void;
  onLabel: () => void;
  onReply: () => void;
  onUnread: () => void;
  onMute: () => void;
  onDraftUnsubscribe: (seed: ComposeSeed) => void;
}) {
  const people = usePeople();
  const due = isReminderDue(thread, now);
  const replied = hasReplySinceReminder(thread);
  const inInbox = threadView(thread, now) === "inbox";
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-4 sm:px-8 sm:py-6">
      <div className="sticky top-0 z-10 -mx-2 flex items-center gap-0.5 bg-background/95 px-2 py-1 backdrop-blur">
        <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label="Back to the list" className="md:hidden"><ArrowLeft /></Button>
        <ActionButton label={inInbox ? "Mark done" : "Move to Inbox"} keys={["e"]} onClick={onArchive} disabled={readOnly}>{inInbox ? <Archive /> : <Inbox />}</ActionButton>
        <ActionButton label="Snooze" keys={["h"]} onClick={onSnooze} disabled={readOnly}><Clock3 /></ActionButton>
        <ActionButton label="Follow up if nobody replies" keys={["f"]} onClick={onRemind} disabled={readOnly}><BellRing /></ActionButton>
        <ActionButton label={thread.starred ? "Unstar" : "Star"} keys={["s"]} onClick={onStar} disabled={readOnly} pressed={thread.starred}><Star className={thread.starred ? "fill-primary text-primary" : undefined} /></ActionButton>
        <ActionButton label="Label" keys={["l"]} onClick={onLabel} disabled={readOnly}><Tag /></ActionButton>
        <ActionButton label="Mark unread" keys={["u"]} onClick={onUnread} disabled={readOnly}><MailOpen /></ActionButton>
        <ActionButton label={thread.muted ? "Unmute" : "Mute"} keys={["m"]} onClick={onMute} disabled={readOnly} pressed={thread.muted}><BellOff /></ActionButton>
        <ActionButton label={thread.state === "trash" ? "Restore" : "Trash"} keys={["#"]} onClick={onTrash} disabled={readOnly}><Trash2 /></ActionButton>
        <Button size="sm" className="ml-auto" onClick={onReply} disabled={readOnly}><Reply /> Reply <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground/80">r</Kbd></Button>
      </div>

      <header className="grid gap-3">
        <h2 className="brand-heading text-2xl leading-tight sm:text-[1.65rem]">{thread.subject || "(no subject)"}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex -space-x-1.5">
            {thread.participants.slice(0, 5).map((participant) => (
              <AddressAvatar key={participant.email} address={participant} size="sm" className="ring-2 ring-background" />
            ))}
          </span>
          <span className="text-sm text-muted-foreground">
            {thread.participants.slice(0, 3).map((participant) => displayName(participant, people.byEmail.get(participant.email.toLowerCase())).split(/\s+/)[0]).join(", ")}
            {thread.participants.length > 3 ? ` and ${thread.participants.length - 3} more` : ""}
          </span>
          {thread.labels.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}
          {thread.snoozedUntil && isSnoozed(thread, now) ? <Badge variant="outline"><Clock3 /> Back {new Date(thread.snoozedUntil).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</Badge> : null}
          {thread.reminder ? (
            <Badge variant={due ? "default" : "outline"}>
              <BellRing /> {due ? "No reply yet: follow up" : replied ? "Reply received" : `Follow up ${new Date(thread.reminder.at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}`}
              {!readOnly ? <button type="button" className="ml-1 underline-offset-2 hover:underline" onClick={onClearReminder}>clear</button> : null}
            </Badge>
          ) : null}
          {thread.state === "trash" ? <Badge variant="destructive">In Trash</Badge> : null}
          {thread.muted ? <Badge variant="outline"><BellOff /> Muted</Badge> : null}
        </div>
      </header>

      {messages ? <UnsubscribeHelper messages={messages} readOnly={readOnly} onDraft={onDraftUnsubscribe} onMute={thread.muted ? null : onMute} /> : null}

      {messages === null ? (
        <div className="grid gap-3">{[0, 1].map((index) => <Skeleton key={index} className="h-40 w-full rounded-xl" />)}</div>
      ) : (
        <ol className="grid gap-3">
          {messages.map((message) => {
            const teammate = message.from ? people.byEmail.get(message.from.email.toLowerCase()) ?? null : null;
            return (
              <li key={message.id} className={styles.message}>
                <header className="flex items-start gap-3">
                  <AddressAvatar address={message.from} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{displayName(message.from, teammate)}</span>
                      <span className="truncate text-xs text-muted-foreground">{message.from?.email ?? ""}</span>
                      {teammate ? <Badge variant="secondary" className="h-4 px-1.5 text-[0.625rem]">Teammate</Badge> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      to {message.to.map((address) => displayName(address, people.byEmail.get(address.email.toLowerCase()))).join(", ") || "undisclosed recipients"}
                      {message.cc.length ? ` · cc ${message.cc.map((address) => displayName(address, people.byEmail.get(address.email.toLowerCase()))).join(", ")}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={message.date ?? undefined}>
                    {message.date ? new Date(message.date).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </time>
                </header>
                {message.hasCalendarInvite || message.bodySource === "html" ? (
                  <div className="flex flex-wrap gap-2">
                    {message.hasCalendarInvite ? <Badge variant="outline"><CalendarDays /> Calendar invite</Badge> : null}
                    {message.bodySource === "html" ? <Badge variant="outline"><Newspaper /> Shown as plain text</Badge> : null}
                  </div>
                ) : null}
                {/* Bodies are rendered as escaped text only; email HTML and remote images are never loaded. */}
                <div className={styles.messageText}>{message.text || "(This message has no text.)"}</div>
                {message.attachments.length ? (
                  <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {message.attachments.map((attachment, index) => (
                      <li key={`${attachment.filename}-${index}`} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5">
                        <Paperclip className="size-3.5" /> <span className="font-medium text-foreground">{attachment.filename}</span> {Math.max(1, Math.round(attachment.size / 1024))} KB · not kept
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <button
        type="button"
        onClick={onReply}
        disabled={readOnly}
        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
      >
        <Reply className="size-4" /> Reply to {thread.participants.length > 2 ? "everyone" : "this conversation"}… <Kbd className="ml-auto">r</Kbd>
      </button>
    </article>
  );
}
