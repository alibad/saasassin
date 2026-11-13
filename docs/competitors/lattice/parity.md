# Lattice parity matrix

**Takeaway:** Of 119 concrete capabilities, SaaSassin Performance **has 30**, has **18 partially**, and is **missing 71**. The core review spine is ahead of Lattice on safety: previewed reversible phases, anonymity thresholds, a complete export, signed webhooks and the audit trail. The gaps are everyday operations: assigning roles, choosing who is in a cycle, editing people, email, per-direction questions, and evidence inside the review form. The next 15 slices below close those gaps first.

| | |
|---|---|
| Verified against | Code on `1a31564` (2026-11-13) and `docs/fleet/status/performance.md` (updated 2026-10-26, round 2) |
| Lattice facts | `research.md`. The `[L#]`, `[H#]` and `[T#]` ids refer to its source list (accessed 2026-11-13) |
| Scope | Organizations with 25–250 employees (`src/lib/fleet/apps.ts`). Exclusions are listed under *Deliberate non-goals* |

## How the daily loop uses this file

1. Take the **lowest priority rank** whose status is `missing` or `partial`, provided nothing it depends on is still open. Ranks 1–15 are the *Next 15 slices* at the bottom.
2. Build it as a vertical slice: shadcn/ui screen, server authorization, Firestore rules, audit event, empty and error states, unit, rules and emulator tests. Follow `docs/fleet/prompts/performance.md`.
3. When it ships, change the row's status to `have`, cite the file, and add the date. If the slice changes a public claim, update `story.md` too.
4. **Re-verify a Lattice detail before building against it.** A row records what Lattice's docs said on 2026-11-13, not a permanent fact.

**Legend.** Status: `have`, `partial` or `missing`, each with evidence. Value and effort are H/M/L (effort S ≈ ≤1 day, M ≈ 1–3 days, L ≈ a week or more). Rank 1 is next; `—` means nothing is left to do. Showcase means the row would make a strong video or comparison moment.

---

## ORG — Directory and organization graph

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-ORG-01 | Employee directory (name, title, team, manager, access, status) | Org chart and directory, exportable as CSV [H25] | **have**: People section (`PeopleView` in `src/components/lattice-workspace.tsx`, with profile photos and a person panel); `memberFromSnapshot` in `src/lib/lattice/data.ts` | — | H | — | — | no |
| LAT-ORG-02 | Bulk CSV import with preview, row errors and warnings | CSV plus 20+ HRIS sources [L11] | **have**: `parseEmployeeCsv` (`src/lib/lattice/csv.ts`), preview card, 250-row cap | Lattice header aliases are tracked in LAT-MIG-01 | H | — | — | no |
| LAT-ORG-03 | Edit an employee (title, team, manager) in the UI | A G2 reviewer wants to reassign reports without asking the account admin [T1] | **missing**: changes only through re-import (`importEmployees`); the org routes have no member update route | Edit dialog, member PATCH route, `member.updated` audit event, guard against manager loops | H | S | 5 | no |
| LAT-ORG-04 | Deactivate / offboard an employee and hand over open work | Lifecycle comes from HRIS or SCIM [H27] | **missing**: `status: "inactive"` exists in `src/types/lattice.ts`, but nothing sets it | Deactivate with a preview of open reviews, 1:1s and goals; block or reassign; reactivate | H | M | 5 | no |
| LAT-ORG-05 | Invitation email to imported employees | Invites and a notification center [H21] | **partial**: the invite is claimed on a verified sign-in (`linkInvitedMemberships`, `src/lib/lattice/member-links.ts`), but no email is sent | Send and resend invites through the mail pipeline from slice 6; invite-status column | H | S | 6 | no |
| LAT-ORG-06 | Org chart view | Org chart in the directory [H25] | **missing** | Read-only tree built from `managerId`, collapsible, gated by `directory.read` | M | S | 32 | yes |
| LAT-ORG-07 | Custom employee fields (department, location, level, start date) | Custom fields drive filters, exports, calibration groups and targeted permissions [H9], [H13], [H14] | **missing**: fixed fields in `WorkspaceMember` | Typed custom fields, CSV mapping, used in report and cycle filters | M | M | 48 | no |
| LAT-ORG-08 | HRIS sync or SCIM (one connector) | Bidirectional Workday, two-way Rippling, BambooHR/ADP/HiBob; SCIM via Okta/Azure [L10], [L11], [H27] | **missing**: the fleet module promises "HRIS field-map history" (`src/lib/fleet/apps.ts`) | One connector with a previewed field map and an immutable run history | M | L | 72 | no |
| LAT-ORG-09 | Imported employees sign in as themselves | External ids matched on first SCIM sync [H27] | **have**: `memberLinks/{uid}` (`src/lib/lattice/member-links.ts`); status R2 "Imported employees can sign in" | — | H | — | — | no |

