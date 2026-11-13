# Story video: SaaSassin Performance vs Lattice — upload kit (draft)

> **Draft only. Nothing has been uploaded or posted.** Every upload and post is the owner's call.
> Re-verify every Lattice fact on the day you publish; all were accessed on 2026-11-13.

| | |
|---|---|
| Status | Draft, 2026-11-13 |
| Story and claims rules | `docs/competitors/lattice/story.md` (§3 differentiators, §4 claims we must not make) |
| Lattice facts | `docs/competitors/lattice/research.md` ([L1], [H2], [H9], [H25]) |
| Footage | The real product, run locally against Firebase emulators with a fictional company (Northwind Robotics, 30 people) from `scripts/seed-demo-performance.mjs`. No production data or accounts. |
| Narration | Local Qwen3-TTS preset voice "Aiden" (synthetic, generated on this Mac). No music. |

## Files (owner's checkout, gitignored)

All in `screenshots/marketing/lattice/`:

| File | What | Length / size |
|---|---|---|
| `saasassin-performance-vs-lattice-story-16x9.mp4` | Story video, 1920×1080, H.264 + AAC 48 kHz, −18 LUFS | 2:58 |
| `saasassin-performance-vs-lattice-story-16x9.srt` | Captions (also burned in) | 42 cues |
| `saasassin-performance-short-9x16.mp4` | Short, 1080×1920, headline band carries the narration | 0:43 |
| `saasassin-performance-short-9x16.srt` | Short captions | 6 cues |
| `saasassin-performance-story-thumbnail-1280x720.png` | Thumbnail (real product screenshot) | 1280×720 |
| `narration/` | Narration tracks and the narration script (JSON) | |
| `qa/` | Edit logs, ASR transcripts, loudness report, contact sheets | |
| `raw-clips/` | Every recorded scene, for re-edits | 17 clips |

## Before you publish

- [ ] Re-check lattice.com/pricing and the three help-center articles below; update the cards if anything moved.
- [ ] The API panel in the webhook scene (about 2:28–2:38) shows our real route, `/api/lattice/v1/…`. Decide whether that is fine on camera next to a Lattice comparison, or rename the route prefix first.
- [ ] A small product bug is visible for about a second at 0:49 and 2:14: on Overview, the Inbox "reminder" badge is squeezed into the round activity-icon style and reads "mind". Fix the CSS and re-cut those two openings, or accept it.
- [ ] "Start free" is on the end card and in the CTA. `story.md` allows it; the business model ("free forever") is still the owner's call, so nothing says "forever".
- [ ] Choose a title below. Keep "Lattice" out of any phrasing that suggests affiliation.
- [ ] Listen once end to end. The voice was checked by transcription and loudness, not by a human ear.

## YouTube

**Title options** (≤ 70 characters)

1. Performance reviews you can preview, undo and take with you
2. An open-source Lattice alternative for performance reviews *(search: "lattice alternative")*
3. SaaSassin Performance: open-source reviews, no per-seat price

**Description**

```
SaaSassin Performance is open-source performance-review software (AGPL-3.0) with no per-seat price and no minimum contract. This walkthrough is the real product, running with a fictional company, Northwind Robotics.

What you'll see
• Import an org chart from CSV and preview every row before anything is written. Privileged roles can't be granted from a spreadsheet.
• Build a role from plain-language permissions, then view the workspace through it without changing anyone's access.
• Preview every phase change. Incomplete reviews block the next phase instead of being auto-submitted, and a reopened phase keeps everything people wrote.
• Reviews autosave; goals, check-ins, feedback and one-to-ones build up on one timeline per person, scoped to what each viewer may see.
• Calibrated, anonymized review packets. Peer and upward feedback below the minimum (3 by default) is withheld, not averaged. Packets can be reopened with a reason; the earlier acknowledgement stays on record.
• An append-only audit log, one versioned export file with a sha256 checksum on every part, and signed webhooks with a delivery log.

Chapters
00:00 Your reviews, your file
00:13 The fine print
00:36 Meet SaaSassin Performance
00:49 Import people and inspect roles
01:10 Preview, block and reopen review phases
01:36 Autosave and the evidence timeline
01:50 Anonymized packets, withheld below the minimum
02:14 Audit log, export and signed webhooks
02:38 Same job, different deal

Start free: https://performance.saasassin.net
Source code (AGPL-3.0): https://github.com/alibad/saasassin
Talk to us: https://saasassin.net

Lattice facts cited (Lattice's public pages, accessed 13 November 2026)
• Pricing — Performance $10/seat/month, billed annually; $4,000 minimum annual agreement: https://lattice.com/pricing
• End Peer Selection: https://help.lattice.com/hc/en-us/articles/10765260630679-End-Peer-Selection
• Lattice Data Exports and Data Retention Period: https://help.lattice.com/hc/en-us/articles/1500001262262
• Review Cycle Exports: https://help.lattice.com/hc/en-us/articles/360060448714-Review-Cycle-Exports

Lattice is a trademark of its owner. SaaSassin is not affiliated with or endorsed by Lattice. Comparisons reflect Lattice's public pages as of 13 November 2026; list prices only, and discounts vary. Spotted something out of date? Open an issue: https://github.com/alibad/saasassin/issues

Demo data is fictional. The narration is a synthetic voice generated locally.
```

