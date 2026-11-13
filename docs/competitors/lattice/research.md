# Lattice — competitor research

**Takeaway:** Lattice (lattice.com) is now a performance-first company. It shut down its HRIS and payroll products in 2026, raised its list prices in July 2026, and is betting on an AI agent that drafts reviews and runs 1:1s. Its core workflow is mature and well liked. The openings for SaaSassin Performance are price (a $4,000 annual minimum and per-module seats), data ownership (per-module CSV exports, and deletion 180 days after the contract ends), cycle phases with hidden side effects, and AI built without a verifiable evidence chain.

| | |
|---|---|
| Researched | 2026-11-13. **Every web fact below was accessed on 2026-11-13** unless a different date is given. |
| Used by | `parity.md` (the matrix the daily build loop works from) and `story.md` (positioning, video, compare page, SEO). |
| Our product | SaaSassin Performance, live at https://performance.saasassin.net. Source: https://github.com/alibad/saasassin |
| Earlier record | `src/app/targets/lattice/research/page.tsx` (decision record, 2026-08-10). Its two phase-side-effect claims were re-checked against the live help center on 2026-11-13 and still hold ([H2], [H3]). |

> **How to read this.** Source ids such as `[L1]`, `[H4]` and `[T2]` point to the list at the end. Every source is paraphrased. A **negative** claim ("not documented", "not found") means only that the cited page didn't show it on the access date. It is not a statement about the platform. Third-party review sites (G2, Capterra, TrustRadius and Software Advice) refused direct fetches with HTTP 403, so review themes come from search-engine extracts of those pages, which the source list marks. Reddit could not be reached at all (see *Research gaps*).

---

## 1. Snapshot (November 2026)

| Fact | Detail | Source |
|---|---|---|
| Positioning | A people-management platform: performance, goals, engagement, compensation and growth, plus "manager tools" (1:1s, updates, feedback) | [L1] |
| Scale (vendor claim) | Nearly 5,000 customers worldwide (as of June 10, 2026). G2 badges show 3,300+ five-star reviews | [L16], [L1] |
| Strategic shift | HRIS and payroll discontinued. Third parties say this was announced in Nov 2025, payroll access ended Mar 31 2026 and HRIS access ended Jul 31 2026. Lattice's own retention article says HRIS customers' data was deleted on August 6, outside the normal retention window | [T8], [T9], [H25] |
| AI bet | An AI Agent that drafts reviews from evidence (Jul 2026), joins 1:1s (Jun 2026), and powers an MCP connector for Claude, ChatGPT, Slack and Glean (Jul to Oct 2026). Lattice AI runs on OpenAI models | [L13], [L14], [L15], [L9] |
| Release cadence | About 7–9 changelog entries a month from Aug to Oct 2026, plus two seasonal releases a year | [L10], [L11], [L12] |

---

## 2. Capability inventory by module

### 2.1 Performance reviews (base product, $10/seat/mo)

**What it does.** Runs self, downward (manager), peer and upward reviews in cycles. Cycles can be annual, quarterly, project-based or automated, and are built from customizable templates and a question bank [L3]. The pricing page bundles talent reviews, calibration, promotions, PIPs and succession planning into Performance [L1].

**How the workflow goes**

