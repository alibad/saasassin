# SaaSassin Creator — status (2026-10-26)

Open-source Kajabi replacement. Slug `creator`, accent `#ff3d93`.

## What people can do now

| Who | Can now |
|-----|---------|
| Creator | Create a school (tenant), invite teammates by email as admin / member / viewer |
| Creator | Create a course, add modules and lessons, reorder both, write lesson text (markdown-ish), attach a YouTube / Vimeo / Loom video, set a drip delay per lesson, attach a scored quiz |
| Creator | Move a course draft → published → draft, or archive / restore it; every transition is checked server-side, confirmed in a dialog and written to the audit log |
| Creator | Set free enrollment, or store a paid price that is shown honestly as **Payments not connected** (nobody can be charged; paid enrollment is refused with 402) |
| Visitor | Open the public landing page `/apps/creator/c/{tenantId}/{courseSlug}` (published courses only; drafts 404) and join the course email list with explicit consent |
| Learner (any Creator account) | Sign in from the landing page, enroll for free, open lessons, watch videos, mark lessons complete / incomplete, take quizzes, see progress, and open a printable certificate once every lesson is done |
| Learner | See every course they joined under **My learning** on the Creator home |
| Creator | See learners, per-learner progress (completed ÷ current lessons), quiz pass counts, completion dates, the email list, team, and the audit log |
| Owner / admin | Download the whole school as one versioned JSON export |
| Owner / admin | Revoke a learner's access (progress kept, re-enrollment blocked) and restore it later |
| Owner / admin | Remove a lead when someone withdraws consent (the audit log keeps the fact, not the address) |
| Editor | Preview any lesson exactly as a learner will see it, including whether its video can be embedded |

## Modules

| Module | State |
|--------|-------|
| Courses, modules, lessons, reorder | Done |
| Draft / published / archived state machine + audit | Done |
| Public landing page (server-checked published state) | Done |
| Free enrollment + learner index | Done |
| Lesson player + progress tracking | Done |
| Drip schedule (unlock N days after enrollment, enforced server-side) | Done |
| Quizzes with server-side scoring (answers never sent to learners) | Done |
| Certificates (rendered, printable page) | Done |
| Email-list capture on landing pages (consent required, idempotent) | Done |
| Team invites with roles, audit log view, JSON export | Done |
| Access revocation / restore (audited, progress kept) | Done |
| Lead removal on consent withdrawal | Done |
| Payments / checkout / refunds / entitlements history | Not started — needs payment-provider credentials (out of scope tonight) |
| Email delivery (onboarding, broadcasts) | Not started — leads are stored and exportable; no provider connected |
| Kajabi migration import | Not started |

## Key decisions

- **Curriculum is embedded in the course document** (modules → lessons → quiz). One read renders a course, reorder is an array move, and a save is atomic. Firestore's 1 MB document limit caps a course at roughly several hundred long lessons — fine for now, revisit if a creator hits it.
- **Enrollment id = `{courseId}_{uid}`** so enrolling twice is idempotent, and a learner index at `products/creator/learners/{uid}/enrollments` powers *My learning* without cross-tenant queries.
- **Learners are not tenant members.** Public and learner routes live under `/api/creator/public/...` and check published state plus enrollment server-side on every call; creator routes always run `requireTenantMember`.
- **Drip and quiz answers are enforced server-side**: locked lessons ship without their body or video, and progress/quiz writes for locked lessons are rejected.
- **Progress counts only lessons that still exist**, so deleting a lesson never leaves a learner stuck below 100 %.
- **Roles**: owner/admin publish, archive, export and invite; member drafts and edits; viewer reads.
- No composite indexes: every query is a single `where` or a single `orderBy`.

## Export format

`GET /api/creator/tenants/{tenantId}/export` → `{ manifest, files }` where `manifest` is the shared
`net.saasassin.workspace-export@1.0.0` envelope and each file carries its own schema id:
`net.saasassin.creator.{school|courses|enrollments|leads|members|audit}@1.0.0`.

## Known gaps

- Not browser-tested with a signed-in account tonight (no Firebase accounts were created). Verified: typecheck, lint, 28 unit tests (state machine, slugs, progress, drip, quiz scoring, embeds, validation, export schema), `pnpm build`, and curl against a dev server — signed-out landing 200, sign-in 200, unknown course page 404, learn/certificate redirect to sign-in with a safe `next`, every creator API 401 when signed out, lead capture rejects missing consent.
- Public lead capture has no rate limiting beyond consent validation and idempotent ids.
- No pagination on learners / leads beyond 500 leads and the full enrollment list per school.
- A published course with existing learners can still be edited live; there is no versioned curriculum snapshot.
