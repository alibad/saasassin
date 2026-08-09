# Canny migration interview guide

Mission 01 needs five current or recent Canny users before implementation scope is
fixed. The goal is to discover migration constraints, not to pitch a predetermined build.

## Recruitment screen

Prioritize a mix of workspace sizes and workflows. A qualified participant should:

- administer, export, or closely operate a Canny workspace now or within the last year;
- understand which boards, posts, votes, comments, identities, tags, statuses, and
  integrations matter during a move;
- be willing to discuss constraints for 30 minutes; and
- disclose whether their organization could test a migration within 30, 90, or 365 days.

At least one participant should be able to become the design partner. Do not accept
confidential exports during the initial call.

## Consent opening

Explain that SaaSassin is independently researching an open migration path to Fider,
is not affiliated with either product, and has no maintainer approval yet. Ask permission
to take written notes. Do not record audio or video without separate explicit consent.
Remove personal and customer identifiers from the synthesis.

## Thirty-minute script

1. **Context — 5 minutes**
   - What job does Canny perform for your team and who operates it?
   - Roughly how many boards, posts, voters, comments, admins, and integrations exist?
   - What prompted you to consider staying, leaving, or self-hosting?
2. **Critical data — 8 minutes**
   - Which records must survive exactly, and which may be summarized or archived?
   - What would make an imported author, voter, timestamp, status, tag, or attachment wrong?
   - Which audit or privacy obligations apply to identities and comments?
3. **Workflow and parity — 7 minutes**
   - Which workflows are genuinely daily versus merely available?
   - What integrations or authentication paths block a move?
   - What could remain in read-only Canny during a staged cutover?
4. **Migration mechanics — 7 minutes**
   - Have you produced a Canny CSV or voter export? What was missing or difficult?
   - What dry-run evidence would make you trust the result?
   - What downtime, rollback time, and data-loss budget are acceptable?
5. **Commitment — 3 minutes**
   - Could your team share a minimized sample under an agreed deletion schedule?
   - Could you verify a dry run and, if it passes, test a reversible migration?

## Evidence note

For every interview record:

- participant code, date, operator role, workspace-size band, current-tool status;
- required data ranked must/should/could;
- blockers and acceptable workarounds;
- verbatim-free evidence summary and confidence level;
- export availability, migration window, and design-partner qualification;
- consent scope, follow-up date, and deletion commitments.

Never place real exports, credentials, customer names, or participant email addresses
in GitHub. Contact details stay in the restricted Firebase operations queue.

## Synthesis and decision rule

After five interviews, publish an anonymized matrix of recurring requirements and
outliers. Advance to Gate 2 only if one participant qualifies as a design partner and
the highest-priority data can plausibly move with an explicit loss report.

Pause or narrow the mission if maintainers reject the proposed ownership model, no
participant can produce an export, identity reconciliation is unsafe, or the smallest
credible migration requires broad feature parity first.