1. **Setup.** The admin creates a cycle and picks a template for each review group or direction. Goal questions can be added, each with its own response type [H16]. A weighted-score toggle combines ratings and, since Sep 2026, goals and competencies into one score [H16], [L10]. Decimal rating scales arrived in Sep 2026 [L10].
2. **Participants.** Admins choose reviewees. Since Oct 2026, a "manager of manager" filter can include indirect reports [L10]. Project review cycles can be bulk-created from a CSV (Jul 2026) [L13].
3. **Schedule.** Cycles run manually or on an automatic schedule set up to 3 months ahead. Scheduled phases are peer selection start, a reminder, peer selection end, manager reviews start, a reminder, and cycle close. Reviews launch in the cycle's time zone, but events fire on the admin's browser time zone. Launch notifications cannot be edited after publishing unless the cycle is switched to manual [H1]. Separate due dates for each direction were announced in Mar 2026 [L11].
4. **Peer selection.** Employees and managers nominate peers, and managers approve them. Admins set a nomination cap (the help center suggests 2–3). There is no automatic overload warning: admins read a "# of peers to review" column and override selections themselves [H10]. In manual cycles, reviewers can optionally decline a peer review [H11]. **Ending peer selection launches the writing phase automatically and bulk-approves every nomination still pending** [H2].
5. **Writing.** Reviewers draft in the review form. Admins can add a late reviewer mid-cycle and notify them [H12]. Reopening a submitted review goes through requests that are approved manually or automatically. Approval notifies the reviewer and their manager, and a badge tells readers the review "is being edited". Requests still pending when the cycle ends are denied automatically, and all of these actions are audited [H4], [H5]. **Ending one reviewee's cycle early submits any drafts automatically** [H3].
6. **Calibration.** See §2.2.
7. **Sharing.** Packets are **not** shared automatically when a cycle ends. A manager or admin shares each one, and managers can even share mid-cycle while reviews are still pending [H1], [H7]. The manager's remarks come first in the packet, and what reviewers' responses the employee sees depends on visibility settings [H7]. Admins can download a reviewee version or a manager version. The manager version can include responses the employee cannot see [H8]. Since Sep 2026, packet sharing and export can be disabled per cycle for confidential cycles [L10].
8. **Acknowledgement.** The employee gets a Home task to acknowledge the packet, with an optional comment and an optional typed-name signature. Comments are visible to the employee, their manager and admins [H6]. Custom acknowledgement wording was announced in Mar 2026 [L11].
9. **Exports.** Per-cycle CSVs cover peer nominations, peer selection progress, writing progress (by reviewee and by reviewer), packet sharing progress and responses. Result analytics export as PNG [H9]. PDF packets can be grouped by reviewer, by question, or by both, in a Standard or Optimized layout [H8], [L13].

**Notable details**
- **Permission model.** There are company-wide permissions (manage owned cycles; manage cycles *without* seeing results; reviews and calibration admin; talent reviews) and targeted permissions (view/export results, manage reviews, view/edit calibration, administer calibration, approve promotions). The help center warns that some targeted actions affect everyone in a cycle, not only the target group. Examples are launch-and-notify, ending peer nomination and ending the cycle [H13]. Exclusions in targeted permissions arrived in Aug 2026 [L10].
- **AI.** Evidence-based review drafts and an AI summary of peer feedback; details are in §5 [L3], [L13].
- **PIPs, promotions, succession.** PIPs (structured plans with milestones and acknowledgement workflows) and succession planning (readiness and attrition-risk fields tied to calibrated scores) were announced in Oct 2024 and described as available in Spring 2025 [L17], [L18]. Admins can reopen or delete promotion nominations (Aug 2026) [L10], and approved promotions can be imported into a compensation cycle (Jul 2026) [L13].

### 2.2 Calibration and talent reviews

- **Calibration groups** can be built manually, from a CSV, or automatically from the hierarchy (by department or manager). An employee can be in several groups [H14]. Groups can be auto-created from attributes with conflict checks (Jun 2026) [L21] and merged (Aug 2026) [L10].
- **Roles.** Each group has facilitators and participants. Participants get view-only access to review data, and only during scoring. Only admins enter calibrated scores [H14].
- **Context.** Past cycle ratings and weighted scores can be added to the calibration table [H14]. Calibration Analytics (Oct 2026) shows pre- and post-calibration distributions and averages [L10].
- **After calibration.** Scores lock when calibration ends. Changing one means unsharing the packet, editing the score and resharing [H14].
- **Coming soon** (announced Sep 2, 2026): AI "Calibration Signals" that flag employees who may be over- or under-rated, an exportable audit trail of calibration changes, and box views for 250+ people [L12].
- **Talent reviews.** A separate performance-and-potential process with rating-only templates and a 9-box grid. It launches immediately and cannot be scheduled [H15], [L19].
- **Reviewer sentiment.** G2 admins call some calibration workflows hard to follow: it is hard to spot who is missing from a group, some icons are tiny, and there is no batch approval of ratings [T1].

### 2.3 Goals and OKRs (base product, $8/seat/mo)

- Company, department, team and individual goals, plus OKRs with key results [L4], [H22].
- **Cascading** (an admin setting). Goals form a parent–child tree, and the Cascade view shows alignment up to 2 levels. With cascading off, key results align only one level up [H22].
- **Roll-up.** A parent objective always takes its progress from its children. A parent key result does so only when it is binary [H22].
- **Goal cycles** show participation by department, manager and individual, including the share of goals aligned to company goals [H22]. Bulk edit is available to super admins or company-wide goal admins only [H22].
- Other features: a "Needs Update" view and UI refresh, IC goal duplication [L4], granular company and department goal permissions (Sep 2026) [L10], Salesforce and Jira integrations, and reminder notifications [L1]. Since Oct 2026, goals can be created from Claude or ChatGPT through MCP [L10].