**Tags**

open source performance review software, performance reviews, performance management software, lattice alternative, open source lattice alternative, 360 review, peer review, upward review, review calibration, review cycle, people ops, HR software, AGPL, SaaSassin

## Short (YouTube Shorts, LinkedIn video, X video)

**Title:** Your review tool shouldn't submit drafts for you

**Caption**

```
Your review tool shouldn't submit drafts for you.

SaaSassin Performance previews every phase change, blocks it while reviews are incomplete, and reopens a phase without losing work. Peer and upward feedback below the minimum (3 by default) is withheld, not averaged. Every review, goal and audit event exports in one checksummed file.

Open source (AGPL-3.0). No per-seat price.
performance.saasassin.net

#opensource #performancereviews #peopleops #hrtech
```

## LinkedIn post (draft)

```
Performance reviews are some of the most sensitive data a company keeps. Two questions worth asking of any review tool: can you see every rule that touches them, and can you take them with you?

SaaSassin Performance is our answer. It's open source (AGPL-3.0), with no per-seat price and no minimum contract.

In the three-minute walkthrough (the real product, a fictional company):
• A CSV import shows every row before anything is written, and a spreadsheet can't grant admin rights.
• Every phase change is previewed first. Incomplete reviews block the next phase; nothing is submitted for you. Reopen a phase and nothing anyone wrote is lost.
• Peer and upward feedback is anonymized, and withheld below a minimum (3 by default) instead of averaged.
• Every review, goal, feedback item, 1:1 and audit event exports as one versioned file, with a checksum on every part.

For context: Lattice's pricing page lists Performance at $10 per seat per month, billed annually, with a $4,000 minimum (accessed 13 Nov 2026). Lattice is ahead on plenty — engagement surveys, compensation, SSO, HRIS sync, a mobile app — and if you need those today, it's the better choice.

Try it: performance.saasassin.net
Read the code: github.com/alibad/saasassin

Lattice is a trademark of its owner; we're not affiliated.
```

## X / Bluesky post (draft, ≤ 280 characters)

```
Your review tool shouldn't submit drafts for you.

SaaSassin Performance previews every phase, reopens without losing work, and withholds peer feedback below a minimum (3 by default) instead of averaging it.

Open source (AGPL-3.0). No per-seat price.
performance.saasassin.net
```

## Claims in the video and where they come from

| Claim (as said or shown) | Basis | Rule in `story.md` |
|---|---|---|
| Open source under AGPL-3.0 | `LICENSE` on `main`; GitHub reports AGPL-3.0 (checked 2026-11-13) | §4 "Open source": true now that Slice 0 has shipped |
| No per-seat price, no minimum contract; "Start free" | No billing code; open sign-up (D1) | D1. Never "free forever" |
| CSV import previews every row; privileged roles can't come from a spreadsheet | On screen: "role 'admin' was reduced to Employee" (`csv.ts`) | — |
| Build a role, view the workspace through it, no one's access changes | On screen: "Server authorization still uses your real Owner role" | D5 (inspect). Assigning roles is not claimed (slice 1) |
| Launch preview shows effects; incomplete reviews block the next phase; drafts aren't auto-submitted; a reopened phase loses nothing | On screen: launch preview, "29 of 73 assigned reviews are still incomplete", reopen and re-advance with 44/73 unchanged, Rosa's draft intact | D4 |
| Reviews autosave; goals, check-ins, feedback and 1:1s on one timeline per person, scoped to the viewer | On screen: "Autosaved", Growth and Timeline tabs | Slice 8 fallback (evidence beside the form is **not** claimed) |
| Peer and upward feedback anonymized; withheld below the minimum (3 by default), not averaged | On screen: "Peer 1–3", "Upward feedback · withheld — 2 … at least 3 are required" (`assemblePacket`) | D7. No comparison with Lattice's anonymity |
| A calibrator reopens a packet with a reason; the earlier acknowledgement stays on record | On screen: reopen dialog and "reopened 1×" | — |
| Privileged actions in an append-only audit log; review answers and feedback text never enter it | Audit tab; `auditRecord` callers; rules deny update/delete | D7 |
| Every review, goal, feedback item, 1:1 and audit event exports as one versioned file with a checksum on every part | The real export's manifest is shown (14 files, sha256 each) | D6 wording; no unqualified "complete export" |
| Signed webhooks; every delivery attempt logged, failures included | Webhooks panel; the demo endpoint is on a reserved `.example` domain, so deliveries fail and the on-screen note says so | D6 |
| Lattice Performance $10/seat/month, billed annually, $4,000 minimum | [L1] lattice.com/pricing, accessed 2026-11-13 | Dated list price with source, on screen |
| Lattice: ending peer selection auto-approves pending nominations (and launches writing) | [H2] help center, accessed 2026-11-13 | Attributed: "Its help center says…" |
| Lattice: data deleted 180 days after the contract ends | [H25] help center, accessed 2026-11-13 | Attributed, never an absolute |
| Lattice: closed source; CSV per module, analytics as PNG | `story.md` §6 table; [H9], [H25] | Compare card, dated |

