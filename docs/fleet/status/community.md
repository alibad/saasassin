# SaaSassin Community — status

_Last updated: 2026-10-26 (fleet build night)_

Open-source Circle replacement at `/apps/community` (`community.saasassin.net`).

## What people can do now

| Who | Can now |
|-----|---------|
| Owner | Create a community, add discussion / announcements / events spaces, make a space private to a hand-picked member list, reorder spaces |
| Owner / admin | Share an invite link, switch it off, or replace it (old links stop working); add an existing account by email as member / moderator / admin; change roles; remove members |
| Owner / admin | Create membership plans that unlock private spaces, grant and revoke them by hand, and read the immutable access history |
| Invitee | Open `/apps/community/join/[tenantId]/[inviteCode]`, sign in (the link resumes after sign-in), see the community name only if the code is valid, join as a member |
| Member | Read one feed of the latest posts across every space they can see, post (title + body), reply in threads, react (Like / Celebrate / Insightful, one each), save posts, search, edit a profile (display name, headline, bio), browse the member directory |
| Member | RSVP to events and download them as `.ics` for any calendar app |
| Member | Take courses (owners publish courses and lessons inside a space), tick lessons off, and earn a certificate on first full completion |
| Member | Get an in-app inbox of replies to their posts and `@handle` mentions, with unread counts and "mark all read" |
| Member | Report a post; if their own post is removed, see the reason and appeal once per removal |
| Moderator | Pin / unpin, close / reopen comments, remove (with a reason) and restore posts, remove comments, work the reports queue and the appeals queue (never their own appeal), check members in at events and see the show-up rate |
| Owner / admin / moderator | Read the audit log of joins, posts, reactions, RSVPs, moderation, reports, appeals, role and access changes, invite changes and exports |
| Owner / admin | Download the whole community as versioned JSON (`net.saasassin.workspace-export` manifest + 17 typed files) |

## Modules

| Module | State |
|--------|-------|
| Communities (tenants), spaces, visibility, ordering | Done |
| Invite link + email invite + roles (owner/admin/moderator/member) + member removal | Done |
| Posts, threads, reactions (deterministic ids), mentions, bookmarks | Done |
| Feed (server-side visibility filtering), search | Done |
| Events, RSVPs, `.ics` calendar links, attendance check-in | Done |
| Member directory + profiles | Done |
| Notifications inbox (computed from replies/mentions) | Done (in-app only) |
| Moderation: pin, close, remove/restore, reports queue, appeals, audit view | Done |
| Plans + manual entitlements + immutable access history | Done |
| Checkout / payments / refunds | Honest "payments not connected" state — needs payment-provider credentials |
| Versioned JSON export | Done |
| Courses, lessons, progress, certificates | Done (courses live in a space and inherit its visibility) |
| Cohorts, lesson discussions, drip schedules | Not started |
| Email notifications / digests / preferences | Not started (no mail credentials tonight) |
| Blocked users, rate limits | Not started |
| Circle migration import | Not started |

## Key decisions

- **Visibility is enforced on the server, before data leaves.** The workspace endpoint only returns spaces, posts, comments and notifications from spaces the viewer can see; removed posts are redacted for non-moderators; a post in a hidden space answers 404, never 403, so private spaces do not leak their existence. Whether a member may post in a space is computed server-side too.
- **Owners and admins see every space; moderators only moderate spaces they can see.** Announcements spaces are broadcast-only (moderators+ post, members reply).
- **Private spaces open by explicit member list or by an active plan.** Plan grants are derived on the server from entitlement records on every request; the browser never sends them.
- **Entitlements are an immutable event log plus a derived state document**, written in one transaction; `replayEntitlements` rebuilds access from the log alone. Granting an already-active plan is a no-op, not a duplicate event.
- **Reactions, bookmarks, RSVPs and reports use deterministic document ids** (`{postId}__{uid}[__{type}]`), so retries and double-clicks cannot duplicate them. Reaction counts change in the same transaction as the reaction.
- **Invite codes** are 20 random characters, compared in constant time, can be disabled or rotated, and are never included in exports. Joining writes the same membership + user-index shape the shared tenant layer uses and appends `membership.joined_via_invite`. A removed member cannot rejoin by link.
- **Notifications are computed, not stored** — derived from replies and `@handle` mentions at read time, with only a per-member "read up to" timestamp persisted.
- **Attendance is defined explicitly:** "attended" is a moderator check-in; show-up rate is attended-who-said-going over everyone who said going; walk-ins are counted separately.
- **No composite indexes.** Every query is a single `where` or a single `orderBy`; the rest is sorted and filtered in memory over tenant-scoped collections.

## Known gaps

- Feed and comments read the most recent 300 posts / 500 comments per load; fine for early communities, needs pagination later.
- `@handle` is the email local part, so members can see each other's email name; display-name handles would be friendlier.
- Plans cannot be edited or archived yet (create, grant, revoke only).
- Signed-in flows were verified by typecheck, unit tests (rules for visibility, invites, reactions, feed, notifications, reports, appeals, attendance, entitlements, course progress, calendar — 42 tests) and a production build, not by a signed-in browser run (no account creation allowed tonight). Signed-out landing, sign-in (with invite resume) and invite pages were checked in the browser at desktop and 375px.
