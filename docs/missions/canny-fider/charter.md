# Mission 01 charter: Canny → Fider

Status: Discovery · Started August 9, 2026 · Maintainer alignment pending

## Mission

Make Fider the easiest credible path away from Canny for teams that need a
self-hostable product-feedback system. Success means three adopter-verified,
reversible migrations and one paying hosted Fider customer—not repository count
or nominal feature parity.

SaaSassin is not affiliated with Canny or Fider. Incumbent names identify a
migration target; they do not imply endorsement. No Fider maintainer has approved
this scope at the time this charter was published.

## Why this mission

- Canny provides documented CSV exports for boards and posts plus separate voter
  exports, creating a bounded migration input.
- Fider is an active AGPL-3.0 project with a current release and an established
  contribution process.
- Migration validation and deployment documentation can create adopter value
  before anyone proposes broad product changes.

## Operating principles

1. **Upstream first.** New feature ideas follow Fider's feedback process. GitHub
   implementation begins only after maintainers direct and accept the scope.
2. **Design-partner evidence.** A representative, permissioned export defines the
   real mapping and loss budget. Synthetic fixtures supplement but do not replace it.
3. **Deterministic and reversible.** A dry run produces the same plan each time,
   changes are auditable, and adopters keep an untouched source export and rollback plan.
4. **Explicit loss reporting.** Unsupported comments, attachments, identities,
   statuses, or votes are reported before cutover; nothing is silently discarded.
5. **Privacy by default.** Real exports are minimized, access-controlled, never
   committed, and destroyed on the agreed schedule. Published findings are anonymized.
6. **Sustainable ownership.** Accepted work includes tests, operator documentation,
   and a named maintenance path. Optional tooling stays separable when maintainers prefer.

## Four gates

### Gate 1 — Align before code

Deliverables:

- Share this charter with Fider maintainers and ask for the correct proposal channel.
- Record architectural constraints, ownership expectations, and rejected scope.
- Recruit one current or recent Canny user willing to provide a representative export.
- Complete five structured Canny-user interviews.

Exit: maintainer direction is recorded and one permissioned export is available.

### Gate 2 — Prove the migration

Deliverables:

- Version a field-level Canny-to-Fider data contract.
- Build a read-only validator that inventories the source and emits a loss report.
- Test posts, categories, statuses, tags, authors, voters, comments, images, and
  attachments as separate compatibility claims.
- Have the design partner review and approve the dry-run result.

Exit: the design partner approves a deterministic dry-run report and rollback plan.

### Gate 3 — Contribute upstream

Deliverables:

- Implement only the path accepted through Fider's contribution process.
- Add regression coverage, operator documentation, and upgrade guidance.
- Keep Canny-specific conversion outside Fider core when that lowers maintenance burden.

Exit: an accepted implementation path has named long-term ownership.

### Gate 4 — Move real teams

Deliverables:

- Operate a hosted reference instance with backup and recovery procedures.
- Complete three reversible migrations that adopters verify against the source.
- Publish anonymized outcomes, unresolved gaps, and restoration evidence.

Exit: three verified migrations and one paying hosted customer.

## Initial compatibility hypothesis

| Data area | Expected source | Proposed treatment | Current evidence |
| --- | --- | --- | --- |
| Boards and posts | Canny board/post CSV | Map to Fider posts and categories | Documented export; needs fixture |
| Statuses and tags | Post export | Normalize against destination configuration | Documented fields; needs fixture |
| Authors | Post author fields | Preserve attribution only after identity validation | Needs privacy review |
| Votes and voters | Separate voter exports or API | Reconcile identity before creating votes | Needs representative sample |
| Comments | API or supplemental export | Confirm whether core or optional tooling owns import | Maintainer alignment required |
| Images and attachments | Exported URLs/source files | Fetch, checksum, import where supported, report loss | Investigation required |

This table is a hypothesis, not a compatibility promise.

## Non-goals

- No disconnected Fider fork or new repository marketed as the replacement.
- No use of Canny proprietary code, private implementation details, or confusing branding.
- No roadmap, changelog, SSO, or enterprise parity work before the migration wedge is proven.
- No production cutover without adopter sign-off, backups, and a tested rollback.
- No migration counted from a synthetic fixture or an unverified import.

## Roles and decision rights

- **Fider maintainers:** decide what belongs upstream, how it should be proposed,
  architectural constraints, and whether a contribution is accepted.
- **Design partner:** owns source-data permission, defines must-keep information,
  verifies the dry run and final migration, and approves anonymized publication.
- **Mission lead:** coordinates evidence, decisions, risks, privacy, and exit gates.
- **Builders:** own bounded deliverables and tests within approved scope.
- **Independent verifier:** checks counts, samples records, exercises rollback, and
  records exceptions separately from the implementer.

## Mission scorecard

| Metric | Goal | Counted when |
| --- | ---: | --- |
| Qualified builders | 10 | A specific bounded problem and relevant evidence are supplied |
| Design partners | 1 | A real workspace, export path, and test window are confirmed |
| Canny-user interviews | 5 | Consent and a structured evidence note are recorded |
| Verified migrations | 3 | The adopter and independent verifier sign off on data and rollback |
| Hosted customers | 1 | A customer pays for an operated Fider instance after migration |

## Sources

- [Fider repository](https://github.com/getfider/fider)
- [Fider contribution guide](https://github.com/getfider/fider/blob/main/CONTRIBUTING.md)
- [Canny feedback export guide](https://help.canny.io/en/articles/3889198-exporting-feedback)
- [Canny Ideas export guide](https://help.canny.io/en/articles/14666898-exporting-ideas)

Last reviewed: August 9, 2026.
