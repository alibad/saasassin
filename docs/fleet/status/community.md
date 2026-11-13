# SaaSassin Community — status

_Last updated: 2026-11-13 (signed-in experience); round 2 2026-11-06_

Open-source Circle replacement at `/apps/community` (`community.saasassin.net`). Brand: `src/brands/community` (Bricolage Grotesque / Inter, grape + rose, 18px radius).

## Signed-in experience (2026-11-13)

- **Shell** (`src/components/community/shell.tsx`): community switcher (shared `WorkspaceSwitcher`, noun "community"), Home · Events · Members · Courses · Membership · Inbox, the spaces list, and for staff Moderation · People & invites · Settings. Top bar: post search, New post, appearance, and the shared `AccountMenu` with the person's photo. The community and page live in the URL (`?workspace=…&view=…&space=…`; the older `?c=` still works), so invitations and join links land in the right place.
- **Feed** with photo, name, @handle and role on every post, a composer prompt, reactions, saved posts, and a right rail (next events, members, your profile). Threads, events (with the photos of who's going and the check-in roster), the member directory, the inbox, reports, appeals and the activity log all show photos.
- **Photos without leaking emails**: `getWorkspace` joins each member's account photo (`photoURL`, uploaded or from their sign-in provider) onto the member list; threads add `goingPeople` (uid + name) for RSVPs; notifications carry `actorUid`. Uploaded photos are served by the shared avatar route only to people who share a community. Members still never receive anyone else's email.

### People and invitations: how members and staff fit together

Members and staff are the same tenant memberships, so there is one people page for owners and admins (**People & invites**):

1. **Invite link for members** (the community's own join link, `/join/[tenantId]/[inviteCode]`): anyone with it joins as a member; switch it off or replace it at any time. This stays the way most people join.
2. **The shared team panel** (`TeamPanel`) for everyone in the community with their role: invite by email (also people without an account; they get a 14-day link and see it in their account menu once their email is verified), change roles, remove, leave and transfer ownership. Team config keeps member emails visible to owners and admins only (`memberEmails: "privileged"`).
3. **Imported from Circle, not joined yet**: pending Circle invites, as before.

Everyone else uses the member directory (photos, handles, headlines, no emails); the account menu's Team item opens it for members. Differences to know:
- Role changes and removals made on the team panel follow the shared team rules: admins can change other admins' roles (with a fresh sign-in), only owners change owners. The community's own `member.role` / `member.remove` actions (older API) keep their stricter "only the owner appoints admins" rule.
- Someone who **leaves** from the team panel can come back with the invite link; someone a manager **removed** (from either place) cannot (`joinWithInvite` checks `removedReason`).
- Accepting an email invitation does not claim imported Circle posts; joining with the invite link still does.
- **Demo data**: `scripts/seed-demo-community.mjs` seeds the fictional Riverside Makers into local emulators only (same safety gate as Creator's); photos are AI-generated portraits of no real person in `scripts/demo-assets/riverside-faces`. Sign in as `marisol@riverside-makers.example` (owner), `priya@…` (moderator) or `zara@…` (member).

## What people can do now

| Who | Can now |
|-----|---------|
| Owner | Create a community, add discussion / announcements / events spaces, make a space private to a hand-picked member list **or to whole cohorts**, reorder spaces |
| Owner / admin | Share an invite link, switch it off, or replace it (old links stop working); add an existing account by email as member / moderator / admin; change roles; remove members (they cannot rejoin by link) |
| Owner / admin | Create **and edit** membership plans that unlock private spaces, grant and revoke them by hand, **archive a plan and choose explicitly whether current holders keep access or lose it**, unarchive, and read the immutable access history |
| Owner / admin | **Migrate from Circle**: upload the members and/or posts CSV, read a preview and mapping report (what will be invited, imported, matched, created, skipped and why), then import. Members become pending invites — no accounts are created, nobody is emailed. Re-running the same files imports nothing twice |
| Owner / admin | **Group members into cohorts** with start dates; open private spaces to cohorts; **drip course lessons** N days after each member's cohort start |
| Owner / admin | **Set the posting limit** (posts + replies per member per 10 minutes) |
| Invitee | Open `/apps/community/join/[tenantId]/[inviteCode]`, sign in, join. **If they were imported from Circle with that email, their profile is pre-filled and their imported posts become theirs** |
| Member | **Choose a unique @handle** (validated, changeable, audited); read a feed **that loads page by page with "Load more"**; post, reply (threads also page), react (one each of Like / Celebrate / Insightful), save, search, edit a profile, browse the directory — **and never see another member's email anywhere** |
| Member | **Mute** a member (their posts, replies and notifications disappear for you) or **block** them (also stops them replying to your posts or mentioning you). Private: the other member is not told |
| Member | RSVP to events and add them to a calendar (`.ics`); take courses (lessons unlock on the cohort schedule), tick lessons off, earn a certificate |
| Member | In-app inbox of replies and @mentions; report posts; appeal a removal once per removal |
| Moderator | Pin / unpin, close / reopen comments, remove (with a reason) and restore posts, remove comments, work the reports queue and the appeals queue (never their own appeal), check members in at events. **Exempt from the posting limit; cannot be stopped from replying by a block.** Audit log shows public names, not emails |
| Owner / admin | Download the whole community as versioned JSON (`net.saasassin.workspace-export` manifest + 23 typed files) |

## Proof against a real Firestore

`tests/community.emulator.spec.ts` drives the real data layer (the same functions every route calls) through the whole golden workflow with fake owner / moderator / member / outsider / rival-tenant users: spaces (open, private, announcements, events), invite join with disabled and rotated codes and a removed member refused, posts and threads, one reaction per member per type (including concurrent double-clicks), feed visibility (private posts 404), moderation (pin, close, remove/restore with reasons, reports queue, appeals with the own-appeal rule), RSVPs and check-ins, plans unlocking private spaces with replayable entitlements, courses and certificates, handles and email privacy, pagination (feed, space, search, saved, threads, legacy back-fill), mute/block and the rate limit, plan edit/archive, the Circle import, cohorts and drip, role and cross-tenant denials, an audit event for every mutation, and an export whose per-file counts equal the stored collections.

```bash
# .emulator-community.json (uncommitted): firestore 8187, hub 8287, logging 8387, ui off, singleProjectMode
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:exec --config .emulator-community.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/community.emulator.spec.ts"
```

Result (2026-11-06): **18 / 18 passed** (~7 s). Unit tests: `tests/community-model.test.ts`, `tests/community-round2.test.ts`, `tests/community-circle.test.ts` (55 tests).

Real bugs the emulator run and the round-2 privacy pass found and fixed:

- Marking notifications read wrote no audit event.
- Moderators (not admins) saw every actor's email in the audit log.
- Author names, RSVP names, the check-in roster, report and appeal names, and the directory fell back to the **email local part** whenever a display name was missing; `@handle` itself was the email local part.
- Mentions matched inside dotted names and emails (`@ada.lovelace` mentioned `@ada`).
- The workspace read only the latest 300 posts / 500 comments, so older content, notifications and removal notices silently disappeared.

## Modules

| Module | State |
|--------|-------|
| Communities, spaces, visibility (members / list / plan / cohort), ordering | Done |
| Invite link + email invite + roles + member removal | Done |
| Member-chosen handles, mentions by handle, no email exposure | Done (round 2) |
| Posts, threads, reactions, bookmarks | Done |
| Feed / space / saved / search with cursor pagination; thread pagination | Done (round 2) |
| Mute / block, per-member posting rate limit with safety audit | Done (round 2) |
| Events, RSVPs, `.ics`, attendance check-in | Done |
| Notifications inbox (computed, uncapped reads) | Done (in-app only) |
| Moderation: pin, close, remove/restore, reports, appeals, audit | Done |
| Plans: create, edit, archive (keep / revoke), unarchive; entitlements + immutable history | Done (round 2) |
| Circle migration (members → pending invites, posts → spaces), preview + report, idempotent, claim on join | Done (round 2) |
| Cohorts, cohort-restricted spaces, course drip by cohort start | Done (round 2) |
| Courses, lessons, progress, certificates | Done |
| Versioned JSON export (23 files) | Done |
| Checkout / payments / refunds | Honest "payments not connected" — needs payment-provider credentials |
| Email notifications / digests | Not started — needs mail credentials |
| Lesson discussions, event replays, analytics, webhooks, API | Not started |

## Key decisions

- **Visibility is enforced on the server before data leaves**, now including cohorts and mute/block. Private posts answer 404, never 403.
- **Handles**: `handles/{handle}` claim docs written in a transaction with the profile and the audit event, so two members can never hold one handle. 3–30 chars, `[a-z0-9_-]`, no doubled separators, reserved words blocked. Members without a handle cannot be mentioned until they pick one (a suggestion from their name, never their email, is offered). Releasing a handle frees it immediately.
- **Emails** are returned only to owners and admins (role table, pending invites, the export, the full audit log). Moderators are members for this purpose.
- **Pagination**: posts page newest-first by `createdAt`, ties by document id (Firestore's own `__name__` order); the cursor is the last *scanned* post, so filtered-out posts are never re-read and pages never overlap. A page scans at most 1,000 posts and returns a cursor if it runs out, so a huge private space cannot stall the feed. Threads page oldest-first on a single `threadKey` field (`postId__createdAt__commentId`) with a range query — no composite index; comments written before round 2 are back-filled once per post. Search ranks matches among the 2,000 most recent visible posts (stated in the UI).
- **Mute vs block**: mute hides content and notifications; block additionally refuses the blocked member's replies on your posts and drops their mentions of you. Moderators are never stopped, so moderation keeps working.
- **Rate limit**: sliding window stored per member, checked and written in the same transaction as the post/comment so concurrent requests cannot slip past. Moderators/admins exempt. The first refusal per window is audited (`safety.rate_limited`), not every attempt.
- **Plan archive** requires an explicit `keep` / `revoke` choice. `revoke` writes ordinary `revoked` entitlement events (`source: plan_archived`), so `replayEntitlements` still rebuilds access exactly; `spaceGrantsFor` also ignores archived plans set to revoke as a second guard. Unarchive never restores revoked access by itself.
- **Circle import** runs the same pure mapper for preview and commit against fresh state. Deterministic ids (post content hash, invite = email hash) make re-runs no-ops. Unmatched spaces are created **private** so imported content is reviewed before members see it. Posts by not-yet-joined people get a hashed placeholder author (never their email) that is re-pointed when they join with that email.
- **Drip**: a lesson's `unlockDay` counts from the member's earliest cohort start; day 0 is always open; managers see everything; locked lessons travel without their body and completing one is refused server-side.
- **No composite indexes.** Every query is a single `where`, a single `orderBy`, or a range on the one field it orders by.

## Known gaps

- The inbox reads every reply to every post the member wrote (chunked `in` queries). Fine for real communities; a very prolific author would want a stored `postAuthorUid` on comments.
- The plan-archive revocation loop commits in chunks of 150 holders; a crash mid-way leaves the plan unarchived with some holders revoked (re-running finishes the job, nothing is duplicated).
- Circle import is CSV-only (no Circle API), one run up to 5,000 members / 2,000 posts; comments, reactions and DMs from Circle are not imported.
- No email is sent to pending invitees (no mail credentials); owners share the invite link themselves.
- Signed-in flows were verified by the emulator spec, unit tests, typecheck, lint and a production build — not by a signed-in browser run.