### 2.4 1:1s / Meetings (included with every base product)

- **Setup.** A manager creates a recurring 1:1 with a frequency, next date and time zone, and can optionally connect Google or Outlook Calendar. An admin must enable the tool first [H20].
- **During the meeting.** Shared agendas, talking points, action items with due dates, and company and personal agenda templates. Company recurring talking points cannot be edited once saved [L5], [H21]. Update responses and Slack messages can be added as talking points [H23], [H19].
- **Notifications.** Email, Slack and Teams reminders before and after each meeting. A pre-meeting reminder needs a linked calendar event [H21]. Reviewers report wrong notifications when a 1:1 is rescheduled, and inconsistent Outlook sync [T4], [T2].
- **AI Agent in 1:1s** (generally available June 2026, no extra cost). It joins Zoom, Meet or Teams calls and produces a topic summary, an optional transcript, action items with owners, a suggested next agenda that carries over unresolved items, and coaching for both participants. Participants see when it joins and hosts can remove it [L14].
- **Lattice Meetings** (Oct 2026) adds group meetings and puts every calendar meeting in one view with AI recaps [L10], [L12]. Google Calendar links and write permissions arrived in Aug 2026 [L10].
- Customers praise this module the most (see §6).

### 2.5 Feedback and praise (included)

- **Visibility levels:** public, private, private + manager, and manager only, each subject to admin settings. Praise given from Slack is public by default [H19].
- **Requesting feedback.** Anyone can request feedback about themselves, their reports, or (depending on permissions) anyone, from colleagues or from external people by email. Requests can use templates or custom prompts and choose a visibility, but they can never be public [H18]. Feedback templates arrived in Jan 2026 [L20].
- Recipients must acknowledge private feedback (Aug 2026), and company values can now differ by group (Aug 2026) [L10].
- **Slack app.** Give praise and private or manager-only feedback, request feedback, and add 1:1 talking points. Deleting feedback in Lattice does not remove the Slack message [H19].

### 2.6 Updates and Q&A (included)

- **Weekly updates** use configurable questions and an optional sentiment score. The manager gets a "Review an update" task, and an update can't be edited once reviewed. Responses can be pulled into 1:1 agendas, and admins control who has access [H23].
- **Coming:** AI "Auto-Updates" drafted from Jira, GitHub, Linear and Notion, plus an agentic Slack app [L12].
- Q&A Boards give employees an open forum for questions [L2].

### 2.7 Engagement ($4/seat/mo) — a SaaSassin non-goal

Engagement, pulse, onboarding and exit surveys, and eNPS. It includes Mercer benchmarks, AI driver analysis, heatmaps and action planning [L6]. Anonymous surveys report aggregates only, with a minimum respondent threshold of 3 that admins can raise but not lower [H24].

### 2.8 Compensation (+$6/seat/mo add-on) — mostly a non-goal

Pay bands, Mercer benchmarks, merit and bonus cycles with budgets, multi-step approval chains (admins can edit any step, Oct 2026), statements with e-signatures (Sep 2026), and pay-equity analytics [L7], [L10]. G2 reviewers single out compensation as the least user-friendly module [T2].

### 2.9 Grow (+$4/seat/mo add-on)

Competency matrices, career tracks, individual development plans (IDPs), AI-generated "growth areas", and growth conversations inside 1:1s [L8].

### 2.10 Analytics

Dashboards cover completion, distributions, heat maps, calibration views and performance against potential [L3], [T1]. Saved charts and custom reports can be shared or scheduled daily, weekly or monthly with people, groups or a link (Jul 2026) [L13]. Admins will be able to ask natural-language analytics questions through MCP (planned for winter 2026) [L12]. G2 and Capterra reviewers describe analytics as rigid and want more customization (§7).

### 2.11 Platform

