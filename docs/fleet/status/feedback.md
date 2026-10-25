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
| Poster | Sees similar existing ideas while typing a title, so they can vote instead of filing a duplicate |
| Owner / admin | Merge picker lists likely duplicates first; edit a post's wording (previous text kept in the audit log); add team-only internal notes (members can too) that never reach public pages or the Fider mapping |
| Anyone | Roadmap and changelog items deep-link straight to the post (`?post=<id>` opens it on the board) |
| Owner / admin | Unmerge a merged post: its previous status returns, moved votes come back (unless the voter removed them since), voters who had voted on both get their vote back; audited |
| Owner / admin / member | Assign a post owner from the team; filter the board by owner |
| Owner / admin | Record a voter's company and customer segment (per workspace) from the voter list; filter and rank posts by votes from a segment, see which companies want each post |
| Owner / admin | Group roadmap items into initiatives (themes) or releases (target dates); the public roadmap shows each with shipped progress |
| Owner / admin | Add signed outbound webhooks (HTTPS only, internal hosts refused) for `post.created` and `status.changed`, see the signing secret once, send a test, pause/resume, and read a delivery log with honest failures |
| Owner / admin | Invite teammates by email with a role, read the audit log of every mutation, download a full versioned JSON export or the Fider mapping alone, import a Canny posts CSV with a preview of mapping and problems before committing |

## Modules

| Module | State |
|---|---|
| Golden workflow (workspace → board → public read → post/vote/comment → status/merge/tag → roadmap → changelog → export) | Done |
| Members + roles, audit view, versioned export (`buildExportManifest` + every collection via `toPortable`) | Done |
| Fider mapping (`users`, `posts`, `post_votes`, `comments`, `tags`, `post_tags`, Fider status codes, one Fider instance per board) | Done, tested |
| Moderation with audit, voter list, board sort/filter/search | Done |
| Canny CSV import mapper (pure, tested) + preview + idempotent commit | Done |
| Duplicate detection (title similarity), internal notes, staff edits, post deep links | Done (similarity tested) |
| Subscriptions / voter notifications | Honest "not connected" state shown on status changes; no mail delivery |
| Unmerge (exact reversal from a stored merge record) | Done, unit + emulator tested |
| Owners/assignees, voter profiles with company/segment, segment filter and ranking | Done, tested |
| Initiatives/releases grouping the roadmap with progress | Done, tested |
| Signed webhooks (HMAC-SHA256 `X-SaaSassin-Signature: t=..,v1=..`), delivery log, test send | Done, tested; no automatic retries |
| SSO, voter email notifications | Not started (need credentials) |

## Verified against a real Firestore (emulator)

`tests/feedback.emulator.spec.ts` drives the real data layer and shared platform end to end: role denials (403/404), tenant isolation, public reads of private boards denied, transactional vote toggles including two concurrent toggles from one user (count always equals vote docs, at most one vote per person), merge math, unmerge and re-merge, moderation, status machine, owners/initiatives/segments, changelog, idempotent Canny import, signed webhook delivery with a failing endpoint, audit events, and a complete export (secrets redacted) with the Fider mapping.

```
# .emulator-feedback.json (uncommitted): firestore port 8183, hub 8283, logging 8383, ui disabled, singleProjectMode
# firebase-tools needs JDK 21+: JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home
pnpm exec firebase emulators:exec --config .emulator-feedback.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/feedback.emulator.spec.ts"
```

Result 2026-10-26 01:14: 14/14 passed. It found no data-layer bugs: every assertion passed on the first run.

## Key decisions

- **Vote integrity**: vote document id is `${postId}__${uid}`; add/remove and the counter change happen in one Firestore transaction, so retries and double-clicks cannot double count.
- **Status machine** (`src/lib/feedback/model.ts`): `duplicate` is only reachable by merge (so votes always move); merged posts stay merged; declined requires a note; closed posts (completed/declined/duplicate) accept no new votes but existing votes can be removed.
- **Merge math** (`planVoteMerge`): votes move only for voters not already on the canonical post; canonical count = distinct voters + imported Canny totals.
- **Public reads** go through server code that only serves boards with `isPublic`, hides moderated posts/comments and team-only tags, and never exposes voter identities. Voter lists are owner/admin only.
- **Canny import**: deterministic post ids from the Canny source key make re-imports idempotent; imported boards/tags start private; Canny's CSV has vote totals without voter identities, so totals are stored as `importedVotes` with provenance (source URL, line, original status).
- **Fider**: Fider is one board per site, so each board exports as one Fider instance; cross-board duplicate links are reported in `skipped` rather than silently dropped.
- **Unmerge** relies on a `mergeRecord` written at merge time (moved voters, overlapping voters, previous status, imported totals). Merges made before this record existed are reported as not automatically reversible.
- **Segments live on the tenant**, not on the global user: `profiles/{uid}` under the workspace, set by the team, so one person can be "Enterprise / Acme" in one workspace and unknown in another.
- **Webhooks never break the product**: dispatch runs after the write succeeds, never throws, uses a 5s timeout and `redirect: "manual"`, and records every attempt. Secrets are stored server-side only and redacted from exports.
- No composite indexes: every query is a single `where` or single `orderBy`; sorting/filtering happens in memory on tenant-scoped collections.

## Known gaps

- No voter notifications or email (no mail credentials in scope tonight); the changelog is public but not pushed to subscribers.
- Imported Canny comments and per-voter identities are not mapped (Canny's posts CSV does not contain them).
- Webhooks: no automatic retries/backoff yet; the SSRF guard checks the hostname and does not resolve DNS, so a public name pointing to a private IP is not caught.
- Not browser-tested signed-in (no Firebase accounts were created per the ground rules); verified by typecheck, lint, unit tests, the Firestore emulator spec, build and signed-out page/API requests.
