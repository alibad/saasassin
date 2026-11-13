# SaaSassin Performance vs Lattice — positioning and story

**Takeaway:** Don't sell "a cheaper Lattice". Sell **performance reviews you can trust and take with you.** That means no seat price and no minimum, source you can read and run, phases you can preview and undo, permissions you can inspect, and one complete export. Every differentiator below is tied to a feature that exists, or names the slice that makes it true. **Two of the claims everything else rests on — "open source" and "self-host" — are not true yet** (see *Slice 0* and *slice 3* in `parity.md`).

Sources: `research.md` (Lattice facts accessed 2026-11-13) and `parity.md` (our status on `1a31564`).

---

## 1. Positioning

> **For** people teams at companies with 25–250 employees **who** need a fair, well-run review cycle without a $4,000 minimum or a vendor holding their review history, **SaaSassin Performance** is a free, open-source performance-review workspace. **It** runs self, manager, peer and upward reviews with previewed, reversible phases, inspectable permissions and a complete export. **Unlike** Lattice, it can run on your own Firebase project, and every record leaves with you in one versioned file.

Category language: **"open-source performance reviews"** (primary) and "Lattice alternative" (comparative). Avoid "HRIS", "people platform" and "all-in-one".

---

## 2. Who switches, and why

| Who | Trigger moment | What they need to see | Proof in the product |
|---|---|---|---|
| **People lead at a 25–60 person company** | Renewal, or a first quote. Below 34 seats the $4,000 minimum exceeds the per-seat cost for Performance alone (`research.md` §3) | A complete review cycle at no cost | The full golden path: import → template → launch → write → calibrate → release → acknowledge |
| **A Lattice customer affected by the HRIS/payroll shutdown** | They are re-platforming core HR in 2026 and re-evaluating every module at the same time ([T8], [T9]) | Their review history won't be stranded again | Versioned export with checksums; Lattice review-history import (*slice 13*) |
| **Privacy- or sovereignty-minded orgs** (EU, regulated, security-led engineering companies) | Security review, a data-residency question, or an acquisition data request | The data lives in *their* cloud project and the code can be audited | Self-host guide (*slice 3*); the hosted instance runs in Firestore `eur3` (README); tenant-isolation rules tests |
| **Startups running their first formal review cycle** | The first cycle after reaching about 25 people | Sensible defaults that are hard to get wrong | Anonymity threshold, blockers, phase previews, autosave |
| **Engineering-led people teams** | They want reviews wired into their own tools | API keys, signed webhooks, an open schema | Read API, HMAC webhooks with a delivery log, export manifest |

**Who should stay on Lattice for now (say so publicly):** teams that rely on engagement surveys, compensation cycles, SAML SSO, deep HRIS sync, a native mobile app, AI review drafts or Slack-native feedback. See the "Where Lattice is ahead" rows in §6.

---

## 3. Differentiators (each tied to a real feature)

| # | Differentiator | The real feature | Lattice contrast (dated, cited) | Can we say it today? |
|---|---|---|---|---|
| D1 | **No seat price, no minimum** | The hosted workspace has no billing code at all. Sign-up is open at performance.saasassin.net | Performance costs $10/seat/mo, billed annually, with a $4,000 annual minimum [L1] | **Yes**, worded as "no per-seat price, no minimum contract". Not "free forever" (§4) |
| D2 | **Source you can read and change (AGPL-3.0)** | Public repository at github.com/alibad/saasassin | Closed source | **No.** There is no LICENSE file yet. True after *Slice 0* |
| D3 | **Run it on your own Firebase** | Env-driven config (`.env.example`); Firestore rules and indexes in the repo | SaaS only; data deleted 180 days after the contract ends [H25] | **No.** True after *slice 3* (a guide proven on a fresh project) |
| D4 | **Review phases you can preview and undo** | Every phase change shows its effects, blockers and warnings first, moves one phase at a time, and can be reversed without losing submitted work (`src/lib/lattice/state-machine.ts`; Reviews tab) | Per Lattice's help center: ending peer selection auto-approves pending nominations and launches writing [H2]; ending a reviewee early auto-submits drafts [H3] | **Yes** |
| D5 | **Permissions you can inspect before you grant them** | 16 atomic permissions, custom roles, a simulator and "View as role" (`permissions.ts`; Permissions tab) | Lattice's own docs warn some targeted review actions affect everyone in a cycle [H13] | **Yes** for inspecting. "Assign a custom role" becomes true after *slice 1* |
| D6 | **Your data, in and out** | One `net.saasassin.workspace-export` file: 14 product files, each with its own schema, version and sha256 (`src/lib/lattice/export.ts`); read API with scoped keys; HMAC-signed webhooks with an honest delivery log | Per-module CSV exports, analytics as PNG [H9], [H25]; the public API article doesn't mention webhooks [H26] | **Yes**, worded as "every review, goal, feedback item, 1:1 and audit event". Saved views and integration config aren't in it yet (rank 18) |
| D7 | **Built to protect people** | Peer and upward feedback is withheld, not averaged, below a minimum response count (default 3, `assemblePacket`); review answers, feedback text and ratings never enter the audit log; append-only audit trail (Audit tab) | — | **Yes**. Do not compare with Lattice's review anonymity, which isn't publicly documented (`research.md` §8) |