| Area | Detail | Source |
|---|---|---|
| Public API | Read access to users, competencies, feedback, goals, questions, tasks, reviews and updates; **goals are the only writable resource**. Keys are created under Admin > Platform, shown once, and stop working if their creator leaves. The reference lives at developers.lattice.com with a Swagger file. The article doesn't mention webhooks | [H26] |
| Rate limit | 240 requests/min (third-party connector documentation, unverified with Lattice) | search extract via [H26] query |
| SSO and SCIM | SAML SSO (Okta, Azure/Microsoft, ADP). SCIM with Okta and Azure; the external id is set on first sync | [H27] |
| MCP | Reads goals, feedback, 1:1s, updates and prior reviews within the user's own permissions. Can draft, edit and submit reviews. US and EMEA data residency (the blog) vs North America plus early access only, no DCR and no Admin section (the help center). The two sources conflict | [L15], [H28] |
| Notifications | Email, Slack (Enterprise accounts supported since Sep 2026) and Microsoft Teams (read-only), with a per-user notification channel selector (Sep 2026) | [H21], [L10] |
| Mobile | Native mobile app | search extract (help article "The Lattice Mobile App") |
| Exports | Admin-only and self-serve, mostly CSV **per module**: directory, review responses per cycle, 1:1 logs, updates (without comments), goals, feedback, surveys (also PowerPoint) and Grow logs | [H25] |
| Retention | Data is deleted automatically **180 days after the contract ends** and cannot be recovered. Immediate deletion requires identity verification | [H25] |
| Localization | Custom naming with self-localization (Sep 2026) | [L10] |

### 2.12 HRIS and payroll — discontinued

Lattice HRIS launched in Oct 2024. It cost $10/seat/mo, with payroll at +$6 and time tracking at +$2 (archived pricing page). According to third-party migration guides, the shutdown was announced in Nov 2025, payroll ended Mar 31 2026 and HRIS ended Jul 31 2026. Lattice now points HRIS needs to integrations such as Workday [T10], [T8], [T9]. The Lattice help center confirms HRIS customers were handled separately at deletion (data deleted on Aug 6) [H25]. **Partly verified:** we found no official Lattice announcement page.

---

## 3. Pricing (list prices as shown on lattice.com/pricing on 2026-11-13 [L1])

| Item | Price | Notes |
|---|---|---|
| **Performance** | **$10 /seat/month** | Reviews, talent reviews, calibration, promotions, PIPs, succession |
| **Goals & OKRs** | **$8 /seat/month** | Cascading goals, updates, reminders, Salesforce and Jira |
| **Engagement** | **$4 /seat/month** | Pulse, onboarding and exit, surveys, eNPS, AI analysis |
| Compensation add-on | +$6 /seat/month | Bands, benchmarks, cycles, statements, approvals |
| Grow add-on | +$4 /seat/month | Competencies, IDPs, career tracks, AI growth areas |
| Manager tools | Included with any base product | 1:1s (Meetings), Updates, Feedback, Q&A |
| **Minimum annual agreement** | **$4,000** | Can span several products |
| Billing | Annual, USD only | No monthly option |
| Implementation fees | None for performance software | Customer success support is included |
| Free trial | None (demo, sales, or a self-guided tour) | |
| AI Agent in 1:1s, evidence-based drafts | No extra cost | Per [L14] (June 29, 2026) |

**Price history and context**

| Fact | Date | Source |
|---|---|---|
| Performance went from $8 to $10; the "Foundations" bundle (Performance + Goals) went from $11 to $13. Archive captures show the old price on Jun 20 and the new one on Jul 11, 2026. It is described as the first list-price rise since 2022 | Jun–Jul 2026 | [T5] (cites Internet Archive captures) |
| The "Foundations" bundle **does not appear** on the pricing page | 2026-11-13 | [L1] |
| The page's JSON-LD FAQ still says Performance or Goals can be bought alone "for $8/month", which conflicts with the $10 shown | 2026-11-13 | [L1] |
| Renewal increases negotiated down; discounts for multi-year terms | undated buyer reports | [T6] |
| Auto-renewal, 30-day cancellation notice, 3–5% escalators (single source) | undated | [T7] |

**List-price arithmetic** (our calculation from [L1]; discounts and negotiation are ignored):

| Org | Modules | Annual list cost |
|---|---|---|
| 25 people | Performance | 25 × $10 × 12 = $3,000, so the **$4,000 minimum applies** (effectively $13.33/seat/mo) |
| 33 people | Performance | $3,960, still under the minimum |
| 50 people | Performance + Goals | 50 × $18 × 12 = **$10,800** |
| 100 people | Performance + Goals + Grow | 100 × $22 × 12 = **$26,400** |
| 250 people | Performance + Goals | 250 × $18 × 12 = **$54,000** |

---

## 4. Integrations

