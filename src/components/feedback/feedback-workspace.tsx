"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Download, ExternalLink, LoaderCircle, LogOut, Plus, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import type { loadAdminSnapshot } from "@/lib/feedback/data";
import { filterPosts, POST_STATUSES, sortPosts, STATUS_LABELS, type PostFilter } from "@/lib/feedback/model";

import styles from "./feedback.module.css";
import { CannyImport } from "./canny-import";
import { PostManager } from "./post-manager";
import { apiJson, formatDate, formatDateTime, StatusBadge, TagChip } from "./shared";

type TenantSummary = { id: string; name: string; role: string };
export type AdminData = Awaited<ReturnType<typeof loadAdminSnapshot>> & {
  tenant: { id: string; name: string };
  role: string;
  me: { uid: string; email: string };
};

const STORAGE_KEY = "saasassin.feedback.tenant";

export function FeedbackWorkspace({ user }: { user: { email: string; name: string } }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    apiJson<{ tenants: TenantSummary[] }>("/api/fleet/feedback/tenants")
      .then(({ tenants: list }) => {
        if (!active) return;
        setTenants(list);
        let remembered: string | null = null;
        try { remembered = window.localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        setTenantId(list.find((entry) => entry.id === remembered)?.id ?? list[0]?.id ?? null);
      })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      setData(await apiJson<AdminData>(`/api/feedback/tenants/${id}`));
      setError(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    try { window.localStorage.setItem(STORAGE_KEY, tenantId); } catch { /* storage unavailable */ }
    let active = true;
    apiJson<AdminData>(`/api/feedback/tenants/${tenantId}`)
      .then((result) => { if (active) { setData(result); setError(null); } })
      .catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [tenantId]);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { tenant } = await apiJson<{ tenant: TenantSummary }>("/api/fleet/feedback/tenants", { method: "POST", body: JSON.stringify({ name: newName }) });
      setTenants((current) => [...(current ?? []), tenant]);
      setTenantId(tenant.id);
      setNewName("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    await fetch("/api/fleet/feedback/session", { method: "DELETE" });
    try { await signOut(getFirebaseClientAuth()); } catch { /* server session already cleared */ }
    router.push("/apps/feedback/sign-in");
    router.refresh();
  }

  const createForm = (
    <form className={styles.stack} onSubmit={createWorkspace}>
      <Label htmlFor="fb-new-workspace">Workspace name</Label>
      <div className={styles.row}>
        <Input id="fb-new-workspace" className="max-w-sm" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Acme product feedback" minLength={2} maxLength={80} required />
        <Button type="submit" disabled={creating || newName.trim().length < 2}>{creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Create workspace</Button>
      </div>
    </form>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="/apps/feedback"><span className={styles.mark}>FB</span><span>SaaSassin Feedback</span></Link>
          <div className={styles.row}>
            {tenants && tenants.length > 0 ? (
              <Select value={tenantId ?? undefined} onValueChange={(value) => { setData(null); setTenantId(value); }}>
                <SelectTrigger className="w-56" aria-label="Choose workspace"><SelectValue placeholder="Choose workspace" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.role}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            <span className={`${styles.muted} text-sm`}>{user.email}</span>
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="size-4" /> Sign out</Button>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        {error ? <Alert variant="destructive" className="mb-4"><AlertTitle>Something needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        {tenants === null && !error ? <p className={styles.muted}><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading your workspaces…</p> : null}

        {tenants && tenants.length === 0 ? (
          <section className={styles.panel}>
            <p className={styles.eyebrow}>Step 1 of 3</p>
            <h1 className={styles.title}>Create your feedback workspace</h1>
            <p className={styles.lede}>A workspace holds your boards, posts, votes, roadmap and changelog. Next you will create a public board and share its link.</p>
            <div className="mt-5">{createForm}</div>
          </section>
        ) : null}

        {tenantId && !data && !error ? <p className={styles.muted}><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading workspace…</p> : null}

        {data ? <Workspace data={data} reload={() => load(data.tenant.id)} loading={loading} createForm={createForm} /> : null}
      </div>
    </main>
  );
}

function Workspace({ data, reload, loading, createForm }: { data: AdminData; reload: () => Promise<void>; loading: boolean; createForm: React.ReactNode }) {
  const isAdmin = data.role === "owner" || data.role === "admin";
  const tenantId = data.tenant.id;
  const [tab, setTab] = useState(data.boards.length === 0 ? "boards" : "posts");
  const [managing, setManaging] = useState<string | null>(null);
  const [boardFilter, setBoardFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<NonNullable<PostFilter["status"]>>("all");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(true);
  const tagsById = useMemo(() => new Map(data.tags.map((tag) => [tag.id, tag])), [data.tags]);
  const boardsById = useMemo(() => new Map(data.boards.map((board) => [board.id, board])), [data.boards]);

  const posts = useMemo(() => {
    const scoped = data.posts.filter((post) => (boardFilter === "all" || post.boardId === boardFilter) && (showHidden || !post.hidden));
    return sortPosts(filterPosts(scoped, { status: statusFilter, query }), "votes");
  }, [data.posts, boardFilter, statusFilter, query, showHidden]);

  const counts = useMemo(() => Object.fromEntries(POST_STATUSES.map((status) => [status, data.posts.filter((post) => post.status === status).length])), [data.posts]);
  const managed = data.posts.find((post) => post.id === managing) ?? null;

  return (
    <>
      <div className={styles.rowBetween}>
        <div>
          <p className={styles.eyebrow}>Workspace · your role: {data.role}</p>
          <h1 className={styles.title}>{data.tenant.name}</h1>
        </div>
        <div className={styles.row}>
          <Button asChild variant="outline"><Link href={`/apps/feedback/b/${tenantId}`} target="_blank"><ExternalLink className="size-4" /> Public roadmap</Link></Button>
          <Button variant="outline" onClick={reload} disabled={loading}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Refresh</Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
        {POST_STATUSES.map((status) => (
          <div key={status} className={styles.panel} style={{ padding: 10 }}>
            <StatusBadge status={status} />
            <div className="mt-1 text-2xl font-bold">{counts[status]}</div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className={`${styles.tabs} mt-6`}>
        <TabsList>
          <TabsTrigger value="posts">Posts ({data.posts.length})</TabsTrigger>
          <TabsTrigger value="boards">Boards ({data.boards.length})</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="data">Import &amp; export</TabsTrigger>
          <TabsTrigger value="workspaces">New workspace</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <div className={styles.toolbar}>
            <Input placeholder="Search title, details, #number" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search posts" />
            <Select value={boardFilter} onValueChange={setBoardFilter}>
              <SelectTrigger aria-label="Filter by board"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All boards</SelectItem>
                {data.boards.map((board) => <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger aria-label="Filter by status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                {POST_STATUSES.map((status) => <SelectItem key={status} value={status}>{STATUS_LABELS[status]}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className={`${styles.row} text-sm`}><Switch checked={showHidden} onCheckedChange={setShowHidden} /> Show hidden</label>
          </div>
          {data.posts.length === 0 ? (
            <div className={styles.empty}>
              No posts yet. {data.boards.length ? "Share a public board link so customers can post and vote." : "Create a board first."}
            </div>
          ) : posts.length === 0 ? <div className={styles.empty}>No posts match these filters.</div> : (
            <div className={`${styles.panel} ${styles.tableWrap}`} style={{ padding: 0 }}>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>#</TableHead><TableHead>Post</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Votes</TableHead><TableHead className="text-right">Comments</TableHead><TableHead /></TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((post) => (
                    <TableRow key={post.id} className={post.hidden ? "opacity-60" : undefined}>
                      <TableCell className={styles.mono}>{post.number}</TableCell>
                      <TableCell className="max-w-[420px] whitespace-normal">
                        <strong>{post.title}</strong>
                        <div className={styles.postMeta}>
                          <span>{boardsById.get(post.boardId)?.name ?? "Unknown board"}</span>
                          <span>{post.author.name}</span>
                          <span>{formatDate(post.createdAt)}</span>
                          {post.hidden ? <Badge variant="destructive">Hidden</Badge> : null}
                          {post.tags.map((id) => { const tag = tagsById.get(id); return tag ? <TagChip key={id} tag={tag} /> : null; })}
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={post.status} /></TableCell>
                      <TableCell className="text-right font-mono">{post.voteCount}</TableCell>
                      <TableCell className="text-right font-mono">{post.commentCount}</TableCell>
                      <TableCell><Button size="sm" variant="outline" onClick={() => setManaging(post.id)}>Manage</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="boards" className="mt-4"><BoardsPanel data={data} isAdmin={isAdmin} reload={reload} /></TabsContent>
        <TabsContent value="changelog" className="mt-4"><ChangelogPanel data={data} isAdmin={isAdmin} reload={reload} /></TabsContent>
        <TabsContent value="tags" className="mt-4"><TagsPanel data={data} isAdmin={isAdmin} reload={reload} /></TabsContent>
        <TabsContent value="members" className="mt-4"><MembersPanel data={data} isAdmin={isAdmin} reload={reload} /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPanel data={data} /></TabsContent>
        <TabsContent value="data" className="mt-4">
          <div className={styles.stack}>
            <ExportPanel tenantId={tenantId} isAdmin={isAdmin} />
            <CannyImport tenantId={tenantId} isAdmin={isAdmin} onImported={reload} />
          </div>
        </TabsContent>
        <TabsContent value="workspaces" className="mt-4">
          <section className={styles.panel}>
            <h2 className="mb-3 text-lg font-bold">Create another workspace</h2>
            {createForm}
          </section>
        </TabsContent>
      </Tabs>

      {managed ? (
        <PostManager
          key={managed.id}
          tenantId={tenantId}
          post={managed}
          data={data}
          isAdmin={isAdmin}
          onClose={() => setManaging(null)}
          onChanged={reload}
        />
      ) : null}
    </>
  );
}

function useAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await reload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, run };
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  if (notice) return <p className="text-sm text-emerald-700" role="status">{notice}</p>;
  return null;
}

function ReadOnlyNote({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? null : <p className={`${styles.muted} text-sm`}>Only workspace owners and admins can change this.</p>;
}

function BoardsPanel({ data, isAdmin, reload }: { data: AdminData; isAdmin: boolean; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const action = useAction(reload);
  const tenantId = data.tenant.id;

  function create(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      await apiJson(`/api/feedback/tenants/${tenantId}/boards`, { method: "POST", body: JSON.stringify({ name, description, isPublic }) });
      setName("");
      setDescription("");
    }, "Board created. Share its public link below.");
  }

  return (
    <div className={styles.grid2} style={{ marginTop: 0 }}>
      <div className={styles.stack}>
        {data.boards.length === 0 ? <div className={styles.empty}>No boards yet. Create one to start collecting feedback.</div> : null}
        {data.boards.map((board) => {
          const href = `/apps/feedback/b/${tenantId}/${board.slug}`;
          return (
            <div key={board.id} className={styles.panel}>
              <div className={styles.rowBetween}>
                <div>
                  <strong className="text-lg">{board.name}</strong>
                  <div className={`${styles.mono} ${styles.muted}`}>{href}</div>
                </div>
                <div className={styles.row}>
                  <label className={`${styles.row} text-sm`}>
                    <Switch
                      checked={board.isPublic}
                      disabled={!isAdmin || action.busy}
                      onCheckedChange={(checked) => void action.run(
                        () => apiJson(`/api/feedback/tenants/${tenantId}/boards/${board.id}`, { method: "PATCH", body: JSON.stringify({ isPublic: checked }) }),
                        checked ? "Board is public." : "Board is now private.",
                      )}
                    />
                    {board.isPublic ? "Public" : "Private"}
                  </label>
                  {board.isPublic ? <Button asChild size="sm" variant="outline"><Link href={href} target="_blank"><ExternalLink className="size-4" /> Open</Link></Button> : null}
                </div>
              </div>
              {board.description ? <p className={`${styles.muted} mt-2 text-sm`}>{board.description}</p> : null}
              <p className="mt-2 text-sm">{data.posts.filter((post) => post.boardId === board.id).length} posts</p>
            </div>
          );
        })}
        <Feedback error={action.error} notice={action.notice} />
      </div>
      <form className={`${styles.panel} ${styles.stack}`} onSubmit={create}>
        <h2 className="text-lg font-bold">New board</h2>
        <ReadOnlyNote isAdmin={isAdmin} />
        <div className="grid gap-1.5"><Label htmlFor="fb-board-name">Name</Label><Input id="fb-board-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Feature requests" disabled={!isAdmin} /></div>
        <div className="grid gap-1.5"><Label htmlFor="fb-board-desc">Description</Label><Textarea id="fb-board-desc" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} disabled={!isAdmin} /></div>
        <label className={`${styles.row} text-sm`}><Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!isAdmin} /> Anyone with the link can read</label>
        <Button type="submit" disabled={!isAdmin || action.busy || name.trim().length < 2}>Create board</Button>
      </form>
    </div>
  );
}

function ChangelogPanel({ data, isAdmin, reload }: { data: AdminData; isAdmin: boolean; reload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const action = useAction(reload);
  const completed = data.posts.filter((post) => post.status === "completed" && !post.hidden);
  const postsById = new Map(data.posts.map((post) => [post.id, post]));

  function publish(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      await apiJson(`/api/feedback/tenants/${data.tenant.id}/changelog`, { method: "POST", body: JSON.stringify({ title, body, postIds: selected }) });
      setTitle("");
      setBody("");
      setSelected([]);
    }, "Changelog entry published on the public portal.");
  }

  return (
    <div className={styles.grid2} style={{ marginTop: 0 }}>
      <div className={styles.panel}>
        <h2 className="text-lg font-bold">Published</h2>
        {data.changelog.length === 0 ? <p className={styles.muted}>No entries yet. Complete a post, then announce it here.</p> : null}
        {data.changelog.map((entry) => (
          <article key={entry.id} className={styles.changelogEntry}>
            <p className={styles.eyebrow}>{formatDate(entry.publishedAt)} · {entry.author.name}</p>
            <strong>{entry.title}</strong>
            {entry.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{entry.body}</p> : null}
            <ul className="mt-2 text-sm">
              {entry.postIds.map((id) => { const post = postsById.get(id); return post ? <li key={id}>#{post.number} {post.title}</li> : null; })}
            </ul>
          </article>
        ))}
      </div>
      <form className={`${styles.panel} ${styles.stack}`} onSubmit={publish}>
        <h2 className="text-lg font-bold">Announce a release</h2>
        <ReadOnlyNote isAdmin={isAdmin} />
        <div className="grid gap-1.5"><Label htmlFor="fb-cl-title">Title</Label><Input id="fb-cl-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!isAdmin} placeholder="October release" /></div>
        <div className="grid gap-1.5"><Label htmlFor="fb-cl-body">Notes</Label><Textarea id="fb-cl-body" value={body} onChange={(event) => setBody(event.target.value)} rows={4} disabled={!isAdmin} /></div>
        <fieldset className={styles.stack}>
          <legend className="text-sm font-medium">Completed posts in this release</legend>
          {completed.length === 0 ? <p className={`${styles.muted} text-sm`}>No completed posts yet.</p> : null}
          {completed.map((post) => (
            <label key={post.id} className={`${styles.row} text-sm`}>
              <Checkbox
                checked={selected.includes(post.id)}
                disabled={!isAdmin}
                onCheckedChange={(checked) => setSelected((current) => (checked ? [...current, post.id] : current.filter((id) => id !== post.id)))}
              />
              #{post.number} {post.title}
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={!isAdmin || action.busy || title.trim().length < 3}>Publish entry</Button>
        <Feedback error={action.error} notice={action.notice} />
      </form>
    </div>
  );
}

function TagsPanel({ data, isAdmin, reload }: { data: AdminData; isAdmin: boolean; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#27c7a6");
  const [isPublic, setIsPublic] = useState(true);
  const action = useAction(reload);

  function create(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      await apiJson(`/api/feedback/tenants/${data.tenant.id}/tags`, { method: "POST", body: JSON.stringify({ name, color, isPublic }) });
      setName("");
    }, "Tag created.");
  }

  return (
    <div className={styles.grid2} style={{ marginTop: 0 }}>
      <div className={styles.panel}>
        <h2 className="text-lg font-bold">Tags</h2>
        {data.tags.length === 0 ? <p className={styles.muted}>No tags yet.</p> : null}
        <div className={`${styles.row} mt-2`}>
          {data.tags.map((tag) => (
            <span key={tag.id} className={styles.row}>
              <TagChip tag={tag} />
              <span className="text-xs opacity-70">{tag.isPublic ? "public" : "team only"} · {data.posts.filter((post) => post.tags.includes(tag.id)).length}</span>
            </span>
          ))}
        </div>
      </div>
      <form className={`${styles.panel} ${styles.stack}`} onSubmit={create}>
        <h2 className="text-lg font-bold">New tag</h2>
        <ReadOnlyNote isAdmin={isAdmin} />
        <div className="grid gap-1.5"><Label htmlFor="fb-tag-name">Name</Label><Input id="fb-tag-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!isAdmin} /></div>
        <div className="grid gap-1.5"><Label htmlFor="fb-tag-color">Colour</Label><Input id="fb-tag-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} disabled={!isAdmin} className="h-10 w-20 p-1" /></div>
        <label className={`${styles.row} text-sm`}><Switch checked={isPublic} onCheckedChange={setIsPublic} disabled={!isAdmin} /> Visible on public boards</label>
        <Button type="submit" disabled={!isAdmin || action.busy || !name.trim()}>Create tag</Button>
        <Feedback error={action.error} notice={action.notice} />
      </form>
    </div>
  );
}

function MembersPanel({ data, isAdmin, reload }: { data: AdminData; isAdmin: boolean; reload: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const action = useAction(reload);

  function invite(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      await apiJson(`/api/feedback/tenants/${data.tenant.id}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
      setEmail("");
    }, "Member added. They will see this workspace after signing in.");
  }

  return (
    <div className={styles.grid2} style={{ marginTop: 0 }}>
      <div className={`${styles.panel} ${styles.tableWrap}`}>
        <Table>
          <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.members.map((member) => (
              <TableRow key={member.uid}><TableCell>{member.name || member.email}<div className={`${styles.muted} text-xs`}>{member.email}</div></TableCell><TableCell><Badge variant="outline">{member.role}</Badge></TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
        <p className={`${styles.muted} mt-3 text-xs`}>Owners and admins manage boards, statuses, merges, moderation and exports. Members triage with tags. Viewers read.</p>
      </div>
      <form className={`${styles.panel} ${styles.stack}`} onSubmit={invite}>
        <h2 className="text-lg font-bold">Add a teammate</h2>
        <ReadOnlyNote isAdmin={isAdmin} />
        <div className="grid gap-1.5"><Label htmlFor="fb-invite-email">Email</Label><Input id="fb-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!isAdmin} /></div>
        <div className="grid gap-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={setRole} disabled={!isAdmin}>
            <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className={`${styles.muted} text-xs`}>The person needs a SaaSassin Feedback account first.</p>
        <Button type="submit" disabled={!isAdmin || action.busy || !email.includes("@")}>Add member</Button>
        <Feedback error={action.error} notice={action.notice} />
      </form>
    </div>
  );
}

function AuditPanel({ data }: { data: AdminData }) {
  if (data.audit.length === 0) return <div className={styles.empty}>No audit events yet.</div>;
  return (
    <div className={`${styles.panel} ${styles.tableWrap}`} style={{ padding: 0 }}>
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Target</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.audit.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap text-xs">{formatDateTime(event.occurredAt)}</TableCell>
              <TableCell className="text-xs">{event.actor?.email}</TableCell>
              <TableCell className={styles.mono}>{event.action}</TableCell>
              <TableCell className={styles.mono}>{event.target?.type}/{event.target?.id?.slice(0, 8)}</TableCell>
              <TableCell className={`${styles.mono} max-w-[320px] truncate`}>{JSON.stringify(event.details)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExportPanel({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  return (
    <section className={styles.panel}>
      <h2 className="text-lg font-bold">Export everything</h2>
      <p className={`${styles.muted} mt-1 text-sm`}>
        A versioned JSON archive of boards, posts, votes, comments, tags, changelog, members and audit events, plus a Fider-shaped mapping
        (users, posts, post_votes, comments, tags, post_tags with Fider status codes) so the data can move upstream to Fider.
      </p>
      {isAdmin ? (
        <div className={`${styles.row} mt-3`}>
          <Button asChild><a href={`/api/feedback/tenants/${tenantId}/export`} download><Download className="size-4" /> Full JSON export</a></Button>
          <Button asChild variant="outline"><a href={`/api/feedback/tenants/${tenantId}/export?format=fider`} download><Download className="size-4" /> Fider mapping only</a></Button>
        </div>
      ) : <ReadOnlyNote isAdmin={isAdmin} />}
    </section>
  );
}
