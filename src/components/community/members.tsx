"use client";

import { useState } from "react";
import { AtSign, MoreHorizontal, Search, Users } from "lucide-react";

import { UserAvatar } from "@/components/account/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeHandle, validateHandle, type CommunityAction, type SafetyKind } from "@/lib/community/model";
import { cn } from "@/lib/utils";

import { ROLE_LABELS, runCommunityAction, surface, type Workspace } from "./api";
import { ViewHeader } from "./shell";

/**
 * The member directory: photos, names, @handles, headlines and roles. Nobody's email appears
 * here; the server never sends other members' emails to a member.
 */
export function MembersDirectory({ workspace, act }: { workspace: Workspace; act: (action: CommunityAction, success?: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState({
    displayName: workspace.me.profile.displayName,
    headline: workspace.me.profile.headline,
    bio: workspace.me.profile.bio,
  });
  const [handle, setHandle] = useState(workspace.me.profile.handle ?? workspace.me.suggestedHandle ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);
  const currentHandle = workspace.me.profile.handle ?? null;
  const hidden = new Map<string, SafetyKind>(workspace.safety.hidden.map((entry) => [entry.uid, entry.kind]));
  const setSafety = (targetUid: string, kind: SafetyKind | null, success: string) =>
    void act({ type: "safety.set", targetUid, kind }, success).catch(() => undefined);
  const handleCheck = validateHandle(handle);
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const shown = workspace.members.filter((member) =>
    !needle || member.displayName.toLowerCase().includes(needle) || (member.handle ?? "").includes(needle) || member.headline.toLowerCase().includes(needle));

  async function save() {
    setHandleError(null);
    if (handle.trim() && normalizeHandle(handle) !== currentHandle) {
      if (!handleCheck.ok) {
        setHandleError(handleCheck.error);
        return;
      }
      try {
        await runCommunityAction(workspace.community.id, { type: "profile.handle", handle });
      } catch (error) {
        setHandleError(error instanceof Error ? error.message : "That handle couldn't be saved.");
        return;
      }
    }
    await act({ type: "profile.update", ...profile }, "Your profile is saved.");
    setEditing(false);
  }

  return (
    <>
      <ViewHeader
        icon={Users}
        title="Members"
        description={`${workspace.members.length} ${workspace.members.length === 1 ? "person" : "people"} in ${workspace.community.name}.`}
        actions={<Button variant="outline" className="rounded-full" onClick={() => setEditing(true)}>Edit my profile</Button>}
      />
      {!currentHandle ? (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-[var(--radius)] bg-secondary p-5 text-secondary-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-card text-primary"><AtSign className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Choose your @handle</p>
            <p className="text-sm opacity-85">It&apos;s how people mention you here. Unique in this community, and never your email.</p>
          </div>
          <Button className="rounded-full" onClick={() => setEditing(true)}>Choose a handle</Button>
        </div>
      ) : null}
      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find someone by name or @handle" aria-label="Search members" className="h-10 rounded-full bg-card pl-10" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((member) => {
          const isMe = member.uid === workspace.me.uid;
          return (
            <div key={member.uid} className={cn(surface, "relative flex flex-col items-center p-6 text-center")}>
              <UserAvatar person={{ uid: member.uid, name: member.displayName, photoURL: member.photoURL }} size="2xl" className="size-20" />
              <p className="mt-3 font-heading text-lg leading-tight font-semibold">{member.displayName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{member.handle ? `@${member.handle}` : "No handle yet"}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {member.role !== "member" ? <Badge className="rounded-full">{ROLE_LABELS[member.role] ?? member.role}</Badge> : null}
                {isMe ? <Badge variant="secondary" className="rounded-full">You</Badge> : null}
                {hidden.get(member.uid) ? <Badge variant="outline" className="rounded-full capitalize">{hidden.get(member.uid)}d</Badge> : null}
              </div>
              {member.headline ? <p className="mt-3 text-sm font-medium">{member.headline}</p> : null}
              {member.bio ? <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{member.bio}</p> : null}
              {!isMe ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" className="absolute top-3 right-3" aria-label={`Options for ${member.displayName}`}><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {hidden.get(member.uid) !== "mute" ? (
                      <DropdownMenuItem onClick={() => setSafety(member.uid, "mute", `${member.displayName} is muted. Their posts and replies are hidden from you.`)}>Mute</DropdownMenuItem>
                    ) : null}
                    {hidden.get(member.uid) !== "block" ? (
                      <DropdownMenuItem variant="destructive" onClick={() => setSafety(member.uid, "block", `${member.displayName} is blocked. You won't see them, and they can't reply to your posts or mention you.`)}>Block</DropdownMenuItem>
                    ) : null}
                    {hidden.get(member.uid) ? (
                      <DropdownMenuItem onClick={() => setSafety(member.uid, null, `${member.displayName} is visible again.`)}>Un{hidden.get(member.uid)}</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}
      </div>
      {shown.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nobody matches “{query}”.</p> : null}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              await save().catch(() => undefined);
            }}
          >
            <DialogHeader>
              <DialogTitle className="brand-heading text-2xl">Your profile in {workspace.community.name}</DialogTitle>
              <DialogDescription>Every member can see this. Your email is never shown to other members. Change your photo in Account settings.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-handle">Handle</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-semibold text-muted-foreground">@</span>
                <Input
                  id="profile-handle"
                  value={handle}
                  onChange={(event) => { setHandle(event.target.value.toLowerCase()); setHandleError(null); }}
                  maxLength={30}
                  aria-invalid={Boolean(handleError) || (handle.length > 0 && !handleCheck.ok)}
                  aria-describedby="profile-handle-help"
                  placeholder="your-handle"
                  className="rounded-xl pl-7"
                />
              </div>
              <p id="profile-handle-help" className={cn("text-xs", handleError || (handle && !handleCheck.ok) ? "text-destructive" : "text-muted-foreground")} role={handleError ? "alert" : undefined}>
                {handleError ?? (handle && !handleCheck.ok ? handleCheck.error : currentHandle ? `Changing it frees @${currentHandle} for someone else.` : "3–30 lowercase letters, numbers, hyphens or underscores.")}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-name">Display name</Label>
              <Input id="profile-name" value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} maxLength={80} required className="rounded-xl" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-headline">Headline</Label>
              <Input id="profile-headline" value={profile.headline} onChange={(event) => setProfile({ ...profile, headline: event.target.value })} maxLength={120} placeholder="Woodworker, weekend potter…" className="rounded-xl" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-bio">About you</Label>
              <Textarea id="profile-bio" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} maxLength={1000} rows={4} className="rounded-xl" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" className="rounded-full">Save profile</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