**Next differentiator, not yet claimable:** *evidence-linked reviews*, where every statement in a review can cite the goal, check-in, feedback or 1:1 behind it (*slice 8*). Later comes *evidence-checked AI drafts* that reject any sentence without a citation (LAT-AI-02). This is the direct answer to Lattice's July 2026 AI drafts [L13]. Build it before marketing it.

---

## 4. Claims we must NOT make yet

| Claim | Why not (evidence, 2026-11-13) | Becomes true when |
|---|---|---|
| "Open source", "AGPL-3.0" | No LICENSE file in the repo; `gh repo view` reports no license | *Slice 0* (owner commits the license) |
| Any use of "Lattice" in our product name | The live sign-in title is "Sign in to Lattice Performance" (`src/app/lattice/sign-in/page.tsx`) | *Slice 0* (rename to SaaSassin Performance) |
| "Self-host in N minutes" | No self-host guide; never run on a fresh Firebase project | *Slice 3* (measure N, then say it) |
| "Full Lattice replacement", "feature parity" | 30 have, 18 partial, 71 missing (`parity.md`) | Not planned. Say "for your review cycle" |
| "Complete export" with no qualifier | Saved views, API key metadata and webhook config aren't exported (status "What's left") | Export 1.1.0 (LAT-PLAT-03, rank 18) |
| "Email reminders" | Reminders are in-app Inbox only | *Slice 6* |
| "Evidence-linked reviews" | Not built | *Slice 8* |
| Any AI claim ("AI-drafted reviews", "AI summaries") | Stage 5 hasn't started | LAT-AI-01 and LAT-AI-02 |
| "Import from Lattice" | The CSV importer has never been tested on a real Lattice export | LAT-MIG-01 (header check), *slice 13* (review history) |
| "SSO", "SAML", "SCIM", "HRIS sync", "Slack", "mobile app" | Not built (Google sign-in exists) | See parity ranks 68–72 |
| "SOC 2", "GDPR compliant", "enterprise-grade security" | No attestation or audit has been done | Only after an external audit. Meanwhile, describe what we actually do: tenant isolation, server re-authorization, rules tests |
| "Free forever" | The owner hasn't stated a business model | Owner decision |
| Customer counts, logos, testimonials | None verified | Real, consented customers |
| "Lattice has no webhooks", "Lattice can't undo", "Lattice deletes your data" | We only know what their public docs said on 2026-11-13 | Never as absolutes. Write "Lattice's help center says… (accessed 2026-11-13)" |
| "Safer anonymity than Lattice" | Lattice's minimum for review anonymity isn't documented publicly | Never, unless verified |
| "Save $X vs Lattice" | Discounts vary | Only as dated list-price arithmetic with a source |
| Anything about Lattice "shutting down" | Lattice discontinued HRIS and payroll, not performance | Never imply the core product is ending |
| "Built for 1,000+ employees" | Scope is 25–250, and CSV import is capped at 250 rows (`csv.ts`) | Not planned |

---

## 5. Story video (2:45)

**Format:** a screen recording of the real product, with voice-over and captions. Use seeded **fictional** demo data, for example "Orchard Collective", 40 people, with Ana, Ben, Chen and Dara.
- **Never show Lattice's UI, logo or colors.** Comparison beats are plain text cards that cite Lattice's public documentation with the access date.
- Record after *Slice 0*, *slice 1* and *slice 3* have shipped. Scenes that depend on later slices are marked, along with a fallback.

### Script

**Hook (0:00–0:10)**
VO: "Performance reviews are some of the most sensitive data your company has. Can you see every rule that touches them, and can you take them with you?"

**The problem with closed tools (0:10–0:32)**
VO: "Most review tools are rented. You pay per seat, per module, with an annual minimum. Phase changes can do things you didn't ask for. And when you leave, your history leaves on their schedule, not yours."