## ACC — Access and permissions

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-ACC-01 | Built-in roles (owner, people admin, manager, employee) | Super admin, admins, managers, employees [H13] | **have**: `DEFAULT_ROLES` (`src/lib/lattice/permissions.ts`) | — | H | — | — | no |
| LAT-ACC-02 | Custom roles composed from atomic permissions | Custom roles with company-wide and targeted review permissions [H13] | **have**: `createRole` (`data.ts`); 16 atoms in `PERMISSIONS` | — | H | — | — | no |
| LAT-ACC-03 | **Assign a role to a person** | Admins assign roles and custom roles [H13] | **missing**: nothing sets `roleId` after creation; CSV caps at Manager ("privileged roles cannot be granted by CSV", `csv.ts`); the roles route is POST-create only | Assign-role dialog showing the permission diff; only owners can grant owner or admin; `member.role_changed` audit event; rules test | H | S | 1 | yes |
| LAT-ACC-04 | Permission simulator and view-as-role | Custom-role owners get a "Switch to admin" view [H13]; no general view-as found | **have**: Roles & permissions section with "Preview as <role>" (`PermissionsView` in `lattice-workspace.tsx`) | View-as-*person* (role plus relationships) is folded into LAT-ACC-07 | H | — | — | yes |
| LAT-ACC-05 | Targeted (scoped) permissions with exclusions | Grants limited to a subset of employees; exclusions added Aug 2026 [H13], [L10] | **missing**: every grant is workspace-wide | Scope a grant to teams or a manager subtree; the simulator shows the scope | M | L | 60 | yes |
| LAT-ACC-06 | Run cycles without seeing results | A "manage cycles without review visibility" permission [H13] | **partial**: `reviews.manage` is a separate atom from `reviews.read_all` and `reviews.calibrate`, but no test proves a manage-only role can't read answers | Rules plus emulator test; simulator badge "can launch, cannot read" | H | S | 16 | yes |
| LAT-ACC-07 | Access diagnostics ("why can Ana see this?") | Not found in Lattice docs | **missing**: required by `docs/fleet/prompts/performance.md` ("access diagnostics") | Explain-access panel showing the deciding permission, relationship or visibility rule | M | M | 30 | yes |
| LAT-ACC-08 | SSO | SAML SSO for Okta, Azure and ADP [H27] | **partial**: Google and email/password through Firebase Auth (README) | SAML/OIDC through Identity Platform | M | M | 71 | no |
| LAT-ACC-09 | Tenant isolation with server re-authorization | n/a (Lattice is multi-tenant SaaS) | **have**: `authorizeOrganization` (`data.ts`); cross-tenant rules tests (`tests/firestore.rules.test.ts`) | — | H | — | — | yes |

