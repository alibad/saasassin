# SaaSassin Creator — status (2026-10-26, round 2)

Open-source Kajabi replacement. Slug `creator`, accent `#ff3d93`.

## What people can do now

| Who | Can now |
|-----|---------|
| Creator | Create a school (tenant), invite teammates by email as admin / member / viewer |
| Creator | Create a course, add modules and lessons, reorder both, write lesson text (markdown-ish), attach a YouTube / Vimeo / Loom video, set a drip delay per lesson, attach a scored quiz, preview any lesson as a learner |
| Creator | Move a course draft → published → draft, or archive / restore it; every transition is checked server-side, confirmed in a dialog and written to the audit log |
| Creator | **Migrate from Kajabi**: paste or upload a Kajabi-style CSV (Product / Category / Post columns) or JSON export, review a preview with column mapping, warnings and errors, then import every course as a draft in one audited batch |
| Creator | **Duplicate** any course as a new draft |
| Creator | Set free enrollment, or store a paid price that is shown honestly as **Payments not connected** (nobody can be charged; paid enrollment is refused with 402) |
| Visitor | Browse a school's **public catalog** at `/apps/creator/s/{tenantId}` and each course landing page at `/apps/creator/c/{tenantId}/{courseSlug}` (published courses only; drafts 404); join the course email list with explicit consent |
| Learner (any Creator account) | Sign in from the landing page, enroll for free, open lessons, watch videos, mark lessons complete / incomplete, take quizzes, see progress, **discuss each lesson** with other learners, and open a printable certificate once every lesson is done |
| Learner | See every course they joined under **My learning** on the Creator home |
| Creator | See learners with per-learner progress, quiz results, completion and access status; the email list; team; audit log |
| Creator | **Course analytics** from real records: enrollments over time, completion rate, per-lesson completion funnel, drop-off lesson, quiz pass rates — each definition shown on screen |
| Creator | **Moderate discussions**: see every lesson thread, hide or restore comments (audited) |
| Owner / admin | **Bulk-enroll** existing accounts into a published course by pasting emails; get back who was enrolled, who already was, who has no account, and which entries were invalid |
| Owner / admin | Revoke a learner's access (progress kept, re-enrollment blocked) and restore it later |
| Owner / admin | Remove a lead when someone withdraws consent (the audit log keeps the fact, not the address) |
| Owner / admin | Download the whole school as one versioned JSON export |

## Modules

| Module | State |
|--------|-------|
| Courses, modules, lessons, reorder, duplicate | Done |
| Draft / published / archived state machine + audit | Done |
| Public landing page + public school catalog (server-checked published state) | Done |
| Free enrollment, bulk enrollment, learner index | Done |
| Lesson player + progress tracking | Done |
| Drip schedule (unlock N days after enrollment, enforced server-side) | Done |
| Quizzes with server-side scoring (answers never sent to learners) | Done |
| Certificates (rendered, printable page) | Done |
| Lesson discussions + moderation | Done |
| Course analytics | Done |
| Kajabi migration import (CSV / JSON, preview + mapping report) | Done |
| Email-list capture on landing pages (consent required, idempotent, removable) | Done |
| Team invites with roles, audit log view, JSON export | Done |
| Access revocation / restore (audited, progress kept) | Done |
| Payments / checkout / refunds / entitlements history | Not started — needs payment-provider credentials (out of scope tonight) |
| Email delivery (onboarding, broadcasts) | Not started — leads are stored and exportable; no provider connected |
| Kajabi customer / offer / subscription import | Not started — content import only |

## Verification

| Check | Result |
|-------|--------|
| `pnpm typecheck`, `pnpm lint` | Clean |
| Unit tests (`tests/creator*.test.ts`): state machine, slugs, progress, drip, quiz scoring, embeds, validation, email-list parsing, export schema, Kajabi mapper, analytics | All pass |
| Firestore emulator golden path (`tests/creator.emulator.spec.ts`) | **13/13 pass** |
| `pnpm build` | Pass |
| curl against a dev server (signed out) | Landing / sign-in / catalog 200 or 404 as expected; learn and certificate redirect to sign-in with a safe `next`; every creator API 401 |

Emulator command (port 8184; `.emulator-creator.json` is a local, uncommitted file — see the round-2 brief for its contents; firebase-tools needs Java 21+):

```bash
pnpm exec firebase emulators:exec --config .emulator-creator.json --only firestore --project demo-saasassin \
  "pnpm exec vitest run --config vitest.emulator.config.mjs tests/creator.emulator.spec.ts"
```

The emulator spec drives the real data layer: school creation, role and cross-tenant denials (404/403), slug uniqueness, curriculum save, paid→free with no stale price, publish rules (empty course 409), public read only when published and never across tenants, catalog, idempotent enrollment, drip lock and unlock, locked-lesson writes rejected, progress, server-side quiz scoring, certificate gate, revoke/restore, leads (hashed ids, removal), Kajabi import, duplication, discussions with hiding, bulk enrollment, audit trail for every mutation, and an export containing every record. It found no bugs in the data layer.

## Key decisions

- **Curriculum is embedded in the course document** (modules → lessons → quiz). One read renders a course, reorder is an array move, and a save is atomic. Firestore's 1 MB document limit caps a course at several hundred long lessons — fine for now.
- **Enrollment id = `{courseId}_{uid}`** so enrolling twice is idempotent, and a learner index at `products/creator/learners/{uid}/enrollments` powers *My learning* without cross-tenant queries.
- **Learners are not tenant members.** Public and learner routes live under `/api/creator/public/...` and check published state plus active enrollment server-side on every call; creator routes always run `requireTenantMember`.
- **Drip and quiz answers are enforced server-side**: locked lessons ship without their body or video; progress, quiz and comment writes for locked lessons are rejected.
- **Progress counts only lessons that still exist**, so deleting a lesson never leaves a learner stuck below 100 %.
- **Kajabi import never writes before confirmation**: the same pure mapper produces the preview and the committed courses; HTML bodies become plain text, non-https video links are dropped, and every change is listed as a warning.
- **Analytics are computed from enrollment records on request** (no stored aggregates that can drift), with the definitions on screen.
- **Bulk enrollment never creates accounts or sends email**; it reports who needs to sign up.
- **Roles**: owner/admin publish, archive, export, invite, bulk-enroll, revoke; member drafts, edits, imports and moderates; viewer reads.
- No composite indexes: every query is a single `where` or a single `orderBy`.

## Export format

`GET /api/creator/tenants/{tenantId}/export` → `{ manifest, files }` where `manifest` is the shared
`net.saasassin.workspace-export@1.0.0` envelope and each file carries its own schema id:
`net.saasassin.creator.{school|courses|enrollments|leads|comments|members|audit}@1.0.0`.

## Known gaps

- Not browser-tested with a signed-in account (no Firebase accounts were created); the data layer is proven on the emulator and signed-out surfaces with curl.
- Public lead capture and comments have no rate limiting beyond validation.
- No pagination beyond 500 leads, 300 moderation comments and the full enrollment list per school.
- A published course with existing learners can still be edited live; there is no versioned curriculum snapshot.
- Kajabi import covers content only (not customers, offers or subscriptions).