**Meet Performance (0:32–0:45)**
VO: "This is SaaSassin Performance. Free, open source, and it runs on our cloud or on your own Firebase project."

**Scene 1 — People (0:45–1:00)**
VO: "Import your org chart from a CSV. You see every row before anything is written. Nobody gets admin rights from a spreadsheet."

**Scene 2 — Permissions (1:00–1:15)**
VO: "Build a role from plain-language permissions. Then look at the workspace through that role before you give it to anyone."

**Scene 3 — A reversible cycle (1:15–1:42)**
VO: "Launch a cycle and you see exactly what will happen first. If reviews are incomplete, the cycle can't move on. It tells you how many, and doesn't quietly submit drafts. Need to go back? Reopen the phase. Nothing anyone wrote is lost."

**Scene 4 — Writing with evidence (1:42–1:57)**
VO: "Reviews save as you type. The subject's goals, check-ins and feedback sit beside the form, so every claim can point to what actually happened."

**Scene 5 — Fair packets (1:57–2:12)**
VO: "Calibrate, then release. Peer feedback is anonymized, and if too few peers responded, it's withheld rather than averaged, because two answers can identify the author. Employees acknowledge, and a packet can be safely reopened with a reason."

**Scene 6 — Trust you can check (2:12–2:27)**
VO: "Every privileged action is in an append-only audit log. Your whole workspace exports as one versioned file with a checksum on every part. And your systems can listen through signed webhooks."

**Comparison beat (2:27–2:37)**
VO: "Same job, different deal: no per-seat price, no minimum, source you can read, data you keep."

**Call to action (2:37–2:45)**
VO: "Start free at performance dot saasassin dot net. Self-host it from GitHub. Or talk to us about moving your next cycle."

### Shot list

| # | Time | Screen / route | Action | On-screen text | Depends on |
|---|---|---|---|---|---|
| 1 | 0:00 | Reports tab → "Download export" | Export downloads; zoom into `manifest` → `sha256` | "Your reviews. Your file." | — |
| 2 | 0:10 | Text card (no Lattice UI) | Three cited lines fade in | "Per-seat, per-module, $4,000 minimum (lattice.com/pricing, 2026-11-13)" · "Ending peer selection auto-approves pending nominations (Lattice help center, 2026-11-13)" · "Data deleted 180 days after contract end (Lattice help center, 2026-11-13)" | — |
| 3 | 0:32 | performance.saasassin.net sign-in | Google sign-up, then create organization | "SaaSassin Performance" | Slice 0 (rename) |
| 4 | 0:45 | People tab | Upload CSV → Preview → warning "role reduced to Employee" → Import | "Preview before anything is written" | — |
| 5 | 1:00 | Permissions tab | Create "Review coordinator" → simulator → "View as role" banner → assign to Ana | "Inspect, then grant" | Slice 1 (assign) |
| 6 | 1:15 | Reviews tab → template and cycle | Set schedule and anonymity threshold 3 → Launch → transition preview dialog (effects list) | "See the effects first" | — |
| 7 | 1:25 | Reviews tab → Advance | Blocked: "N of M assigned reviews are still incomplete" | "Blocked, not auto-submitted" | — |
| 8 | 1:33 | Reviews tab → reopen phase | Reverse transition preview → confirm → drafts intact | "Undo without losing work" | — |
| 9 | 1:42 | Review form | Type → "Saving" → "Autosaved"; evidence panel → cite a feedback item | "Every claim can point to evidence" | Slice 8. **Fallback:** Growth tab goals and feedback, then the Timeline tab |
| 10 | 1:57 | Reviews tab → calibration → release; then as Ana: Overview → My review packets | "Peer 1"; withheld-section explanation; Acknowledge with a comment | "Withheld below 3, never averaged" | — |
| 11 | 2:06 | Calibrator view → packet reopen | Reopen with a reason; history keeps the prior acknowledgement | "Reopen with a reason" | — |
| 12 | 2:12 | Audit tab | Scroll events (role created, cycle transitioned, packet acknowledged) | "Append-only" | — |
| 13 | 2:20 | Reports → API and webhooks panel | Send test → delivery log shows the HTTP status | "Signed. Logged. Honest." | — |
| 14 | 2:27 | Text card, two columns | "Lattice (per its public pages, 2026-11-13)" vs "SaaSassin Performance" — four rows: price, minimum, source, export | — | Slice 0 for the "source" row |
| 15 | 2:37 | End card | URL, GitHub path, "Talk to us" | performance.saasassin.net · github.com/alibad/saasassin · saasassin.net | Slice 3 for "self-host" |