## REV — Review templates and cycles

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-REV-01 | Templates with text and 1–5 rating questions, required flags | Customizable templates [L3] | **have**: `ReviewQuestion` (`src/types/lattice.ts`); `templates/route.ts` | — | H | — | — | no |
| LAT-REV-02 | Starter templates and question bank | Question bank, sample questions, 360 template [L3] | **missing** | Four starter templates (annual, quarterly check-in, 360, upward) shipped as data | M | S | 33 | no |
| LAT-REV-03 | Different questions per direction | A template for each review group or direction [H16] | **missing**: one question list for every direction (`ReviewTemplate`) | Per-direction question sets; the review form and packet follow them | H | M | 7 | no |
| LAT-REV-04 | Richer question types (multiple choice, goal rating, competency, decimal scale) | Goal questions with response types; decimal scales (Sep 2026) [H16], [L10] | **partial**: `type: "text"` or `"rating"` (1–5) only | Multiple choice plus scale labels; keep integer 1–5 ratings | M | M | 53 | no |
| LAT-REV-05 | Template versioning (edit creates v2; running cycles stay pinned) | Templates are editable [L3] | **partial**: create-only, with no edit or duplicate route | Duplicate-and-edit as a new version; cycles store the version | M | S | 34 | no |
| LAT-REV-06 | Self, manager, peer and upward reviews | Self, downward, peer and upward [L3] | **have**: `generateAssignments` (`src/lib/lattice/program.ts`) | — | H | — | — | no |
| LAT-REV-07 | Peer nomination with manager approval | Ending selection bulk-approves pending nominations and launches writing [H2] | **have**: `nominatePeers` and `decideNomination` (`program-data.ts`); writing is blocked while any nomination is pending (`state-machine.ts`) | — | H | — | — | yes |
| LAT-REV-08 | Peer load caps and reviewer-load visibility | Nomination cap, "# of peers to review" column, admin override [H10] | **partial**: at most 5 nominations per subject (`validateNomination`); no view of each reviewer's load | Reviewer-load column with a warning threshold | M | S | 39 | no |
| LAT-REV-09 | Reviewer may decline a peer review | Optional setting, manual cycles only [H11] | **missing** | Decline with a reason; the nomination goes back to the manager | M | S | 46 | no |
| LAT-REV-10 | **Choose cycle participants** | Reviewee management; manager-of-manager filter (Oct 2026) [L10], [H13] | **missing**: every member is included (`generateAssignments` iterates all members) | Include or exclude by team, manager subtree or hire date; preview the count; store the participant list | H | M | 2 | no |
| LAT-REV-11 | Add or remove a reviewer or reviewee mid-cycle | Late reviewers from the Reviewees tab, with optional notification [H12] | **missing** | Add or remove assignments during writing, audited, never silently dropping submitted work | H | M | 20 | no |
| LAT-REV-12 | Autosaved drafts with a visible save state | Drafts saved [L3] | **have**: "All changes saved", "Saving…" and "Not saved" states (`ReviewEditor` in `lattice-workspace.tsx`); `saveReview` (`data.ts`) | — | H | — | — | yes |
| LAT-REV-13 | Previewed, adjacent phase transitions with blockers | Phase ends trigger side effects: auto-approve, auto-launch, auto-submitted drafts [H2], [H3] | **have**: `previewCycleTransition` (`src/lib/lattice/state-machine.ts`) | — | H | — | — | **yes** |
| LAT-REV-14 | Reversible phases that keep submitted work | Reopen happens per review, through request and approval [H4] | **have**: reverse transitions; status says "Assignment generation never overwrites" | — | H | — | — | **yes** |
| LAT-REV-15 | Scheduled phases | Automatic schedule up to 3 months ahead, in the cycle's time zone [H1] | **partial**: dates, overdue detection and admin "Advance due phases" (`duePhase`, `advanceDuePhases`); no automatic trigger, by design | Optional daily cron calling the same guarded transition; time zone per cycle | M | S | 47 | no |
| LAT-REV-16 | Separate due dates per direction | Spring 2026 release [L11] | **missing**: a single `dueDate` | Per-direction due dates feeding `deadlineStatus` | L | S | 76 | no |
| LAT-REV-17 | Reminders and overdue escalation | Email, Slack and Teams notifications [H21] | **partial**: in-app Inbox only (`sendCycleReminders`, `planReminders`) | Deliver by email (slice 6) | H | S | 6 | no |
| LAT-REV-18 | Reopen one submitted review on request | Request, approve or deny with a reason, "being edited" badge, audited [H4], [H5] | **missing**: reopening exists for a whole phase and for a packet, not for one review | Reviewer requests; admin decides; the packet marks "edited after submission" | M | M | 50 | no |
| LAT-REV-19 | Goals shown inside the review form | Goal questions; employees rated on their goals [H16] | **missing**: status "What's left: Evidence links from goals and feedback into review writing" | Show the subject's goals with their latest check-in; optional goal rating | H | M | 8 | yes |
| LAT-REV-20 | **Evidence panel and citations while writing** | Review context panel [H13]; AI drafts built from 1:1s, feedback and goals [L13] | **missing**: same status line | Side panel of the subject's feedback, check-ins and 1:1 notes the reviewer may see; citation chips stored as `{kind,id}`; the packet renders them as links | H | M | 8 | **yes** |
| LAT-REV-21 | Managers see their team's progress | Manager reviews view of nominations and team completion [L11], [H7] | **partial**: the progress list exists only for `reviews.manage` or `reviews.read_all` (`getProgramSnapshot`); the built-in Manager role has neither | Managers see the status (never the content) of their direct and indirect reports | H | S | 4 | no |
| LAT-REV-22 | Per-cycle CSV exports (progress, responses) | CSVs for nominations, progress, sharing and responses [H9] | **partial**: full JSON export only (`exportWorkspace`) | CSV of progress by reviewer and by reviewee, and of responses (permission-gated); audited | H | S | 9 | no |
| LAT-REV-23 | Project or ad-hoc cycles (bulk create) | Bulk-create project cycles from a CSV (Jul 2026) [L13] | **missing** | A cycle for a chosen subset with chosen reviewers | L | M | 77 | no |
| LAT-REV-24 | Automated recurring cycles (e.g. 90-day new hire) | Automated reviews [L3] | **missing** | A rule creates a cycle for members reaching tenure N | M | M | 58 | no |
| LAT-REV-25 | Weighted scores | Ratings, goals and competencies in one score (Sep 2026); manual entry [L10], [H16] | **missing** | Weights per direction, shown in calibration | L | M | 78 | no |
| LAT-REV-26 | Anonymity threshold for peer and upward feedback | Review anonymity depends on visibility settings [H7]; a minimum of 3 is documented only for surveys [H24] | **have**: `assemblePacket` withholds feedback below the threshold (default 3) | — | H | — | — | **yes** |
| LAT-REV-27 | Manager summary that leads the packet | The manager's remarks appear first in the packet [H7] | **missing** | Manager summary written before release and shown first | M | S | 26 | no |
| LAT-REV-28 | End one reviewee early without auto-submitting drafts | Ending early submits drafts automatically [H3] | **missing** | Close one subject's reviews; drafts stay drafts and are listed | L | S | 79 | yes |

## CAL — Calibration

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-CAL-01 | Calibrated rating and private note, with a rating summary by direction | Calibration table; only admins enter calibrated scores [H14] | **have**: `saveCalibration` (`program-data.ts`), `summarizeRatings` (`program.ts`) | — | H | — | — | no |
| LAT-CAL-02 | Calibration groups with a facilitator and view-only participants | Groups built manually, from CSV or the hierarchy; merging (Aug 2026) [H14], [L10] | **missing** | Groups by team or manager subtree; facilitator role; read-only participants | M | M | 51 | no |
| LAT-CAL-03 | Pre- vs post-calibration distribution | Calibration Analytics (Oct 2026) [L10] | **partial**: the report shows only the calibrated distribution (`ratingDistribution` in `buildReport`) | Review-signal distribution next to the calibrated one, by team | M | S | 15 | yes |
| LAT-CAL-04 | Prior cycle ratings in calibration | Past ratings and weighted scores [H14] | **missing** | Previous calibrated rating column | M | S | 41 | no |
| LAT-CAL-05 | Calibration change history | Audit-trail export announced as coming [L12]; editing after the end means unshare, edit, reshare [H14] | **partial**: the audit log records that calibration happened but never the rating, by design (status: "Sensitive content stays out of logs") | Calibrator-only history of who changed what, from → to, and why, kept apart from the general audit log | M | S | 15 | **yes** |
| LAT-CAL-06 | Rating-gap signals (self vs manager vs peer; manager leniency) | AI "Calibration Signals" announced as coming [L12] | **missing** | Deterministic flags such as a manager–peer gap of 1.5 or more, or a manager average far from the org's | M | S | 40 | yes |
| LAT-CAL-07 | Performance × potential (9-box) talent review | Talent reviews with a 9-box [H15], [L19] | **missing** | **Owner decision**: sits next to the excluded succession planning | L | M | 83 | no |

