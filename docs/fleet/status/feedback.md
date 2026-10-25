# SaaSassin Feedback — status (2026-10-26)

Open-source Canny replacement, Fider-compatible. Owner lifted the "wait for Fider maintainers" gate for tonight; data shapes stay Fider-shaped and the export maps to Fider's tables so upstream remains possible.

## What users can do now

| Who | Can now |
|---|---|
| Team owner | Create a workspace, create public or private boards, share a board link |
| Anyone (signed out) | Read a public board at `/apps/feedback/b/<tenantId>/<boardSlug>`, search, filter by status/tag, sort by votes/newest/most discussed, open a post and read its discussion and staff response |
| Anyone (signed out) | Read the public portal at `/apps/feedback/b/<tenantId>`: roadmap columns (planned / started / completed), board list, and changelog |
| Signed-in Feedback user | Post an idea (auto-votes, like Fider), vote once per post and take the vote back, comment. Sign-in returns them to the board they came from |
| Owner / admin | Change status with a public note (decline needs a note), merge a duplicate into a canonical post (votes move, people who voted on both count once), tag posts, hide spam posts/comments with a recorded reason and restore them, see each post's voter list, publish changelog entries linked only to completed posts |
| Member | Read the workspace and triage with tags; viewer reads only |
| Owner / admin | Invite teammates by email with a role, read the audit log of every mutation, download a full versioned JSON export or the Fider mapping alone, import a Canny posts CSV with a preview of mapping and problems before committing |

## Modules

| Module | State |
|---|---|
| Golden workflow (workspace → board → public read → post/vote/comment → status/merge/tag → roadmap → changelog → export) | Done |
| Members + roles, audit view, versioned export (`buildExportManifest` + every collection via `toPortable`) | Done |
| Fider mapping (`users`, `posts`, `post_votes`, `comments`, `tags`, `post_tags`, Fider status codes, one Fider instance per board) | Done, tested |
| Moderation with audit, voter list, board sort/filter/search | Done |
| Canny CSV import mapper (pure, tested) + preview + idempotent commit | Done |
| Subscriptions / voter notifications, webhooks, SSO, initiatives/releases, internal notes, owners/segments | Not started |

## Key decisions

- **Vote integrity**: vote document id is `${postId}__${uid}`; add/remove and the counter change happen in one Firestore transaction, so retries and double-clicks cannot double count.
- **Status machine** (`src/lib/feedback/model.ts`): `duplicate` is only reachable by merge (so votes always move); merged posts stay merged; declined requires a note; closed posts (completed/declined/duplicate) accept no new votes but existing votes can be removed.
- **Merge math** (`planVoteMerge`): votes move only for voters not already on the canonical post; canonical count = distinct voters + imported Canny totals.
- **Public reads** go through server code that only serves boards with `isPublic`, hides moderated posts/comments and team-only tags, and never exposes voter identities. Voter lists are owner/admin only.
- **Canny import**: deterministic post ids from the Canny source key make re-imports idempotent; imported boards/tags start private; Canny's CSV has vote totals without voter identities, so totals are stored as `importedVotes` with provenance (source URL, line, original status).
- **Fider**: Fider is one board per site, so each board exports as one Fider instance; cross-board duplicate links are reported in `skipped` rather than silently dropped.
- No composite indexes: every query is a single `where` or single `orderBy`; sorting/filtering happens in memory on tenant-scoped collections.

## Known gaps

- No voter notifications or email (no mail credentials in scope tonight); the changelog is public but not pushed to subscribers.
- Imported Canny comments and per-voter identities are not mapped (Canny's posts CSV does not contain them).
- Unmerge is not supported from the UI (merge is confirmed explicitly instead).
- Not browser-tested signed-in (no Firebase accounts were created per the ground rules); verified by typecheck, lint, unit tests, build and signed-out page/API requests.