| Category | Integrations | Source |
|---|---|---|
| HRIS / people data | Workday (bidirectional: ratings and weighted scores out, demographics in), Rippling (two-way sync, pushes review cycles; Oct 2026), BambooHR, ADP, Gusto, HiBob; Paylocity announced. More than 20 systems in total | [L11], [L10], [L12], Lattice marketing via search |
| Identity | SAML SSO (Okta, Azure, ADP), SCIM (Okta, Azure) | [H27] |
| Communication | Slack (feedback, praise, requests, 1:1 talking points, notifications), Microsoft Teams (notifications) | [H19], [H21] |
| Calendar and meetings | Google Calendar, Outlook; Zoom, Meet and Teams for the AI agent | [H20], [L14] |
| Work tools | Jira and Salesforce for goals. Announced: Jira, Linear and GitHub evidence; Salesforce, Asana and Monday.com wins | [L1], [L12] |
| AI clients | MCP in the Claude, ChatGPT and Slack marketplaces, plus a Glean connector | [L13], [L10] |
| Developer | Public REST API (mostly read-only) and SCIM API | [H26], [H27] |

---

## 5. AI features

| Feature | What it does | Status / date | Notes | Source |
|---|---|---|---|---|
| Lattice AI Agent | Insights, coaching and suggested actions for HR, managers and employees, shown in a sidebar | Live; sidebar in H1 2026 | Runs on OpenAI. The vendor says the AI makes no performance decisions | [L9], [L11] |
| Evidence-based review drafts | Drafts a whole review from 1:1s, feedback, goals, updates, growth areas and prior reviews | Shipped July 2026; extension to peer, automated and promotion reviews is in progress | Vendor claims reviews are completed 47% faster. The Mar 2026 announcement promised sources would be shown; the Jul 2026 post doesn't describe citation display. Included at no extra cost | [L13], [L11], [L14] |
| Reviews Writing Assistant | Suggests improvements, fixes grammar, adjusts tone (up to 5 rewrites) | Live | **Admin opt-in** plus an in-product AI addendum. Review text is sent to OpenAI. It is unavailable when evidence-based reviews are on | [H17] |
| AI peer feedback summary | Summarizes peer feedback and surfaces trends | Live (marketing page) | | [L3] |
| AI in 1:1s | Notes, transcript, action items, next agenda, coaching | GA June 2026, no extra cost | Visible to participants; the host can remove it | [L14] |
| Lattice Meetings | All meetings in one view with AI recaps | Oct 2026 | | [L10] |
| Calibration Signals | AI pre-read that flags possible over- or under-rating | Announced Sep 2026 | | [L12] |
| Auto-Updates | Weekly updates drafted from Jira, GitHub, Linear and Notion | Announced Sep 2026 | | [L12] |
| Engagement AI | Driver analysis and summaries of open text | Live | Non-goal for us | [L6] |
| Growth areas | AI development suggestions | Live | | [L8] |
| AI admin settings | One page with a global switch and per-feature status | Oct 2026 | | [L10] |
| MCP | Use Lattice data from Claude, ChatGPT, Slack or Glean; draft and submit reviews; create goals and manager summaries | Jul–Oct 2026 | Data residency coverage is disputed between sources (§2.11) | [L15], [L10], [H28] |
| Voice | Spoken interaction with the agent | Announced June 2026 | | [L16] |

**Videos.** Official videos on Lattice's YouTube channel include *Announcing Lattice MCP* [Y1], *Lattice AI Agent* [Y2], *Lattice Platform Product Walkthrough* [Y3] and *Lattice Performance Management* [Y4]. Titles and the channel name were confirmed through YouTube's oEmbed endpoint. **Upload dates, descriptions and transcripts were not accessible**, so flows are inferred from the matching blog posts ([L14], [L15]). The demo page offers a roughly 7-minute recorded platform walkthrough and live 1:1 demos [L22].

From the posts, the moments Lattice shows off are:
1. A review draft that appears already filled with evidence, while the manager keeps the rating.
2. An agent that sits in the 1:1 and hands back action items and coaching.
3. A manager writing and submitting a review without leaving Claude or ChatGPT.

---

## 6. What customers love (respect it)