## PKT — Packets and acknowledgement

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-PKT-01 | Packet: self and manager attributed, peer and upward anonymized, calibration notes never included | Reviewee and manager versions; content follows visibility settings [H8] | **have**: `assemblePacket` (`program.ts`) | — | H | — | — | yes |
| LAT-PKT-02 | Packet release | A manager or admin shares; nothing is automatic at cycle end [H1], [H7] | **have**: released on the transition to Acknowledgement (`buildPacketWrites`) | — | H | — | — | no |
| LAT-PKT-03 | Release per employee or per manager | Managers share individually, even mid-cycle [H7] | **missing**: every packet releases together | Optional per-manager release within the phase | M | M | 52 | no |
| LAT-PKT-04 | Acknowledgement with comment | Acknowledge with an optional comment [H6] | **have**: `acknowledgePacket` | — | H | — | — | no |
| LAT-PKT-05 | Typed signature and custom acknowledgement wording | Optional typed-name signature [H6]; custom wording [L11] | **missing** | Signature field and wording set per cycle | L | S | 75 | no |
| LAT-PKT-06 | Safe reopen of one packet with a reason, keeping the prior acknowledgement | Changing a rating after calibration: unshare, edit, reshare [H14] | **have**: `reopenPacket` keeps packet history | — | H | — | — | **yes** |
| LAT-PKT-07 | Printable / PDF packet grouped by reviewer or question | PDF download with grouping and an Optimized layout [H8], [L13] | **missing** | Print route with print CSS (save as PDF) and a grouping toggle | H | S | 14 | no |
| LAT-PKT-08 | Confidential cycle (no packet sharing) | Packet sharing and export can be disabled (Sep 2026) [L10] | **missing** | Cycle flag that skips release and acknowledgement | L | S | 80 | no |

## GOAL — Goals and OKRs

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-GOAL-01 | Individual goals with due date, progress, status and visibility | Goals with progress tracking [L4] | **have**: `createGoal` (`program-data.ts`), visible to everyone or to owner and manager | — | H | — | — | no |
| LAT-GOAL-02 | Check-ins with history | Progress updates and reminders [L1] | **have**: `checkInGoal`; the history appears in the timeline | — | H | — | — | no |
| LAT-GOAL-03 | **Key results under objectives, with roll-up** | Parent objectives inherit progress; parent key results roll up only when binary [H22] | **missing**: `KeyResult` appears in `src/lib/fleet/apps.ts` but isn't implemented | Number, percent and binary KRs; objective progress is their weighted mean; check-ins per KR | H | M | 12 | yes |
| LAT-GOAL-04 | Company, department and team goals with cascading alignment | Cascade view up to +2 levels [H22], [L4] | **missing** | Owner type (company, team or person), parent link, alignment tree | H | M | 22 | **yes** |
| LAT-GOAL-05 | Edit, archive and delete goals | Edit goal and bulk edit [H22] | **missing**: `growth/route.ts` only has `create_goal` and `check_in_goal` | Edit and archive, audited; delete only goals with no check-ins | H | S | 17 | no |
| LAT-GOAL-06 | Goal cycles (quarters) with participation reporting | Participation by department, manager and individual [H22] | **missing** | A period on each goal plus a participation report | M | M | 54 | no |
| LAT-GOAL-07 | "Needs update" view and stale-goal reminders | Needs Update view [L4] | **missing** | Flag goals stale for more than 14 days; Inbox reminder | M | S | 42 | no |
| LAT-GOAL-08 | Progress driven by Jira or Salesforce | Salesforce and Jira integrations [L1] | **missing** | Comes after API write scopes (LAT-PLAT-06) | L | L | 82 | no |

## ONE — One-to-ones

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-ONE-01 | Manager–report 1:1 with shared agenda (add and tick), shared notes, complete | Collaborative agendas, notes and action items [L5] | **have**: `createOneOnOne` and `updateOneOnOne` (`program-data.ts`) | — | H | — | — | no |
| LAT-ONE-02 | Recurring cadence | Frequency, next date and time zone [H20] | **missing**: a single `scheduledFor` date | Weekly, biweekly or monthly series; completing one creates the next | H | S | 19 | no |
| LAT-ONE-03 | Private notes | Notes are centralized; the page doesn't say how they are shared [L5] | **missing**: only `sharedNotes` | Private notes per participant, readable only by their author; export policy decided and documented | H | S | 10 | no |
| LAT-ONE-04 | Action items with owner and due date, carried forward | Action items with due dates [L5]; the agent carries unresolved items into the next agenda [L14] | **partial**: agenda items can be ticked but have no owner, due date or carry-forward | Owner and due date; open items copied into the next meeting | H | S | 10 | yes |
| LAT-ONE-05 | Agenda templates and recurring talking points | Company and personal templates [H21] | **missing** | Personal and workspace templates | M | S | 38 | no |
| LAT-ONE-06 | Bring goals, feedback and the packet into the agenda | Update responses can be added to the agenda [H23]; growth conversations happen in 1:1s [L8] | **missing** | An "Add from…" picker that links records into the agenda | M | S | 37 | yes |
| LAT-ONE-07 | Calendar link (.ics, Google, Outlook) | Google and Outlook connect; Google Calendar write access (Aug 2026) [H20], [L10] | **missing** | `.ics` download first, OAuth later | M | M | 59 | no |
| LAT-ONE-08 | Skip-level, ad-hoc and group meetings | Lattice Meetings adds group meetings (Oct 2026) [L10] | **missing**: "One-to-ones are between an employee and their manager" (`createOneOnOne`) | Ad-hoc meeting with any colleague; skip-level | L | M | 74 | no |

