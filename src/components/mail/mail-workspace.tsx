"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarDays,
  CircleAlert,
  Clock3,
  Download,
  FileUp,
  Inbox,
  Keyboard,
  LoaderCircle,
  LogOut,
  MailOpen,
  Newspaper,
  Paperclip,
  PenLine,
  Reply,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import {
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
  applyThreadAction,
} from "@/lib/mail/workflow";

import { AuditPanel, ConnectionsPanel, SnippetsPanel, SplitsPanel, TeamPanel } from "./mail-admin";
import { api, tenantPath, type Draft, type Mailbox, type Message, type SearchHit, type Tenant, type ThreadAction, type ThreadRecord } from "./mail-api";
import { CommandPalette, ComposeDialog, DateActionDialog, ImportDialog, LabelDialog, ShortcutsDialog, TrashDialog, type ComposeSeed, type PaletteCommand } from "./mail-dialogs";
import styles from "./mail.module.css";

type View = "inbox" | "starred" | "snoozed" | "reminders" | "drafts" | "archived" | "trash" | "search" | `label:${string}`;

const TENANT_KEY = "saasassin-mail-tenant";

function readStoredTenant() {
  try {
    return window.localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

function storeTenant(id: string) {
  try {
    window.localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* per-viewer convenience only */
  }
}

function shortDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

function senderLine(thread: ThreadRecord) {
  const names = thread.participants
    .filter((participant) => thread.fromAddresses.includes(participant.email))
    .map((participant) => participant.name || participant.email.split("@")[0]);
  return names.slice(0, 3).join(", ") || thread.fromAddresses[0] || "Unknown sender";
}

/* ======================================================================== */

export function MailWorkspace({ userEmail, userName }: { userEmail: string; userName: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ tenants: Tenant[] }>("/api/fleet/mail/tenants")
      .then(({ tenants: list }) => {
        if (cancelled) return;
        setTenants(list);
        const stored = readStoredTenant();
        setTenantId(list.find((tenant) => tenant.id === stored)?.id ?? list[0]?.id ?? null);
      })
      .catch((caught: Error) => !cancelled && setError(caught.message));
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const { tenant } = await api<{ tenant: Tenant }>("/api/fleet/mail/tenants", { method: "POST", json: { name } });
      setTenants((current) => [...(current ?? []), tenant]);
      setTenantId(tenant.id);
      storeTenant(tenant.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the workspace.");
    }
    setCreating(false);
  }

  async function logout() {
    await fetch("/api/fleet/mail/session", { method: "DELETE" });
    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      /* the server session is already cleared */
    }
    router.push("/apps/mail/sign-in");
    router.refresh();
  }

  if (tenants === null && !error) {
    return (
      <main className={`${styles.page} fleet-app`}>
        <div className={styles.frame}>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="mt-6 h-96 w-full" />
        </div>
      </main>
    );
  }

  if (!tenantId) {
    return (
      <main className={`${styles.page} fleet-app`}>
        <div className={`${styles.frame} ${styles.onboarding}`}>
          <div>
            <p className={styles.eyebrow}>SaaSassin Mail · signed in as {userName || userEmail}</p>
            <h1 className={styles.title}>Create your mail workspace</h1>
            <p className="text-muted-foreground">A workspace holds one imported mailbox, its splits, drafts and snippets. Invite teammates with member or viewer roles.</p>
          </div>
          <Card className={styles.panelCard}>
            <CardHeader>
              <CardTitle>Name the workspace</CardTitle>
              <CardDescription>You become its owner.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={create}>
                <Label htmlFor="mail-workspace-name">Workspace name</Label>
                <Input id="mail-workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ali's inbox" maxLength={80} required />
                <Button type="submit" disabled={creating}>{creating ? <LoaderCircle className="animate-spin" /> : <ArrowRight />} Create workspace</Button>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </form>
            </CardContent>
          </Card>
          <Button variant="ghost" className="justify-self-start" onClick={() => void logout()}><LogOut /> Sign out</Button>
        </div>
      </main>
    );
  }

  return (
    <MailApp
      key={tenantId}
      tenantId={tenantId}
      tenants={tenants ?? []}
      userEmail={userEmail}
      onTenantChange={(id) => {
        setTenantId(id);
        storeTenant(id);
      }}
      onNewWorkspace={() => setTenantId(null)}
      onLogout={() => void logout()}
    />
  );
}

