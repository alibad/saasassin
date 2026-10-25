# SaaSassin Community — status

_Last updated: 2026-10-26 (fleet build night)_

Open-source Circle replacement at `/apps/community` (`community.saasassin.net`).

## What people can do now

| Who | Can now |
|-----|---------|
| Owner | Create a community, add discussion / announcements / events spaces, make a space private to a hand-picked member list, reorder spaces |
| Owner / admin | Share an invite link, switch it off, or replace it (old links stop working); add an existing account by email as member / moderator / admin; change roles |
| Invitee | Open `/apps/community/join/[tenantId]/[inviteCode]`, sign in (the link resumes after sign-in), see the community name only if the code is valid, join as a member |
| Member | Read one feed of the latest posts across every space they can see, post (title + body), reply in threads, react (Like / Celebrate / Insightful, one each), RSVP to events, search posts, edit a profile (display name, headline, bio), browse the member directory |
| Member | Get an in-app inbox of replies to their posts and `@handle` mentions, with unread counts and "mark all read" |
| Moderator | Pin / unpin, close / reopen comments, remove (with a reason) and restore posts, remove comments — every action logged |
| Owner / admin / moderator | Read the audit log of joins, posts, reactions, RSVPs, moderation, role changes, invite changes and exports |
| Owner / admin | Download the whole community as versioned JSON (`net.saasassin.workspace-export` manifest + 9 typed files) |

## Modules

| Module | State |
|--------|-------|
| Communities (tenants), spaces, visibility, ordering | Done |
| Invite link + email invite + roles (owner/admin/moderator/member) | Done |
| Posts, threads, reactions (deterministic ids), mentions | Done |
| Feed (server-side visibility filtering), search | Done |
| Events + RSVPs | Done |
| Member directory + profiles | Done |
| Notifications inbox (computed from replies/mentions) | Done (in-app only) |
| Moderation (pin, close, remove/restore, comment removal) + audit view | Done |
| Versioned JSON export | Done |
| Courses / lessons / cohorts / certificates | Not started |
| Paid plans, payments, entitlements, refunds | Not started (needs payment-provider credentials; out of scope tonight) |
| Reports from members, appeals, blocked users, rate limits | Not started |
| Email notifications / digests | Not started (no mail credentials tonight) |
| Circle migration import | Not started |

## Key decisions

- **Visibility is enforced on the server, before data leaves.** The workspace endpoint only returns spaces, posts, comments and notifications from spaces the viewer can see; removed posts are redacted for non-moderators; a post in a hidden space answers 404, never 403, so private spaces do not leak their existence.
- **Owners and admins see every space; moderators only moderate spaces they can see.** Announcements spaces are broadcast-only (moderators+ post, members reply).
- **Reactions use a deterministic document id** (`{postId}__{uid}__{type}`) toggled inside a transaction that also updates the post's count, so double-clicks and retries cannot double-count.
- **Invite codes** are 20 random characters, compared in constant time, can be disabled or rotated, and are never included in exports. Joining writes the same membership + user-index shape the shared tenant layer uses and appends `membership.joined_via_invite` to the audit log. A member who was removed cannot rejoin by link.
- **Notifications are computed, not stored** — derived from replies and `@handle` mentions at read time, with only a per-member "read up to" timestamp persisted.
- **No composite indexes.** Every query is a single `where` or a single `orderBy`; the rest is sorted and filtered in memory over tenant-scoped collections.
- Timestamps on community content are ISO strings so ordering and export are trivial; audit events keep the shared server timestamp.

## Known gaps

- Feed and comments read the most recent 300 posts / 500 comments per load; fine for early communities, needs pagination later.
- Removing a member from a community is not in the UI yet (role changes are).
- `@handle` is the email local part; display-name handles would be friendlier.
- Not browser-tested signed-in tonight (no account creation allowed); signed-out landing, sign-in and invite pages were checked for HTTP 200.