### Short-form cut (40 s)

| Time | Shot | VO / caption |
|---|---|---|
| 0:00 | Shot 7 (blocked transition) | "Your review tool shouldn't submit drafts for you." |
| 0:05 | Shot 8 (reopen, work intact) | "Preview every phase. Undo any phase. Lose nothing." |
| 0:14 | Shot 10 (withheld peer section) | "Too few peer responses? Withheld, not averaged." |
| 0:22 | Shot 5 (view as role) | "See exactly what a role can do before you grant it." |
| 0:29 | Shot 1 (export + sha256) | "Leave with everything, in one file." |
| 0:35 | End card | "SaaSassin Performance. Free and open source. performance.saasassin.net" |

---

## 6. Copy outline: saasassin.net/compare/lattice

> This is a new route on the main site; `src/app` has no `/compare` today. **Publish only after Slice 0.** The "self-host" copy also waits for slice 3. Show "Last verified: <date>" on the page, and re-verify every Lattice fact before each publish.

**Hero**
- **H1:** "The open-source alternative to Lattice for performance reviews"
- **Sub:** "Run self, manager, peer and upward reviews with phases you can preview and undo, and keep every record in one file. No per-seat price. No minimum."
- **CTAs:** primary "Start free" → performance.saasassin.net. Secondary "Self-host it" → GitHub self-host guide. Tertiary "Talk to us about migrating" → the saasassin.net interest form (`src/components/interest-form.tsx`).
- **Proof strip** (each item links to a live screen or doc): Reversible cycles · Permission simulator · Checksummed export · Append-only audit.

**"Built for" band:** people teams at 25–250 employees running reviews, goals, feedback and 1:1s. It is not an HRIS.

**Comparison table.** Lattice cells cite `research.md` sources with the access date. Rows where Lattice is ahead are **kept on purpose**.

| Row | Lattice (public pages, accessed 2026-11-13) | SaaSassin Performance (as of publish date) |
|---|---|---|
| Price | $10/seat/mo Performance; Goals +$8; Grow +$4 [L1] | No per-seat price |
| Minimum contract | $4,000/yr, billed annually [L1] | None |
| Source code | Closed | AGPL-3.0 on GitHub *(after Slice 0)* |
| Where it runs | Lattice's cloud | Our cloud or your Firebase project *(after slice 3)* |
| Review directions | Self, manager, peer, upward [L3] | Self, manager, peer, upward |
| Phase changes | Ending peer selection auto-approves and launches writing [H2] | Previewed, one phase at a time, blocked while work is incomplete, reversible |
| Anonymity | Depends on admin visibility settings [H7] | Peer and upward feedback withheld below a minimum (default 3) |
| Calibration | Groups, facilitators, past ratings, analytics [H14], [L10] — **ahead** | Calibrated rating, private notes, distribution |
| Export | CSV per module; analytics as PNG [H9], [H25] | One versioned file, sha256 on every part |
| After you leave | Data deleted 180 days after the contract ends [H25] | Your file; and if self-hosted, your database |
| API / webhooks | Read API, goal writes; webhooks not mentioned in the API article [H26] | Read API with scoped keys; HMAC-signed webhooks with a delivery log |
| Goals / OKRs | Cascading OKRs, roll-up, Jira/Salesforce [H22], [L1] — **ahead** | Goals with check-ins (key results after slice 12) |
| 1:1s | Recurring, templates, calendar, AI notes [H20], [L14] — **ahead** | Shared agenda and notes (private notes and action items after slice 10) |
| AI | Evidence-based drafts, 1:1 agent, MCP [L13], [L14], [L15] — **ahead** | None yet. Evidence-linked writing planned; AI stays opt-in |
| Engagement surveys, compensation | Yes ($4 / +$6) [L1] | Not offered (by design) |
| SSO / SCIM / HRIS sync | SAML, SCIM, 20+ HRIS [H27], [L11] — **ahead** | Google sign-in; CSV import |
| Mobile | Native app — **ahead** | Responsive web |
| Support | Dedicated customer success in every contract [L1] — **ahead** | Public issues; paid help *(owner decision)* |

**"When Lattice is the better choice"** (short honest list): you need engagement surveys, compensation cycles, SAML or SCIM today, deep HRIS sync, or a native mobile app.

**Migration section:** import your org chart today. Lattice review-history import ships with slice 13; label it "beta" until it has been tested on real exports.