## FB — Feedback and praise

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-FB-01 | Give praise or constructive feedback as private, recipient + manager, or public | Public, private, private + manager, manager only [H19] | **have**: `giveFeedback`; the text never enters the audit log | — | H | — | — | no |
| LAT-FB-02 | Manager-only feedback | Manager-only option [H19] | **missing**: the visibility enum in `growth/route.ts` doesn't include it | `manager_only` visibility with a rules test | M | S | 36 | no |
| LAT-FB-03 | **Request feedback** about yourself or a report | Ask colleagues or external people, with prompts and a visibility setting; never public [H18] | **missing** | Request with prompts and a due date; an Inbox task; responses respect visibility | H | M | 11 | yes |
| LAT-FB-04 | Feedback templates | Feedback templates (Jan 2026) [L20] | **missing** | Reusable prompt sets for requests | M | S | 69 | no |
| LAT-FB-05 | Public praise feed with company values | Slack praise is public by default; values can differ by group (Aug 2026) [H19], [L10] | **partial**: `public` visibility exists, but there is no feed and no values | Praise wall with optional value tags | M | S | 35 | yes |
| LAT-FB-06 | Retract or delete your own feedback | Delete submitted feedback (Slack copy remains) [H19] | **missing** | The author can delete within N days; the audit records only the fact | M | S | 45 | no |
| LAT-FB-07 | Give feedback from Slack or Teams | Slack app for praise, feedback, requests and talking points [H19] | **missing** | After notifications mature | M | L | 70 | no |

## UPD — Weekly updates

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-UPD-01 | Weekly updates with configurable questions and sentiment; manager review task | Editable until the manager has reviewed it [H23] | **missing** | Questions, sentiment, manager review | M | M | 55 | no |
| LAT-UPD-02 | Updates feed 1:1s and the timeline | Update responses can be added to the 1:1 agenda [H23] | **missing** | Link updates into agendas and the timeline | M | S | 56 | no |

## GROW — Career growth

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-GROW-01 | Competency matrix per role and level | Competency matrices (add-on, +$4) [L8] | **missing** | Matrix plus competency questions in templates | M | M | 64 | no |
| LAT-GROW-02 | Career tracks and ladders | Career tracks [L8] | **missing** | Tracks that reference competencies | M | M | 65 | no |
| LAT-GROW-03 | Development plans linked to feedback and reviews | IDPs; AI growth areas [L8] | **missing** | IDP with links to evidence | M | M | 66 | no |

## RPT — Reporting and analytics

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-RPT-01 | Program report: completion by direction and team, acknowledgement %, goal health, feedback counts, rating distribution | Dashboards, heat maps, calibration views [T1] | **have**: `buildReport` (`program.ts`); Reports tab | — | H | — | — | no |
| LAT-RPT-02 | Saved report views, private or shared | Saved charts and custom reports, shared or scheduled (Jul 2026) [L13] | **have**: `saveReportView` (`program-data.ts`) | — | M | — | — | no |
| LAT-RPT-03 | URL-addressable filters | — | **missing**: filters live in component state; `src/app/lattice/page.tsx` reads only `?organization=` | Put the cycle, team and view in the URL | M | S | 31 | no |
| LAT-RPT-04 | Filter by custom fields or manager subtree | Group by department or manager [H22] | **missing** (depends on LAT-ORG-07) | Filters for manager subtree and custom fields | H | M | 49 | no |
| LAT-RPT-05 | Trends across cycles | Scores charted over time (Aug 2026) [L10] | **missing** | Completion and rating distribution per cycle, over time | M | M | 57 | no |
| LAT-RPT-06 | CSV export of report tables | Many CSV exports; analytics as PNG [H9] | **missing** | Part of slice 9 (with LAT-REV-22) | H | S | 9 | no |
| LAT-RPT-07 | Scheduled or shared reports by email | Daily, weekly or monthly schedules (Jul 2026) [L13] | **missing** | After email exists (slice 6) | L | M | 73 | no |