/* ======================================================================== */

type Undo = { threadId: string; action: ThreadAction; label: string };

function MailApp({
  tenantId,
  tenants,
  userEmail,
  onTenantChange,
  onNewWorkspace,
  onLogout,
}: {
  tenantId: string;
  tenants: Tenant[];
  userEmail: string;
  onTenantChange: (id: string) => void;
  onNewWorkspace: () => void;
  onLogout: () => void;
}) {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("mail");
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
  const [dialog, setDialog] = useState<null | "trash" | "snooze" | "remind" | "label" | "shortcuts" | "import" | "compose" | "palette">(null);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);
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
    if (view === "drafts") return [];
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

  const inboxTotal = Object.values(counts).reduce((sum, count) => sum + count.total, 0);
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
    setOpenId(null);
    setCursor(0);
    try {
      const data = await api<{ hits: SearchHit[] }>(tenantPath(tenantId, `/search?q=${encodeURIComponent(trimmed)}`));
      setHits(data.hits);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Search failed.");
      setHits([]);
    }
    setSearching(false);
  }

  function goTo(next: View) {
    setView(next);
    setOpenId(null);
    setCursor(0);
    setTab("mail");
  }

  const splitOrder = useMemo(() => [PRIMARY_SPLIT, ...splits.map((rule) => rule.id)], [splits]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && tab === "mail") {
        event.preventDefault();
        setDialog((current) => (current === "palette" ? null : current ?? "palette"));
        return;
      }
      const element = event.target as HTMLElement | null;
      if (element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))) {
        if (event.key === "Escape" && element === searchRef.current) searchRef.current?.blur();
        return;
      }
      if (dialog || tab !== "mail" || event.metaKey || event.ctrlKey || event.altKey) return;
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
          setOpenId(null);
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
          if (undo) {
            const thread = byId.get(undo.threadId);
            if (thread) void act(thread, undo.action, undefined, { recordUndo: false });
            setUndo(null);
          }
          return;
        case "Tab":
          if (view === "inbox" && !openId) {
            event.preventDefault();
            const index = splitOrder.indexOf(split);
            const next = splitOrder[(index + (event.shiftKey ? -1 : 1) + splitOrder.length) % splitOrder.length];
            setSplit(next);
            setCursor(0);
          }
          return;
      }

      if (!target) return;
      switch (key) {
        case "e":
          event.preventDefault();
          if (target.state === "inbox" && !isSnoozed(target, now)) void act(target, { type: "archive" }, "Archived");
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
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- render ---------- */

  if (!mailbox) {
    return (
      <main className={`${styles.page} fleet-app`}>
        <div className={styles.frame}>
          {loadError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{loadError.includes("role") ? "No access" : "The mailbox could not be loaded"}</AlertTitle>
              <AlertDescription>
                {loadError}{" "}
                <Button variant="link" className="h-auto p-0" onClick={() => void load()}>Try again</Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Skeleton className="h-10 w-64" />
              <Skeleton className="mt-6 h-96 w-full" />
            </>
          )}
        </div>
      </main>
    );
  }

  const navItems: Array<{ id: View; label: string; icon: typeof Inbox; count?: number }> = [
    { id: "inbox", label: "Inbox", icon: Inbox, count: inboxTotal },
    { id: "starred", label: "Starred", icon: Star, count: threads.filter((thread) => thread.starred && thread.state !== "trash").length },
    { id: "snoozed", label: "Snoozed", icon: Clock3, count: threads.filter((thread) => threadView(thread, now) === "snoozed").length },
    { id: "reminders", label: "Follow-ups", icon: BellRing, count: threads.filter((thread) => isReminderDue(thread, now)).length },
    { id: "drafts", label: "Drafts", icon: PenLine, count: mailbox.drafts.length },
    { id: "archived", label: "Done", icon: Archive },
    { id: "trash", label: "Trash", icon: Trash2 },
  ];

  const activeTenant = tenants.find((tenant) => tenant.id === tenantId);

  const commands: PaletteCommand[] = [
    ...navItems.map((item) => ({ id: `go-${item.id}`, label: `Go to ${item.label}`, run: () => goTo(item.id) })),
    ...[{ id: PRIMARY_SPLIT, name: "Primary" }, ...splits].map((rule) => ({
      id: `split-${rule.id}`,
      label: `Open split: ${rule.name}`,
      run: () => {
        goTo("inbox");
        setSplit(rule.id);
      },
    })),
    ...labels.map((label) => ({ id: `label-${label}`, label: `Go to label: ${label}`, run: () => goTo(`label:${label}`) })),
    { id: "compose", label: "Compose new message", hint: "c", run: () => { setComposeSeed(null); setDialog("compose"); } },
    { id: "search", label: "Search mail", hint: "/", run: () => window.setTimeout(() => searchRef.current?.focus(), 50) },
    ...(readOnly ? [] : [{ id: "import", label: "Import .eml / .mbox", run: () => setDialog("import") }]),
    { id: "export", label: "Export mailbox as JSON", run: () => window.location.assign(tenantPath(tenantId, "/export")) },
    { id: "splits", label: "Manage splits and snippets", run: () => setTab("settings") },
    { id: "team", label: "Manage members", run: () => setTab("team") },
    { id: "audit", label: "Open audit log", run: () => setTab("audit") },
    { id: "shortcuts", label: "Show keyboard shortcuts", hint: "?", run: () => setDialog("shortcuts") },
    ...(target && !readOnly
      ? [
          { id: "t-archive", label: `Archive “${target.subject || "(no subject)"}”`, hint: "e", run: () => { void act(target, target.state === "inbox" && !isSnoozed(target, now) ? { type: "archive" } : { type: "restore" }, "Archived"); setOpenId(null); } },
          { id: "t-trash", label: "Move thread to Trash", hint: "#", run: () => setDialog("trash") },
          { id: "t-star", label: target.starred ? "Unstar thread" : "Star thread", hint: "s", run: () => void act(target, { type: "star", value: !target.starred }, target.starred ? "Unstarred" : "Starred") },
          { id: "t-snooze", label: "Snooze thread", hint: "h", run: () => setDialog("snooze") },
          { id: "t-remind", label: "Follow up if no reply", hint: "f", run: () => setDialog("remind") },
          { id: "t-label", label: "Label thread", hint: "l", run: () => setDialog("label") },
          { id: "t-reply", label: "Reply", hint: "r", run: () => startReply(target) },
          { id: "t-unread", label: target.unread ? "Mark as read" : "Mark as unread", hint: "u", run: () => void act(target, { type: "read", value: target.unread }, target.unread ? "Marked read" : "Marked unread") },
        ]
      : []),
    { id: "logout", label: "Sign out", run: onLogout },
  ];

  return (
    <main className={`${styles.page} fleet-app`}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <div className="min-w-0">
            <p className={styles.eyebrow}>SaaSassin Mail</p>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={tenantId}
                onValueChange={(value) => {
                  if (value === "__new") onNewWorkspace();
                  else onTenantChange(value);
                }}
              >
                <SelectTrigger aria-label="Workspace" className="w-56 max-w-full"><SelectValue>{activeTenant?.name ?? "Workspace"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                  <SelectItem value="__new">+ New workspace</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">{mailbox.role}</Badge>
            </div>
          </div>
          <form
            className={styles.search}
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(query);
              searchRef.current?.blur();
            }}
          >
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <Input ref={searchRef} aria-label="Search mail" placeholder="Search  (/)   from:  subject:  has:invite" value={query} onChange={(event) => setQuery(event.target.value)} />
          </form>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialog("import")} disabled={readOnly}><FileUp /> Import</Button>
            <Button size="sm" onClick={() => { setComposeSeed(null); setDialog("compose"); }}><PenLine /> Compose</Button>
            <Button variant="ghost" size="sm" aria-label="Keyboard shortcuts" onClick={() => setDialog("shortcuts")}><Keyboard /></Button>
            <Button variant="ghost" size="sm" onClick={onLogout}><LogOut /> Sign out</Button>
          </div>
        </header>

        <Alert className={styles.providerNotice}>
          <CircleAlert />
          <AlertTitle>Gmail / Microsoft connection not configured</AlertTitle>
          <AlertDescription>Live sync and sending wait on provider OAuth review. Import .eml or .mbox files to work with real mail now.</AlertDescription>
        </Alert>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="mail">Mail</TabsTrigger>
            <TabsTrigger value="settings">Splits &amp; snippets</TabsTrigger>
            <TabsTrigger value="connections">Connections</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="mail">
            <div className={styles.layout} data-open={openId ? "true" : "false"}>
              <nav className={styles.sidebar} aria-label="Mailboxes">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} type="button" className={styles.navItem} data-active={view === item.id} onClick={() => goTo(item.id)}>
                      <Icon aria-hidden="true" className="size-4" />
                      <span>{item.label}</span>
                      {item.count ? <span className={styles.count}>{item.count}</span> : null}
                    </button>
                  );
                })}
                {labels.length ? <p className={styles.navHeading}>Labels</p> : null}
                {labels.map((label) => (
                  <button key={label} type="button" className={styles.navItem} data-active={view === `label:${label}`} onClick={() => goTo(`label:${label}`)}>
                    <Tag aria-hidden="true" className="size-4" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
                <a className={styles.navItem} href={tenantPath(tenantId, "/export")} download>
                  <Download aria-hidden="true" className="size-4" />
                  <span>Export JSON</span>
                </a>
              </nav>

              <section className={styles.listColumn} aria-label="Threads">
                {view === "inbox" ? (
                  <div className={styles.splitBar} role="tablist" aria-label="Splits">
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
                        <span className={styles.splitCount}>{counts[rule.id]?.unread ? `${counts[rule.id].unread}/` : ""}{counts[rule.id]?.total ?? 0}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.listHeading}>
                    <h2>{view === "search" ? `Results for “${query.trim()}”` : view.startsWith("label:") ? view.slice(6) : navItems.find((item) => item.id === view)?.label}</h2>
                    {view === "search" ? <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setHits(null); goTo("inbox"); }}>Clear</Button> : null}
                  </div>
                )}

                {actionError ? (
                  <Alert variant="destructive" className="my-2">
                    <CircleAlert />
                    <AlertTitle>Not saved</AlertTitle>
                    <AlertDescription>{actionError}</AlertDescription>
                  </Alert>
                ) : null}
                {undo ? (
                  <div className={styles.undoBar} role="status">
                    <span>{undo.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => { const thread = byId.get(undo.threadId); if (thread) void act(thread, undo.action, undefined, { recordUndo: false }); setUndo(null); }}>
                      <Undo2 /> Undo <kbd className="ml-1 text-xs">z</kbd>
                    </Button>
                  </div>
                ) : null}

                {view === "drafts" ? (
                  <DraftList drafts={mailbox.drafts} onOpen={(draft) => { setComposeSeed(draft); setDialog("compose"); }} />
                ) : searching ? (
                  <div className="grid gap-2 p-2">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-14 w-full" />)}</div>
                ) : visible.length === 0 ? (
                  <EmptyState view={view} hasMail={threads.length > 0} onImport={() => setDialog("import")} readOnly={readOnly} />
                ) : (
                  <ol className={styles.threadList}>
                    {visible.map((thread, index) => {
                      const due = isReminderDue(thread, now);
                      const hit = view === "search" ? hits?.find((entry) => entry.threadId === thread.id) : null;
                      return (
                        <li key={thread.id}>
                          <button
                            type="button"
                            className={styles.threadRow}
                            data-selected={index === activeIndex}
                            data-unread={thread.unread}
                            data-open={thread.id === openId}
                            aria-current={index === activeIndex ? "true" : undefined}
                            onClick={() => { setCursor(index); void openThreadById(thread); }}
                          >
                            <span className={styles.rowSender}>{senderLine(thread)}{thread.messageCount > 1 ? <span className="text-muted-foreground"> {thread.messageCount}</span> : null}</span>
                            <span className={styles.rowSubject}>
                              {thread.starred ? <Star aria-label="Starred" className="mr-1 inline size-3.5 fill-current" /> : null}
                              <strong>{thread.subject || "(no subject)"}</strong>
                              <span className="text-muted-foreground"> — {hit?.snippet ?? thread.snippet}</span>
                            </span>
                            <span className={styles.rowMeta}>
                              {due ? <Badge>Follow up</Badge> : null}
                              {thread.hasCalendarInvite ? <CalendarDays aria-label="Calendar invite" className="size-3.5" /> : null}
                              {thread.isNewsletter ? <Newspaper aria-label="Newsletter" className="size-3.5" /> : null}
                              {thread.labels.slice(0, 2).map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
                              <time dateTime={thread.lastMessageAt}>{shortDate(thread.lastMessageAt)}</time>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className={styles.reader} aria-label="Thread">
                {openThread ? (
                  <ThreadReader
                    thread={openThread}
                    messages={messages}
                    now={now}
                    readOnly={readOnly}
                    onBack={() => setOpenId(null)}
                    onArchive={() => { void act(openThread, openThread.state === "inbox" && !isSnoozed(openThread, now) ? { type: "archive" } : { type: "restore" }, openThread.state === "inbox" ? "Archived" : "Moved to Inbox"); setOpenId(null); }}
                    onTrash={() => (openThread.state === "trash" ? void act(openThread, { type: "restore" }, "Restored") : setDialog("trash"))}
                    onStar={() => void act(openThread, { type: "star", value: !openThread.starred }, openThread.starred ? "Unstarred" : "Starred")}
                    onSnooze={() => setDialog("snooze")}
                    onRemind={() => setDialog("remind")}
                    onClearReminder={() => void act(openThread, { type: "clear-reminder" }, "Follow-up cleared", { recordUndo: false })}
                    onLabel={() => setDialog("label")}
                    onReply={() => startReply(openThread)}
                    onUnread={() => { void act(openThread, { type: "read", value: false }, "Marked unread"); setOpenId(null); }}
                  />
                ) : (
                  <div className={styles.readerEmpty}>
                    <MailOpen aria-hidden="true" />
                    <p>Select a thread with <kbd>j</kbd>/<kbd>k</kbd> and press <kbd>Enter</kbd>.</p>
                    <p className="text-sm text-muted-foreground">Press <kbd>?</kbd> for every shortcut.</p>
                  </div>
                )}
              </section>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="grid gap-4 lg:grid-cols-2">
            <SplitsPanel tenantId={tenantId} splits={splits} readOnly={readOnly} onChange={() => void load()} />
            <SnippetsPanel tenantId={tenantId} templates={mailbox.templates} readOnly={readOnly} onChange={() => void load()} />
          </TabsContent>
          <TabsContent value="connections">
            <ConnectionsPanel mailbox={mailbox} />
          </TabsContent>
          <TabsContent value="team">
            <TeamPanel tenantId={tenantId} role={mailbox.role} />
          </TabsContent>
          <TabsContent value="audit">
            <AuditPanel tenantId={tenantId} />
          </TabsContent>
        </Tabs>
      </div>

      <TrashDialog
        open={dialog === "trash"}
        subject={target?.subject ?? ""}
        onOpenChange={(open) => setDialog(open ? "trash" : null)}
        onConfirm={() => {
          if (target) void act(target, { type: "trash" }, "Moved to Trash");
          setDialog(null);
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
              void act(target, { type: "snooze", until: iso }, `Snoozed until ${new Date(iso).toLocaleString()}`);
              setOpenId(null);
            }
          }
          setDialog(null);
        }}
      />
      <LabelDialog
        open={dialog === "label"}
        onOpenChange={(open) => setDialog(open ? "label" : null)}
        current={target?.labels ?? []}
        known={labels}
        onToggle={(label, value) => {
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
    </main>
  );
}

/* ======================================================================== */

function EmptyState({ view, hasMail, onImport, readOnly }: { view: View; hasMail: boolean; onImport: () => void; readOnly: boolean }) {
  if (!hasMail) {
    return (
      <div className={styles.emptyState}>
        <FileUp aria-hidden="true" />
        <h3>Bring your mail in</h3>
        <p>Import .eml files or an .mbox export. Messages are threaded by Message-ID, In-Reply-To and References, then sorted into your splits.</p>
        <Button onClick={onImport} disabled={readOnly}><FileUp /> Import mail</Button>
      </div>
    );
  }
  if (view === "inbox") {
    return (
      <div className={styles.emptyState} data-zero="true">
        <Sparkles aria-hidden="true" />
        <h3>Inbox zero</h3>
        <p>Nothing left in this split. Snoozed threads and follow-ups come back on their own.</p>
      </div>
    );
  }
  const copy: Partial<Record<string, string>> = {
    starred: "Star a thread with s to keep it here.",
    snoozed: "Nothing snoozed. Press h on a thread to snooze it.",
    reminders: "No follow-ups. Press f on a thread to be reminded if nobody replies.",
    archived: "Archived threads appear here. Press e to mark a thread done.",
    trash: "Trash is empty.",
    search: "No messages match. Try fewer words or from:, subject:, has:invite.",
  };
  return (
    <div className={styles.emptyState}>
      <Inbox aria-hidden="true" />
      <p>{copy[view] ?? "No threads with this label."}</p>
    </div>
  );
}

function DraftList({ drafts, onOpen }: { drafts: Draft[]; onOpen: (draft: Draft) => void }) {
  if (!drafts.length) {
    return (
      <div className={styles.emptyState}>
        <PenLine aria-hidden="true" />
        <p>No drafts. Press c to compose or r on a thread to reply.</p>
      </div>
    );
  }
  return (
    <ol className={styles.threadList}>
      {drafts.map((draft) => (
        <li key={draft.id}>
          <button type="button" className={styles.threadRow} onClick={() => onOpen(draft)}>
            <span className={styles.rowSender}>{draft.to || "No recipient"}</span>
            <span className={styles.rowSubject}><strong>{draft.subject || "(no subject)"}</strong><span className="text-muted-foreground"> — {draft.body.slice(0, 120)}</span></span>
            <span className={styles.rowMeta}>
              {draft.status === "send_blocked" ? <Badge variant="outline">Not sent: no provider</Badge> : <Badge variant="outline">Draft</Badge>}
              {draft.updatedAt ? <time dateTime={draft.updatedAt}>{shortDate(draft.updatedAt)}</time> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
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
}) {
  const due = isReminderDue(thread, now);
  const replied = hasReplySinceReminder(thread);
  return (
    <article className={styles.readerBody}>
      <div className={styles.readerToolbar}>
        <Button size="sm" variant="ghost" onClick={onBack} aria-label="Back to list"><ArrowLeft /> <span className="sr-only sm:not-sr-only">Back</span></Button>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={onArchive} disabled={readOnly}><Archive /> {thread.state === "inbox" ? "Done" : "Inbox"} <kbd className="text-xs">e</kbd></Button>
          <Button size="sm" variant="outline" onClick={onSnooze} disabled={readOnly}><Clock3 /> Snooze <kbd className="text-xs">h</kbd></Button>
          <Button size="sm" variant="outline" onClick={onRemind} disabled={readOnly}><BellRing /> Follow up <kbd className="text-xs">f</kbd></Button>
          <Button size="sm" variant="outline" onClick={onStar} disabled={readOnly} aria-pressed={thread.starred}><Star className={thread.starred ? "fill-current" : undefined} /> <kbd className="text-xs">s</kbd></Button>
          <Button size="sm" variant="outline" onClick={onLabel} disabled={readOnly}><Tag /> <kbd className="text-xs">l</kbd></Button>
          <Button size="sm" variant="outline" onClick={onUnread} disabled={readOnly}><MailOpen /> <kbd className="text-xs">u</kbd></Button>
          <Button size="sm" variant="outline" onClick={onTrash} disabled={readOnly}><Trash2 /> <kbd className="text-xs">#</kbd></Button>
        </div>
      </div>
      <h2 className={styles.readerSubject}>{thread.subject || "(no subject)"}</h2>
      <div className="flex flex-wrap gap-2">
        {thread.labels.map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
        {thread.snoozedUntil && isSnoozed(thread, now) ? <Badge variant="outline">Snoozed until {new Date(thread.snoozedUntil).toLocaleString()}</Badge> : null}
        {thread.reminder ? (
          <Badge variant={due ? "default" : "outline"}>
            {due ? "Follow up: no reply yet" : replied ? "Reply received" : `Follow up ${new Date(thread.reminder.at).toLocaleDateString()}`}
            {!readOnly ? <button type="button" className="ml-1 underline" onClick={onClearReminder}>clear</button> : null}
          </Badge>
        ) : null}
        {thread.state === "trash" ? <Badge variant="destructive">In Trash</Badge> : null}
      </div>

      {messages === null ? (
        <div className="grid gap-3">{[0, 1].map((index) => <Skeleton key={index} className="h-32 w-full" />)}</div>
      ) : (
        <ol className={styles.messageList}>
          {messages.map((message) => (
            <li key={message.id} className={styles.message}>
              <header className={styles.messageHeader}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{message.from ? formatAddress(message.from) : "Unknown sender"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    to {message.to.map(formatAddress).join(", ") || "undisclosed recipients"}
                    {message.cc.length ? ` · cc ${message.cc.map(formatAddress).join(", ")}` : ""}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={message.date ?? undefined}>{message.date ? new Date(message.date).toLocaleString() : "No date"}</time>
              </header>
              <div className="flex flex-wrap gap-2">
                {message.hasCalendarInvite ? <Badge variant="outline"><CalendarDays /> Calendar invite</Badge> : null}
                {message.listUnsubscribe ? <Badge variant="outline"><Newspaper /> Newsletter (List-Unsubscribe)</Badge> : null}
                {message.bodySource === "html" ? <Badge variant="outline">HTML shown as plain text</Badge> : null}
              </div>
              {/* Bodies are rendered as escaped text only; email HTML is never rendered. */}
              <div className={styles.messageText}>{message.text || "(This message has no text body.)"}</div>
              {message.attachments.length ? (
                <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {message.attachments.map((attachment, index) => (
                    <li key={`${attachment.filename}-${index}`} className="flex items-center gap-1 rounded border px-2 py-1">
                      <Paperclip className="size-3" /> {attachment.filename} · {Math.max(1, Math.round(attachment.size / 1024))} KB (not stored)
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      <Button className="justify-self-start" onClick={onReply} disabled={readOnly}><Reply /> Reply <kbd className="text-xs">r</kbd></Button>
    </article>
  );
}
