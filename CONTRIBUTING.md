# Contributing to SaaSassin

SaaSassin builds free, open-source (AGPL-3.0) replacements for expensive closed SaaS.
This repository is the single source of truth for all ten products; the per-product
repositories (`alibad/saasassin-<product>`) are generated from it.

## Ways to help

- **Use a product and tell us what's missing.** Open an issue with the workflow you
  need and what you use today.
- **Pick an open gap.** Each competitor has a parity map in
  `docs/competitors/<competitor>/parity.md`; rows marked `missing` or `partial` are
  open for contributions.
- **Migrations.** Real export files (with private data removed) from the tool you're
  leaving make our importers better.

## Development

```bash
pnpm install
cp .env.example .env.local   # point at your own Firebase project
pnpm dev
```

Before opening a pull request, run:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:rules && pnpm build
```

Product data-layer changes also need the product's emulator suite to pass (see
"Quality checks" in `README.md`; it needs a Java 21+ JDK first on `PATH`).

## Ground rules

- Every product write goes through the server: session check, tenant membership and
  role check, input validation, then an append-only audit event.
- Use the shadcn/ui components in `src/components/ui`; never native `<select>`,
  `confirm()`, `alert()` or `prompt()`.
- Clean-room only: never copy a competitor's code, text, screenshots, logos or trade
  dress. Name competitors only to describe compatibility or comparisons.
- Keep claims honest: if something needs credentials that aren't configured, show a
  "not configured" state rather than fake data.

By contributing you agree that your contributions are licensed under the
GNU Affero General Public License v3.0 (see `LICENSE`).
