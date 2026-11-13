# Product brands

Owner direction (2026-11-13): the products must not look like SaaSassin. Each one is
its own product with its own identity, at the level of the company it competes with —
real profile photos, a real team experience, real sign-in integrations. Nothing in a
product should read as a demo, a dossier or an incubation page.

SaaSassin is the open-source family the products belong to. Inside a product it appears
only as a quiet footer line ("Part of the SaaSassin open-source family") and in the
repository link — never as the logo, the page title prefix, or the visual style. The
brutalist lime/ink/monospace look stays on saasassin.net only.

Product names stay as they are for now (they are the subdomains and repositories); each
gets its own wordmark set in its own typeface plus an abstract mark that is not a letter,
so a later rename only changes text.

## The ten identities

| Product | Competes with | Personality | Primary | Accent | Canvas (light) | Headings / body | Radius | Mark idea | Default mode |
|---|---|---|---|---|---|---|---|---|---|
| Performance | Lattice | warm, human, fair | forest `#1F6F4A` | apricot `#F4A259` | warm white `#FBFAF7` | Fraunces / Inter | 12px | two rising leaves or arcs (growth) | light |
| Research | Dovetail | editorial, calm, evidence-first | indigo `#3346A8` | highlighter `#FFD84D` | paper `#FAFAF7` | Newsreader / Source Sans 3 | 8px | quotation mark with a highlight stroke | light |
| Planner | Motion | crisp, fast, focused | tangerine `#F05A28` | ink `#18181B` | cool white `#F7F7F8` | Manrope / Manrope | 10px | stacked time blocks forming a tick | light, dense |
| Creator | Kajabi | expressive, creator-first | fuchsia `#C026D3` | peach `#FDBA74` | cream `#FFF9F3` | DM Serif Display / DM Sans | 16px | play triangle opening like a book | light |
| Feedback | Canny | friendly, open | teal `#0E9384` | sun `#FDB022` | white `#FFFFFF` | Plus Jakarta Sans / Plus Jakarta Sans | 14px | upvote chevron inside a speech bubble | light |
| Studies | Maze | playful but precise | sky `#0284C7` | coral `#FB7185` | white `#FFFFFF` | Space Grotesk / Inter | 12px | cursor landing on a target ring | light |
| Revenue | Gong | confident, data-led | navy `#0B2545` | gold `#E3A008` | mist `#F5F7FA` | Sora / Inter | 8px | waveform bars rising like a chart | light with navy sidebar |
| Community | Circle | warm, social | grape `#7C3AED` | rose `#F472B6` | lilac white `#FAF8FF` | Bricolage Grotesque / Inter | 18px | three figures around a table (dots) | light |
| Mail | Superhuman | sleek, keyboard-first | postal red `#E5484D` | — | graphite `#111113` / `#1C1C1F` | Instrument Sans / Instrument Sans | 8px | envelope fold as a fast chevron | dark |
| Trust | Vanta | precise, auditable | graphite `#111827` | verified emerald `#059669` | white `#FFFFFF` | IBM Plex Sans / IBM Plex Sans + IBM Plex Mono | 6px | shield with a check | light |

Hex values are starting points: derive full light and dark token sets from them and
check WCAG AA contrast for text and controls in both modes.

## How a brand is applied

- Every product route renders inside its brand root (`data-brand="<slug>"`), which sets
  the shadcn tokens (`--background`, `--foreground`, `--primary`, `--ring`, `--radius`,
  `--chart-*`, sidebar tokens…) and the font variables for that product. Components keep
  using shadcn + Tailwind; the brand changes how they look.
- Fonts load per product through `next/font/google` in the product's own layout, so a
  product only downloads its own typefaces.
- Each product has its own favicon / app icon, Open Graph image, page titles
  (`<Product> — <what it does>`), and footer.
- Signed out, a product shows a real product homepage: what it does, real screenshots of
  the product, how it works, importing from the tool you use today, open source and data
  ownership, FAQ, sign-up. Not the incubation dossier ("demo contract", "golden path",
  "target decision") — that material lives on saasassin.net.
- Copy is honest: only claim what ships today (see `docs/fleet/status/<product>.md` and,
  for Performance, `docs/competitors/lattice/story.md`). Self-hosting is not claimable yet.

## The shared account experience

Every product gets the same depth of account and team features, styled by its brand:
profile photos (uploaded, or from the sign-in provider), an account menu, a workspace
switcher, a team page with real invitations (pending invites for people without an
account, invite links, roles, remove, leave, transfer ownership), account settings
(profile, sign-in methods, password, email verification, two-step verification with an
authenticator app, sign out everywhere), and sign-in with Google plus Microsoft, GitHub
and Apple when those providers are switched on for the deployment.

## In the code (2026-11-13)

| Piece | Where |
|---|---|
| Identity data (name, descriptor, hex colours, fonts) | `src/brands/<slug>/brand.ts` |
| Tokens, light + dark | `src/brands/<slug>/theme.css` (`[data-brand="<slug>"]`, dark under `[data-mode="dark"]` and `.dark`) |
| Typefaces | `src/brands/<slug>/fonts.ts` → `--brand-font-heading`, `--brand-font-body`, `--brand-font-mono` |
| Mark | `src/brands/<slug>/mark.tsx` (paints with `--mark-1..3`; pass `colors` for fixed hex) |
| Homepage | `src/brands/<slug>/{site.ts,preview.tsx,home.tsx}` composed from `src/components/product-site/*` |
| Root, mode, toggle | `src/lib/brand/brand-root.tsx` (`useBrandMode()`), `theme-toggle.tsx`, shared rules in `base.css` |
| Icons and social card | `icon.svg` (hand-kept in step with the mark), `apple-icon.png` and `opengraph-image.png` from `node scripts/generate-brand-images.mjs` |

**For workspace components** (the next phase): use the shadcn tokens through Tailwind as usual —
`bg-background`, `text-foreground`, `bg-card`, `bg-primary text-primary-foreground`,
`text-muted-foreground`, `bg-muted`, `border-border`, `ring-ring`, `bg-sidebar…`, `chart-1..5`
and `rounded-lg` (all follow the product's `--radius`). Brand extras: `bg-brand-accent` /
`text-brand-accent-foreground`, `bg-brand-subtle` (alternate surface), `bg-brand-ink` /
`text-brand-ink-foreground` (inverse band). Type: `font-sans` (body), `font-heading`, `font-mono`
resolve to the product's faces; `.brand-heading` adds the display weight and tracking. Add the
`dark` class to any element to give its subtree the brand's dark tokens. Avoid the saasassin.net
variables (`--ink`, `--paper`, `--lime`, `--muted`, `--line`) and Geist Mono eyebrows inside a
product.