## PLAT — Trust, portability and platform

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-PLAT-01 | Append-only audit log inside the product | Audit log for reopen requests [H4]; calibration audit-trail export announced as coming [L12] | **have**: Audit log section, where rules deny update and delete (`AuditView` in `lattice-workspace.tsx`) | — | H | — | — | **yes** |
| LAT-PLAT-02 | Audit search, filters, paging and CSV | — | **partial**: the UI shows the latest 100 events (`data.ts` `limit(100)`); the full history is in the export | Filter by actor, entity or type; paging; CSV | M | S | 43 | no |
| LAT-PLAT-03 | Complete, versioned, checksummed workspace export | CSVs per module, analytics as PNG, data deleted 180 days after the contract ends [H25], [H9] | **have**: `net.saasassin.workspace-export` 1.0.0, 14 files, sha256 each (`src/lib/lattice/export.ts`) | Add saved views, API key metadata and webhook config, which status lists under "What's left", as export 1.1.0 | H | S | 18 | **yes** |
| LAT-PLAT-04 | Import a workspace export (round trip) | Not offered | **missing** | Restore into an empty workspace; verify checksums; keep ids | H | M | 21 | **yes** |
| LAT-PLAT-05 | Read REST API with scoped keys | Read access to users, competencies, feedback, goals, questions, tasks, reviews and updates; only goals are writable; key shown once [H26] | **have** (narrow): `members`, `cycles` (counts) and public `goals` (`src/app/api/lattice/v1/organizations/[organizationId]/[resource]/route.ts`; `API_SCOPES`) | — | M | — | — | no |
| LAT-PLAT-06 | Broader API (review status, feedback metadata, 1:1 metadata) and goal writes | [H26] | **partial** | New scopes `reviews:status:read` and `goals:write` | M | M | 62 | no |
| LAT-PLAT-07 | OpenAPI spec | Swagger file importable into Postman [H26] | **missing** | `openapi.json` plus a docs page; feeds LAT-AI-05 | M | S | 28 | no |
| LAT-PLAT-08 | Signed webhooks with delivery log | The public API article doesn't mention webhooks [H26] | **have**: HMAC-SHA256 `X-SaaSassin-Signature`, SSRF guard, delivery log (`integrations-data.ts`); events are cycle transitioned, packet acknowledged, and test | — | M | — | — | yes |
| LAT-PLAT-09 | Webhook retries, redelivery and more events | — | **partial**: status says "attempted once per event, with no automatic retries yet" | Three retries with backoff, a redeliver button, and `review.submitted`, `goal.checked_in`, `feedback.given` (without the body) | M | S | 25 | no |
| LAT-PLAT-10 | API rate limits and write scopes | 240 requests/min (third-party documentation) | **missing** (status "What's left") | Token bucket per key | M | S | 44 | no |
| LAT-PLAT-11 | **Email notifications** | Email for 1:1s, feedback and goals [H21] | **missing**: in-app Inbox only (status) | Firestore `mail` collection with Trigger Email; per-user opt-out; an honest "email not configured" state | H | M | 6 | no |
| LAT-PLAT-12 | Slack or Teams notifications | Slack and Teams, with a channel selector (Sep 2026) [H21], [L10] | **missing** | Webhook recipes first, a native app later | M | M | 68 | no |
| LAT-PLAT-13 | Works on phones | Native mobile app (help center) | **have**: verified at 375px with no overflow (status); native apps are a non-goal | — | M | — | — | no |
| LAT-PLAT-14 | **Self-host on your own Firebase project** | SaaS only | **missing**: config is env-driven (`.env.example`; `.firebaserc` defaults to `saasassin-net`), but the README documents only the hosted project and nothing has been tested on a fresh one | `docs/self-host.md` plus a setup-check script, proven on a brand-new Firebase project | H | M | 3 | **yes** |
| LAT-PLAT-15 | Workspace deletion and retention policy | Auto-deletion 180 days after the contract ends; identity check for immediate deletion [H25] | **missing** | Owner-initiated deletion with an export-first step and a grace period | M | M | 63 | no |

## AI — Assistance (opt-in, evidence-linked; Stage 5 in `apps.ts`)

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-AI-01 | AI controls: off by default, global switch, per-feature toggles, provider shown | AI settings with a global switch (Oct 2026) [L10]; writing assistant is admin opt-in with an addendum [H17] | **missing**: status says "Stage 5 … Not started by design" | Workspace AI settings page with audit; nothing is sent to a model while it is off | H | S | 23 | no |
| LAT-AI-02 | **Evidence-cited review draft** | Drafts from 1:1s, feedback, goals, updates and prior reviews; no extra cost; 47% faster per the vendor [L13], [L14] | **missing** | Every sentence cites at least one record the drafter can see; a deterministic checker rejects uncited claims; edits tracked. Needs LAT-REV-20 and LAT-AI-01 | H | L | 24 | **yes** |
| LAT-AI-03 | Writing assistant (clarity, tone, grammar) | Review text is sent to OpenAI [H17] | **missing** | Behind LAT-AI-01 | L | M | 81 | no |
| LAT-AI-04 | Peer feedback summary | AI feedback summaries [L3] | **missing** | Summary only above the anonymity threshold, with quotes for each claim | M | M | 67 | no |
| LAT-AI-05 | MCP server over the API | Lattice MCP for Claude, ChatGPT, Slack and Glean; read and draft within permissions [L15], [L10] | **missing** | MCP generated from the OpenAPI spec (LAT-PLAT-07); read-only first; scoped by key | M | M | 29 | **yes** |

## MIG — Migration from Lattice

| id | capability | Lattice detail | SaaSassin status | gap to close | value | effort | rank | showcase? |
|---|---|---|---|---|---|---|---|---|
| LAT-MIG-01 | Accept Lattice's directory CSV as-is | Directory CSV export [H25] | **partial**: `parseEmployeeCsv` accepts `name`/`full_name`/`employee_name`, `email`/`work_email`, `title`/`job_title`, `team`/`department` and `manager_email`/`manager`; **never tested on a real Lattice export** | Get a real header row and add aliases plus a fixture test | H | S | 27 | no |
| LAT-MIG-02 | **Import Lattice review history** (responses CSV) as a closed, read-only cycle | Responses CSV per cycle [H9] | **missing** | Preview, then a mapping report, then a closed historical cycle whose packets are marked "imported"; checksums recorded | H | M | 13 | **yes** |
| LAT-MIG-03 | Import Lattice goals and feedback CSVs | Goals list and feedback CSVs [H25] | **missing** | Same preview-and-report pattern | M | M | 61 | no |