**FAQ** (FAQPage schema)
1. *Is it really free? How will you sustain it?* Owner to answer. Do not improvise.
2. *Are you affiliated with Lattice?* No. Lattice is a trademark of its owner. We compare against public documentation and date every fact.
3. *Can I self-host?* Yes, on your own Firebase project *(after slice 3)*. Link the guide.
4. *What's in the export?* List the 14 files and the manifest. Say plainly what isn't included yet.
5. *What does AGPL-3.0 mean for my company?* Using it internally is fine. If you modify it and offer it to others over a network, you share the changes. *(After Slice 0. Have counsel review the wording.)*
6. *Does it have AI?* Not yet. When it does, it will be off by default, and every generated sentence will cite its source.
7. *Is it secure?* Describe tenant isolation, server re-authorization, rules tests and the audit log. Do not claim certifications.
8. *Can I import from Lattice?* Org chart yes; review history in beta *(after slice 13)*.
9. *Do employees need accounts?* Imported employees claim their record when they sign in with their verified work email.

**Footer:** "Lattice is a trademark of its respective owner. SaaSassin is not affiliated with or endorsed by Lattice. Comparisons reflect Lattice's public pages as of <date>. Spot something out of date? Tell us." (link to a GitHub issue template).

---

## 7. SEO brief

**Approach.** One honest comparison page plus a product landing page and supporting articles, all interlinked with the existing decision record at `/targets/lattice/research`. The most recent commit (`1a31564`) already gives every public page a canonical URL. **Search volumes were not measured**; validate in a keyword tool before committing editorial time.

| Keyword | Intent | Target page | Priority |
|---|---|---|---|
| lattice alternative / lattice alternatives | Commercial investigation | /compare/lattice | P1 |
| open source lattice alternative | Commercial, high fit | /compare/lattice | P1 |
| lattice competitors | Commercial investigation | /compare/lattice, plus article 1 | P1 |
| free performance review software | Commercial | Performance landing page (new; the subdomain root is a sign-in screen today) | P1 |
| open source performance management software | Commercial | Performance landing page | P1 |
| self-hosted performance management / self hosted performance review software | Commercial, high fit | Self-host guide page, plus article 5 | P1 *(after slice 3)* |
| lattice pricing | Informational → commercial | Article 1 | P2 |
| export performance review data / lattice data export | Informational | Article 2 | P2 |
| performance review calibration | Informational | Article 3 | P2 |
| anonymous 360 feedback | Informational | Article 4 | P3 |
| performance review software for small business / startups | Commercial | Landing page | P2 |
| 360 review template / peer review questions | Informational | Starter templates page (after LAT-REV-02) | P3 |

**Titles and meta descriptions** (title ≤ 60 characters, meta ≤ 155)

| Page | Title | Meta description |
|---|---|---|
| /compare/lattice | Open-Source Lattice Alternative for Reviews \| SaaSassin | Run 360 reviews, calibration and 1:1s with no seat price or minimum. Preview and undo every phase, and export everything in one file. Compared honestly. |
| Performance landing | Free, Open-Source Performance Review Software \| SaaSassin | Self, manager, peer and upward reviews with reversible phases, inspectable permissions, an audit trail and a complete export. For teams of 25–250. |
| Self-host guide | Self-Hosted Performance Reviews on Firebase \| SaaSassin | Run SaaSassin Performance on your own Firebase project: your data, your region, your rules. Step-by-step setup, verified on a fresh project. |

**Five supporting articles**
1. **"Lattice pricing in 2026: what 25, 50 and 100 people actually pay at list price."** Built from dated list-price arithmetic with the minimum explained; links to /compare. *(Re-verify prices on the day of publishing.)*
2. **"What happens to your performance-review history when you switch tools."** Export formats, retention windows, and a portability checklist; shows our manifest.
3. **"Reversible review cycles: why ending a phase should never quietly submit drafts."** Our state-machine philosophy, with the help-center contrast cited and dated.
4. **"Anonymous peer feedback: why we withhold instead of averaging below three responses."** The maths of re-identification; no claims about competitors.
5. **"Self-host your performance reviews on Firebase in an afternoon."** A tutorial version of the slice 3 guide, with the measured setup time.

**Technical notes**
- Add `SoftwareApplication` schema (offers price 0, category BusinessApplication), plus `FAQPage` on the compare page and `BreadcrumbList`.
- The OG image is our own product screenshot with no Lattice marks.
- Show a visible "Last verified" date and add the compare page to `sitemap.ts`.
- Internal links: compare ↔ landing ↔ `/targets/lattice/research` ↔ `/apps`. Articles link to compare and landing.
- Use "Lattice" only to name the competitor (nominative use): no logo, no colors, no lookalike layout.