| Theme | Evidence | Source |
|---|---|---|
| Ease of use: an intuitive, straightforward interface | The most-mentioned G2 positive (about 211 mentions in G2's AI summary). G2 rates ease of use 9.3 and ease of setup 8.9 | [T2], [T3] |
| **1:1s** | About 92 G2 mentions. Agendas and action items live in the tool | [T2] |
| Goal setting and progress tracking | About 90 G2 mentions | [T2] |
| **Support** | G2 quality-of-support score 9.4, about 77 mentions. The team is quick to get on a call | [T2], [T3] |
| Data depth | Averages, distributions, heat maps and calibration views gave HR better data than before | [T1] |
| Overall ratings | G2 about 4.6/5 from roughly 4,100+ reviews (counts vary by snapshot). Capterra about 4.5/5 from roughly 200 | [T1], [T4] |

**What to respect when building:** 1:1s are Lattice's habit engine. Weekly use makes people stay, and the review cycle is where they renew. Support is part of the product. A free, open product has to match this with excellent in-app guidance, honest empty states and fast public issue handling.

---

## 7. Recurring complaints (with citations)

| # | Complaint | Evidence | Source |
|---|---|---|---|
| 1 | **Missing features and limited customization** | Top G2 negative themes: missing features (about 71 mentions), limited features (about 40) | [T2] |
| 2 | **Learning curve** for new users | About 45 G2 mentions; the product "can feel overwhelming at first" | [T2], [T1] |
| 3 | **Clunky navigation**, extra clicks, settings buried | Capterra reviewers and Capterra's own summary | [T4] |
| 4 | **Rigid reporting and analytics** | Comparison pages and reviewers want more flexible dashboards and deeper engagement reporting | [T3], [T4] |
| 5 | **Calibration admin friction** | Hard to see who is missing from a group, tiny icons, no batch approval | [T1] |
| 6 | **Multi-project reviewing** | Field teams that move between projects end up with many separate cycles | [T1] |
| 7 | **Org changes need the account admin** | A reviewer wanted to reassign direct reports without escalating | [T1] |
| 8 | **1:1 scheduling sync** | Notifications go wrong after a reschedule, and Outlook sync is inconsistent | [T4], [T2] |
| 9 | **Price** | Per-user, per-module costs add up for small orgs. There is a $4k minimum, renewal increases, and the July 2026 list-price rise | [T2], [T6], [T7], [T5] |
| 10 | **Narrow scope** after the HRIS exit | Some buyers wanted one consolidated HR stack | [T4], [T8] |
| 11 | **Phase side effects** (from official docs, not reviews) | Ending peer selection auto-approves and auto-launches; ending a reviewee early auto-submits drafts | [H2], [H3] |
| 12 | **Fragmented portability** (from official docs) | Per-module CSVs, analytics as PNG, and deletion 180 days after the contract ends | [H9], [H25] |
| 13 | **Permission blast radius** (from official docs) | Some targeted review actions affect everyone in the cycle | [H13] |

---

## 8. Research gaps and unverified claims

- **Reddit was not reachable.** The web search tool refuses reddit.com, the unauthenticated JSON API returned a block page, and we did not try to get around the block. Practitioner sentiment therefore comes from G2 and Capterra extracts only.
- **G2, Capterra, TrustRadius and Software Advice** returned HTTP 403 to direct fetches. Ratings, counts and theme counts come from search-engine extracts. They vary by snapshot, and G2's theme counts are produced by G2's own AI summary.
- **YouTube** gave us titles and channel only. Upload dates, descriptions and transcripts were unavailable.
- **HRIS shutdown dates** come from third-party and competitor sources. Only the deletion handling is on a Lattice page [H25].
- **The "Foundations" bundle at $13** is reported only by [T5]. It is not on the pricing page today.
- **Review anonymity in Lattice cycles.** We found no documented minimum-response threshold for peer or upward reviews. The 3-respondent minimum applies to engagement surveys [H24]. Do not claim our threshold is "safer".
- **Webhooks.** None are mentioned in the public API article [H26]. This does not prove Lattice has no webhooks.
- **Whether citations are shown in AI drafts.** It was promised in Mar 2026 [L11] but isn't described in the Jul 2026 post [L13].
- **MCP residency** is described differently in the blog ([L15]) and the help center ([H28]).
- **Lattice's directory export column headers** were not observed. Our CSV importer's compatibility with them is unverified.

---

## 9. Sources (all accessed 2026-11-13)

**Lattice (official site and blog)**
- [L1] Pricing — https://lattice.com/pricing
- [L2] Performance product page — https://lattice.com/performance
- [L3] Performance review software — https://lattice.com/platform/performance/reviews
- [L4] Goals & OKRs — https://lattice.com/goals
- [L5] 1:1s — https://lattice.com/one-on-ones
- [L6] Engagement — https://lattice.com/engagement
- [L7] Compensation — https://lattice.com/compensation
- [L8] Grow — https://lattice.com/grow
- [L9] Lattice AI — https://lattice.com/ai
- [L10] Product updates (Aug–Oct 2026 entries) — https://lattice.com/product-updates
- [L11] Spring/Summer 2026 release (published 2026-03-11) — https://lattice.com/blog/lattice-spring-summer-2026-product-release
- [L12] Fall/Winter 2026 release (2026-09-02) — https://lattice.com/blog/fall-winter-2026-product-release
- [L13] July 2026 product updates (2026-07-30) — https://lattice.com/blog/july-2026-product-updates
- [L14] Introducing the Lattice AI Agent in 1:1s (2026-06-29) — https://lattice.com/blog/introducing-the-lattice-ai-agent-in-1-1s
- [L15] Introducing Lattice MCP (2026-07-07) — https://lattice.com/blog/introducing-lattice-mcp
- [L16] Workforce intelligence launch at Lattiverse (2026-06-10) — https://lattice.com/blog/lattice-launches-workforce-intelligence-for-ai-era-connecting-people-strategy-to-business-outcomes
- [L17] Lattiverse product roadmap (2024-10-08) — https://lattice.com/blog/lattiverse-product-roadmap
- [L18] Spring 2025 release: succession planning and PIPs (search extract) — https://lattice.com/blog/lattice-spring-2025-product-release
- [L19] Talent reviews and 9-box (search extract) — https://lattice.com/platform/performance/talent-reviews ; https://lattice.com/templates/employee-9-box-template
- [L20] January 2026 product updates (title only, via search) — https://lattice.com/blog/january-2026-product-updates
- [L21] June 2026 product updates (search extract) — https://lattice.com/blog/june-2026-product-updates
- [L22] Demo page (search extract) — https://lattice.com/livestream

**Lattice help center** (each was fetched unless marked *extract*)
- [H1] Create a Review Cycle on an Automatic Schedule — https://help.lattice.com/hc/en-us/articles/360060019514
- [H2] End Peer Selection — https://help.lattice.com/hc/en-us/articles/10765260630679-End-Peer-Selection
- [H3] End a Reviewee's Review Cycle Early — https://help.lattice.com/hc/en-us/articles/1500002051882-End-a-Reviewee-s-Review-Cycle-Early
- [H4] Approve or Decline Reopen Reviews Requests — https://help.lattice.com/hc/en-us/articles/13772087046551
- [H5] Reopen Requests Settings (*extract*) — https://help.lattice.com/hc/en-us/articles/32417826386199
- [H6] Acknowledge Your Review Packet — https://help.lattice.com/hc/en-us/articles/1500001589141
- [H7] Navigate Reviews as a Manager; Receiving a Review Packet (*extract*) — https://help.lattice.com/hc/en-us/articles/1500002045142
- [H8] Download Your Review Packet; Download Individual Review Packets as an Admin (*extract*) — https://help.lattice.com/hc/en-us/articles/1500001694242 ; https://help.lattice.com/hc/en-us/articles/4407276006295
- [H9] Review Cycle Exports — https://help.lattice.com/hc/en-us/articles/360060448714-Review-Cycle-Exports
- [H10] Handling Employees with Too Many Peer Review Requests — https://help.lattice.com/hc/en-us/articles/360061235813
- [H11] Allow Reviewers to Decline Peer Reviews — https://help.lattice.com/hc/en-us/articles/360060102654
- [H12] Add a Late Reviewer to a Review Cycle (*extract*) — https://help.lattice.com/hc/en-us/articles/360060572974
- [H13] Configure Custom Role Reviews Permissions — https://help.lattice.com/hc/en-us/articles/360061578653
- [H14] Calibration groups, facilitators, data access, past ratings, editing after the end (*extracts*) — https://help.lattice.com/hc/en-us/articles/360062289253 ; …/25023320971159 ; …/360061884593 ; …/6753626752919 ; …/12779711713303
- [H15] Create a Talent Review (*extract*) — https://help.lattice.com/hc/en-us/articles/11764694574231
- [H16] Weighted scores; goals in review cycles (*extracts*) — https://help.lattice.com/hc/en-us/articles/12153728308119 ; …/1500001259362
- [H17] Lattice AI: Reviews Writing Assistant — https://help.lattice.com/hc/en-us/articles/26263030050839
- [H18] Request Feedback — https://help.lattice.com/hc/en-us/articles/7021234376855
- [H19] Feedback visibility; Slack integration and commands (*extracts*) — https://help.lattice.com/hc/en-us/articles/360061281033 ; …/360059445474 ; …/4402695361559
- [H20] Create a 1:1 as a Manager — https://help.lattice.com/hc/en-us/articles/360061711493
- [H21] 1:1 agenda templates, company templates, email notifications, Teams (*extracts*) — https://help.lattice.com/hc/en-us/articles/360061800073 ; …/6460718049559 ; …/360061711093 ; …/360061249153
- [H22] Goals: cascading, roll-up, goal cycles, bulk edit (*extracts*) — https://help.lattice.com/hc/en-us/articles/360063909333 ; …/23867023807895 ; …/360061802293 ; …/8184976718743
- [H23] Updates: manager tasks, editing, access, in 1:1s (*extracts*) — https://help.lattice.com/hc/en-us/articles/360059416634 ; …/1500000910261 ; …/1500002056382 ; …/360061799733
- [H24] Anonymity in Engagement Surveys and Pulse (*extract*) — https://help.lattice.com/hc/en-us/articles/360061207493
- [H25] Lattice Data Exports and Data Retention Period — https://help.lattice.com/hc/en-us/articles/1500001262262
- [H26] Lattice's Public API — https://help.lattice.com/hc/en-us/articles/360059449534-Lattice-s-Public-API
- [H27] The SCIM API; Single Sign-On section (*extracts*) — https://help.lattice.com/hc/en-us/articles/4404294040983 ; https://help.lattice.com/hc/en-us/sections/360011112794
- [H28] Lattice MCP Integrations Overview (*extract*) — https://help.lattice.com/hc/en-us/articles/40935994775831

**Third-party** (treat as directional; competitor-authored sources are flagged)
- [T1] G2 Lattice reviews (*403; search extracts*) — https://www.g2.com/products/lattice-lattice/reviews
- [T2] G2 Lattice pros and cons (*search extracts*) — https://www.g2.com/products/lattice-lattice/reviews?qs=pros-and-cons
- [T3] G2 comparison pages (*search extracts*) — https://www.g2.com/compare/15five-vs-lattice-lattice ; https://www.g2.com/compare/lattice-lattice-vs-leapsome
- [T4] Capterra Lattice reviews (*403; search extracts*) — https://www.capterra.com/p/151676/Lattice/reviews/
- [T5] UsagePricing — Lattice list-price change record (dated 2026-07-11; cites Internet Archive captures) — https://www.usagepricing.com/blueprint/activity/lattice-2026-07-15-foundations-13-performance-10
- [T6] Vendr — Lattice buyer reports (*search extract*) — https://www.vendr.com/marketplace/Lattice
- [T7] CostBench — Lattice pricing (*search extract*) — https://www.costbench.com/software/performance-management/lattice-performance/
- [T8] Vacation Tracker, "What happened to Lattice HR" (2026-07-21; **competitor-authored**) — https://vacationtracker.io/blog/what-happened-to-lattice-hr/
- [T9] ClonePartner, Lattice HRIS shutdown migration guide (*search extract*; migration vendor) — https://clonepartner.com/blog/lattice-hris-shutdown-the-2026-migration-data-export-guide/
- [T10] Archived Lattice HRIS pricing (*search extract*) — https://backup.lattice.com/pricing

**Official YouTube** (channel "Lattice"; title and channel confirmed via oEmbed; no dates or transcripts)
- [Y1] Announcing Lattice MCP — https://www.youtube.com/watch?v=XAnvc8_svB8
- [Y2] Lattice AI Agent — https://www.youtube.com/watch?v=Ig5GWNYa-P4
- [Y3] Lattice Platform Product Walkthrough — https://www.youtube.com/watch?v=JTK3ucoqNko
- [Y4] Lattice Performance Management — https://www.youtube.com/watch?v=zqR7DFT5Upk

**Our own code and docs** (state on branch `worktree-agent-a4be03331e090a885` at `1a31564`, 2026-11-13)
- `docs/fleet/status/performance.md`, `docs/fleet/prompts/performance.md`, `src/lib/fleet/apps.ts`, `src/data/targets.json`
- `src/lib/lattice/*.ts`, `src/components/lattice-*.tsx`, `src/app/api/lattice/**`, `src/types/lattice.ts`
