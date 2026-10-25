# SaaSassin Research — status (2026-10-26, round 2)

Open-source Dovetail replacement at `/apps/research` (research.saasassin.net).

## Proven against a real Firestore (emulator)

`tests/research.emulator.spec.ts` drives the real server data layer and the shared tenant platform through the whole golden workflow: 10 tests, all passing. It refuses to run unless `FIRESTORE_EMULATOR_HOST` is set.

```
# .emulator-research.json (uncommitted): firestore 8181, hub 8281, logging 8381, ui off, singleProjectMode
JENV_VERSION=23.0.1 pnpm exec firebase emulators:exec --config .emulator-research.json --only firestore \
  --project demo-saasassin "pnpm exec vitest run --config vitest.emulator.config.mjs tests/research.emulator.spec.ts"
# → Test Files 1 passed · Tests 10 passed
```

| Area | What the spec proves |
|------|----------------------|
| Golden workflow | Workspace → project → interview with consent metadata → corrected segment → highlight → insight → search → redaction → export, all read back from Firestore |
| Transcript size limits | Over 400k characters is rejected; 3-byte text under the character cap but over the 900 KB document budget is rejected; empty input is rejected (all 400) |
| Highlight span re-validation | Out-of-range, whitespace-only, unknown segment and unknown source all fail server-side (400/404). Highlights re-anchor to the same words after a correction |
| Viewer 403s | Viewers can read and search; every write throws 403. A researcher cannot delete or place holds (403) |
| Redaction | Text is replaced, overlapping highlights are rewritten, the stored original is dropped, and the audit event keeps the reason and length but never the words |
| Cross-tenant isolation | Non-member gets 404. A member of another tenant cannot load, search or version a project from this tenant (404), and their own search never returns this tenant's text |
| Export | The workspace export holds every source, highlight, insight, theme, the evidence chain, members and audit, and survives a JSON round-trip |
| Legal holds / retention | Holds block delete and redact (409, and the blocked attempt is audited). A dry run deletes nothing. Apply deletes only expired sources that are not held |
| Folders | Restricted-folder sources are hidden from unlisted members in reads, search, project export, insight evidence, versions, reports and the audit log. Editing an insight keeps evidence the editor cannot see |
| Versions / reports | Each edit makes v1, v2…; reports render per reader's access |

No app bugs surfaced on the first emulator run. The spec's own setup needed one fix.

## What users can do

| Capability | Status |
|---|---|
| Workspace, invites (admin / researcher / viewer), projects, audit log | ✅ |
| Add interview: upload/paste `.vtt` / `.srt` / `.txt` with live preview, participant and consent (status, captured, retention) | ✅ |
| Transcript as speaker + timestamp segments; correct text and speaker; rename speaker everywhere | ✅ |
| Select text to create a tagged highlight (snaps to words, validated server-side); re-anchors after correction | ✅ |
| Insights must cite evidence; backlinks jump to and mark the exact span; themes group insights | ✅ |
| Tag frequency, rename/merge tags, edit highlight tags/notes | ✅ |
| Project search (server-side, membership- and folder-aware, ranked, deep-linked) | ✅ |
| Redaction with audit; source deletion (owner/admin) with reason | ✅ |
| **New:** legal holds. Place or release with a reason; while held, delete, redact and retention runs are blocked and the attempt is audited | ✅ |
| **New:** retention run. Admins preview a dry run, then apply. It deletes expired or consent-withdrawn sources that are not held, with one audit event per deletion plus a summary | ✅ |
| **New:** folders with access. Restricted folders are visible only to listed members, owners and admins, everywhere: project view, search, project export, insight evidence (with a "N restricted links" notice), versions, reports, retention queue and audit log. Workspace export is limited to owners and admins, who see everything | ✅ |
| **New:** insight version history. Every create/edit is an immutable version (`insightVersions/{id}_vN`) with a word-level diff view, plus evidence added/removed and theme changes | ✅ |
| **New:** reports. Pick insights in order and add a summary; a read-only page at `/apps/research/reports/{tenant}/{project}/{report}` shows each insight with its evidence quotes. Only workspace members can open it; non-members see a "not available" page | ✅ |
| Dovetail CSV/JSON import with mapping preview and report | ✅ |
| Versioned project export and workspace export | ✅ |

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` (114 tests, 27 of them research unit tests) and `pnpm build` all pass. The emulator spec passes as shown above.

## Key decisions

- **One read path per person:** `loadProjectSnapshot(tenant, project, viewer)` applies folder access. Search, export, reports and versions all go through it, so a new surface can't skip the filter.
- **Holds return 409, not 403**, and the blocked attempt is itself an audit event.
- **Workspace export is owner/admin only**, so it is always complete. Members export individual projects, filtered to what they can see, with a `restrictedSourcesOmitted` count.
- **Reports are live views** over insights, not snapshots. Corrections, redactions and folder restrictions apply to them automatically. Version history covers point-in-time changes.

## Remaining gaps

- Audio/video upload, transcription and clips need Storage and a provider (the UI shows an honest "not connected" notice).
- Retention runs are manual (admin-triggered); there is no scheduler.
- Not built: view-as-role, canvases, review/approval, semantic search, API/webhooks, AI assistance.
- No research-specific Firestore rules tests; `firestore.rules` is outside this agent's ownership, and the shared deny-all on `products/**` applies.
- Reports are visible to every workspace member; there is no per-report sharing list, and no public links by design.