---

## Summary by module

| Module | have | partial | missing |
|---|---|---|---|
| ORG | 3 | 1 | 5 |
| ACC | 4 | 2 | 3 |
| REV | 7 | 7 | 14 |
| CAL | 1 | 2 | 4 |
| PKT | 4 | 0 | 4 |
| GOAL | 2 | 0 | 6 |
| ONE | 1 | 1 | 6 |
| FB | 1 | 1 | 5 |
| UPD | 0 | 0 | 2 |
| GROW | 0 | 0 | 3 |
| RPT | 2 | 0 | 5 |
| PLAT | 5 | 3 | 7 |
| AI | 0 | 0 | 5 |
| MIG | 0 | 1 | 2 |
| **Total (119)** | **30** | **18** | **71** |

---

## Slice 0 — before any marketing (owner decision, under an hour)

These are not parity rows. They block `story.md`.

- **License.** The repository is public, but it has **no LICENSE file** and GitHub reports no license (`gh repo view`, 2026-11-13). Until one is committed, "open source" and "AGPL-3.0" are false claims. Owner action: commit an AGPL-3.0 `LICENSE`, set the `"license"` field in `package.json`, and add a README section.
- **Product name.** The live sign-in page title is "Sign in to Lattice Performance" (`src/app/lattice/sign-in/page.tsx`), and the workspace title is "Lattice Performance workspace" (`src/app/lattice/page.tsx`). That uses the competitor's mark as our product name. Rename the user-facing titles and eyebrows to **SaaSassin Performance**. Routes can stay.

## Next 15 slices (each sized for one day)

Each slice ships with tests (unit, rules, and emulator where data is written), an audit event for every privileged write, shadcn/ui only, and a check at desktop and 375px widths.

**1 — Assign roles to people** (LAT-ACC-03)
- *Why:* custom roles and the simulator mean little if nobody can be given a role, and no org runs with one admin.
- *Acceptance:*
  - On People, a "Change access" dialog shows the current and new role and lists the permissions gained and lost.
  - Only `roles.manage` can assign. Only an owner can grant or revoke owner or admin, and the last owner can't be demoted.
  - A `member.role_changed` audit event records the old and new role ids.
  - Rules and emulator tests cover: an employee can't self-promote, cross-tenant writes are denied, and the last-owner guard holds.
- *Showcase:* simulate "Review coordinator", assign it to Ana, then view as Ana.

**2 — Choose who is in a cycle** (LAT-REV-10)
- *Acceptance:*
  - The cycle draft has participant rules: all, by team, by manager subtree, and exclude anyone hired after a date (needs a start date; optional CSV column `start_date`).
  - The launch preview shows the reviewee count and the excluded people.
  - Assignments are generated only for participants, and the list is stored on the cycle and included in the export.
  - Unit tests for `generateAssignments` with participant filters; an emulator test for launch.

**3 — Self-host guide, proven** (LAT-PLAT-14)
- *Acceptance:*
  - `docs/self-host.md` covers creating a Firebase project, enabling Auth providers, setting env vars, deploying rules and indexes, running on Vercel or any Node host, and the first sign-in.
  - `pnpm selfhost:check` validates env, rules and index deployment and connectivity.
  - It is run end to end on a **brand-new** Firebase project, recording the time taken and any friction in the doc.
  - The README links to it.
- *Showcase:* the "your Firebase, your data" scene in the video.

**4 — Managers see their team's progress** (LAT-REV-21)
- *Acceptance:*
  - A manager without `reviews.read_all` sees status only (outstanding, submitted, overdue) for direct and indirect reports, never answers.
  - A rules test proves no review content leaks.
  - An empty state appears when the manager has no reports in the cycle.

**5 — Edit and deactivate people** (LAT-ORG-03, LAT-ORG-04)
- *Acceptance:*
  - An edit dialog changes title, team and manager, with a guard against manager cycles.
  - Deactivation first previews the person's open reviews, 1:1s and goals. It is blocked while they are a pending reviewer unless "cancel their open assignments" is chosen.
  - Reactivation restores access. Every change writes a `member.updated` or `member.deactivated` audit event.
  - Deactivated members can't sign in to the workspace (rules test).

**6 — Email that actually arrives** (LAT-PLAT-11, LAT-REV-17, LAT-ORG-05)
- *Acceptance:*
  - Reminders, escalations, packet released, nomination requests and invites write to the Firestore `mail` collection (Trigger Email).
  - Each user can opt out per kind.
  - If mail isn't configured, the admin UI says so plainly and nothing claims an email was sent.
  - Email bodies contain no review text or feedback text.
  - The emulator test asserts the documents written.

**7 — Different questions per direction** (LAT-REV-03)
- *Acceptance:*
  - The template editor offers tabs for self, manager, peer and upward, each with its own questions. Existing templates migrate by copying their questions to every direction.
  - The review form and packet show only the relevant questions.
  - Ratings summaries still compute per direction.
  - The export schema becomes `review-template` 1.1.0 with a migration note.