**Not claimed anywhere:** self-hosting, "free forever", email reminders, AI, SSO/SCIM/HRIS/Slack/mobile, importing from Lattice, certifications, customer counts, savings figures, "full replacement", anything about Lattice "shutting down".

## Narration (as recorded)

1. Performance reviews are some of the most sensitive data your company keeps. Can you see every rule that touches them? And can you take them with you?
2. Review software is usually rented by the seat, and the fine print matters. Lattice, for example, lists Performance at $10 per seat per month, billed annually, with a $4,000 minimum. Its help center says ending peer selection approves pending nominations automatically, and that data is deleted 180 days after a contract ends.
3. This is SaaSassin Performance: open source under AGPL-3.0, with no per-seat price and no minimum contract. Meet Northwind Robotics, a fictional company of thirty people.
4. Import your org chart from a CSV. You see every row before anything is written, and nobody gets admin rights from a spreadsheet.
5. Build a role from plain-language permissions. Then see the workspace through that role, without changing anyone's real access.
6. Launch a cycle, and you see exactly what will happen first. If reviews are incomplete, the cycle can't move on. It tells you how many, and it doesn't quietly submit drafts. Need to go back? Reopen the phase. Nothing anyone wrote is lost.
7. Reviews save as you type. Goals, check-ins, feedback and one-to-ones build up on one timeline per person, and each viewer sees only what they're allowed to.
8. After calibration, packets are released. Peer and upward feedback is anonymized. Below the minimum, three responses by default, it's withheld, not averaged, because two answers can identify the author. Employees acknowledge their packet. If something needs fixing, a calibrator reopens it with a reason, and the earlier acknowledgement stays on record.
9. Privileged actions land in an append-only audit log, and review answers and feedback text never do. Every review, goal, feedback item, one-to-one and audit event exports as one versioned file, with a checksum on every part. And your systems can listen through signed webhooks, with every delivery attempt logged, failures included.
10. Same job, different deal: no per-seat price, no minimum, source code you can read, and your data in one file.
11. Start free at performance.saasassin.net. Read the code on GitHub, or talk to us about your next review cycle.

**Short:** Your review tool shouldn't submit drafts for you. · Preview every phase. Reopen any phase. Lose nothing. · Too few responses? Withheld, not averaged. · See the workspace exactly as a role sees it. · Every review, goal and audit event, in one checksummed file. · SaaSassin Performance: open source, with no per-seat price.

## Shot log

| Time | Scene | Real screen | On-screen label |
|---|---|---|---|
| 0:00 | Title card | — | — |
| 0:05 | Permission grid | Permissions → simulator | Every rule, inspectable |
| 0:07 | Export | Reports → Export workspace (v1.0.0) | Your reviews. Your file. |
| 0:10 | Manifest | The downloaded file's manifest, `reviews.json` sha256 highlighted | Your reviews. Your file. |
| 0:13 | Fine print card | Text card, three cited Lattice facts | — |
| 0:36 | Sign-in → overview | Sign-in page, Rosa Whitfield (owner) | SaaSassin Performance |
| 0:49 | CSV import | People → preview with "reduced to Employee" warning → import 3 | Preview before anything is written |
| 0:59 | Custom role | Permissions → create "Review coordinator" → simulator → View as role | Inspect a role from the inside |
| 1:10 | Launch preview | Reviews → draft "H1 2027 performance review" (schedule, threshold 3) → Preview launch → Cancel | See the effects first |
| 1:19 | Blocked | Q4 2026 project check-in → Preview Calibration → blocked | Blocked, not auto-submitted |
| 1:27 | Reopen | Reopen Peer nomination → confirm → re-advance; 44/73 unchanged; Rosa's draft intact | Reopen without losing work |
| 1:36 | Autosave, evidence | Rosa writes a draft ("Saving" → "Autosaved"); Growth goals; Timeline | Saved as you type · one timeline per person |
| 1:50 | Packet | Signed in as Ana: Peer 1–3, upward withheld, acknowledge with a comment | Withheld below 3, never averaged |
| 2:05 | Packet reopen | Rosa reopens Ana's packet with a reason → "reopened 1×" | Reopen with a reason |
| 2:14 | Audit | Audit tab, newest first | Append-only |
| 2:21 | Export manifest | The 14 files with record counts and sha256 | One file, a checksum on every part |
| 2:28 | Webhooks | Send test → failure shown; delivery log with failed attempts | Signed. Logged. Honest. |
| 2:38 | Compare card | Text card: price, minimum, source, export | — |
| 2:48 | End card | performance.saasassin.net · github.com/alibad/saasassin · saasassin.net | — |