**8 — Evidence panel with citations in the review form** (LAT-REV-19, LAT-REV-20)
- *Acceptance:*
  - While writing, a side panel lists the subject's goals and check-ins, feedback and 1:1s **that the reviewer is allowed to see**, filtered to the cycle window.
  - Clicking "Cite" inserts a chip stored as `{kind, id}`.
  - The packet renders the chip as a link the reader can follow only if they may see that record; otherwise it shows "cited record (not visible to you)".
  - Citations are exported.
  - A visibility test covers: a private feedback item is never offered to a peer reviewer.
- *Showcase:* the core "evidence-linked reviews" moment, and the foundation for LAT-AI-02.

**9 — CSV exports for cycles and reports** (LAT-REV-22, LAT-RPT-06)
- *Acceptance:*
  - CSV downloads: progress by reviewer, progress by reviewee, nominations, and responses. Responses require `reviews.read_all` and respect the anonymity threshold. Every report table is also downloadable.
  - Each download writes an `export.downloaded` audit event that records the kind, never the content.
  - CSV injection is escaped.

**10 — 1:1 private notes and action items** (LAT-ONE-03, LAT-ONE-04)
- *Acceptance:*
  - Each participant has private notes that only they can read (rules test).
  - Action items have an owner and an optional due date, and open items carry into the next 1:1 automatically.
  - The export policy for private notes is decided and written in `EXPORT_MIGRATION_NOTES`.

**11 — Request feedback** (LAT-FB-03)
- *Acceptance:*
  - Request feedback about yourself (or, as a manager, about a report) from up to 5 colleagues, with custom prompts, a due date and a visibility setting (never public).
  - Recipients get an Inbox task, and email after slice 6.
  - Responses are stored as feedback linked to the request. Declining is allowed.
  - The audit log records facts only.

**12 — Key results and roll-up** (LAT-GOAL-03)
- *Acceptance:*
  - Objectives hold key results: number (start, target, current), percent, or binary.
  - Objective progress is the weighted mean of its key results, and check-ins update a key result.
  - Existing goals become objectives with no key results and unchanged progress.
  - Unit tests for the roll-up maths; export `goal` 1.1.0.

**13 — Import your Lattice review history** (LAT-MIG-02)
- *Acceptance:*
  - Upload a Lattice "review responses" CSV, then preview the column-to-question mapping and the reviewee/reviewer matching by email.
  - Commit creates a **closed, read-only** historical cycle with packets marked "Imported from Lattice on <date>".
  - A downloadable mapping report lists every skipped row and why.
  - Nothing goes to current employees' inboxes.
  - Fixture-based tests. **Needs a real export sample.** Until one is available, build against a documented hypothesis and label the importer "beta".

**14 — Printable packet** (LAT-PKT-07)
- *Acceptance:*
  - A print view groups the packet by reviewer or by question, and the browser's "Save as PDF" output fits A4 and Letter.
  - Anonymized sections stay anonymized. Calibration notes never appear.

**15 — Calibration that shows its work** (LAT-CAL-03, LAT-CAL-05)
- *Acceptance:*
  - Reports show the review-signal distribution next to the calibrated distribution.
  - A calibrator-only history records every rating change (who, when, from → to, optional reason). It is stored apart from the general audit log, so ratings never reach `auditEvents`, and rules prove only `reviews.calibrate` can read it.
- *Showcase:* "every rating change has a name and a reason".

---

## Deliberate non-goals

These come from the `exclusions` in `src/lib/fleet/apps.ts` and from the boundary on `/targets/lattice/research`.

| Lattice capability | Why Performance won't build it |
|---|---|
| Payroll | Lattice itself exited payroll (access ended Mar 31 2026 per [T8], [T9]). Moving money is regulated and is not performance management. |
| Benefits | HRIS/benefits-administration scope; not our job to be done. |
| Recruiting (ATS) | A separate product category with a different buyer. |
| Time and attendance / time off | Was part of Lattice HRIS, which is discontinued [T10], [H25]. |
| Full HRIS (system of record) | We import and sync the directory; the system of record stays in the customer's HRIS. Lattice made the same call in 2026. |
| Engagement surveys (pulse, eNPS, onboarding/exit, action planning) | Survey-scale anonymity and benchmarking make it a separate product ([L6], $4/seat). It could become a fleet product later, but not inside Performance. |
| Compensation benchmarking | Relies on licensed third-party market data (Mercer [L7]) that an open-source product can't redistribute. |
| Succession planning | Excluded in `apps.ts`. Highly sensitive, and it needs mature calibration first. |
| Native mobile apps | The responsive web app is verified at 375px instead. |
| Large integration marketplace | We offer an API, signed webhooks, one HRIS connector and an MCP server instead, so the community can build the rest. |

**Not excluded, not planned. The owner needs to decide:**

| Capability | Lattice detail | The tension |
|---|---|---|
| Compensation cycles, bands and statements | +$6 add-on [L7] | `apps.ts` excludes only *benchmarking*. Merit cycles are a large, sensitive scope. |
| Talent reviews / 9-box (LAT-CAL-07) | [H15] | Close to the excluded succession planning. |
| PIPs and promotions | Inside Performance [L1], [L18] | They fit the review spine, but they are high-stakes documents. If built, they must meet our evidence and audit standards. |
| AI meeting notetaker that joins calls | [L14] | Recording employment conversations needs consent and retention work. It conflicts with our posture that AI is opt-in and evidence-linked; recommend no. |
| Q&A boards | [L2] | Closer to the fleet's Community product than to performance. |
