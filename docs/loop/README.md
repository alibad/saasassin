# The daily SaaSassin loop

Once a day an unattended Claude run moves the focus product one slice closer to its
competitor, ships it, and turns it into marketing material. The focus is set in
[`focus.md`](focus.md); history is in [`log.md`](log.md). This file is the runbook the
scheduled run follows. Improve it when a run teaches you something.

Owner decisions this runbook implements (2026-11-13): AGPL-3.0 for every product;
Lattice is the first competitor; **ship automatically when every check passes**; each
product is also published as its own repository `alibad/saasassin-<product>`.

## 0. Preflight (5 min)

1. Work in a dedicated worktree so the owner's checkout is never touched:
   `git -C /Users/alibadereddin/Code/GitHub/saasassin fetch origin`, then
   `git -C /Users/alibadereddin/Code/GitHub/saasassin worktree add -B loop/<YYYY-MM-DD> .claude/worktrees/loop-<YYYY-MM-DD> origin/main`
   and do everything below inside that worktree.
2. `cp /Users/alibadereddin/Code/GitHub/saasassin/.env.local .env.local && pnpm install --frozen-lockfile && pnpm exec next typegen`.
3. Read `AGENTS.md`, `CONTRIBUTING.md`, `focus.md`, the last three `log.md` entries,
   the focus parity map and story, and the product's `docs/fleet/status/<product>.md`.
4. If yesterday's run left an unmerged `loop/*` branch, read its log entry first: finish
   it if it is close, otherwise note it and move on.

## 1. Refresh the competitor picture (≤ 15 min)

Check the competitor's changelog, "what's new" and help-center updates for anything
launched since the parity map's last update. Add rows (with source URL and access date)
and re-rank. Paraphrase; never copy text, screenshots, logos or trade dress.

## 2. Pick today's slice and write the vision

First clear any `Open` rows in [`bugs.md`](bugs.md) for the focus product (several
small bugs can share one day). Otherwise take the highest-ranked row in "Next slices" that is not done. It must be shippable
today: if it isn't, split it and ship the first part. Write the log entry's opening:
the slice id, the user problem, how the competitor handles it, how we will do it
better (open data, inspectable permissions, export, honesty), and acceptance criteria.

## 3. Build the vertical slice

UI + API + server authorization (session → membership/role → zod → write → audit
event) + included in the export + unit tests for pure logic + the product's emulator
spec extended to cover it. Follow `docs/fleet/architecture.md` §4–§7 and §6b. Every
product has its own brand (`docs/brand/products.md`, "In the code"): use the brand tokens and
fonts, never the saasassin.net look (`--ink`, `--paper`, `--lime`, mono eyebrows) or the word
"SaaSassin" inside a product. People always appear with `UserAvatar`; team, invitations and
account settings use the shared `src/components/account/` components. shadcn/ui only;
never native `<select>`, `confirm()`, `alert()`, `prompt()`. No composite Firestore
indexes unless they are added to `firestore.indexes.json` and deployed. No new npm
dependencies — if one is truly needed, log a proposal instead.

## 4. Verify — all must pass or nothing ships

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:rules            # whenever firestore.rules changed
# the focus product's emulator suite (Java 21+ JDK first on PATH):
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-23.jdk/Contents/Home PATH="$JAVA_HOME/bin:$PATH" \
  pnpm exec firebase emulators:exec --only firestore --project demo-saasassin "<product suite command from README.md>"
pnpm build
```

Use a non-default emulator port config (uncommitted) if 8080 is busy. If anything
fails and you cannot fix it properly, **do not ship**: commit the work to the
`loop/<date>` branch, push that branch, log the blocker, and stop.

## 5. Ship

1. Update the parity row(s) to `have`/`partial`, `docs/fleet/status/<product>.md`,
   the compare page data if it has a parity section, and `todo/<YYYY-MM-DD>.md`
   (impact, not file lists).
2. Commit (`feat(<product>): <user-facing impact> (loop <date>)`, ending with the
   `Co-Authored-By` line from the session's attribution instructions), rebase onto
   `origin/main`, re-run `pnpm build` if the rebase brought changes, then
   `git push origin HEAD:main`. A push to `main` deploys production. Never force-push.
3. If `firestore.rules` or `firestore.indexes.json` changed, deploy them first:
   `pnpm exec firebase deploy --only firestore:rules,firestore:indexes --project saasassin-net`.
4. Wait for the Vercel production deployment of that commit to be READY, then smoke
   test: the product root and sign-in return 200, its APIs return 401 signed out, and
   there are no new runtime errors. If production breaks, `git revert` the commit,
   push, and log it.
5. Publish the product repository once it exists:
   `node scripts/publish-products.mjs --push <product>`.

## 6. Tell the story (drafts only — never publish)

Write `marketing/drafts/<YYYY-MM-DD>.md` with: a "shipped today" changelog blurb, a
LinkedIn post, an X/Bluesky post, and — when the parity row is marked "showcase" — a
30–45 s clip script. For showcase slices, record the clip from the real product with
demo data against local Auth/Firestore emulators (never production accounts) using the
`product-demo-video` skill; save media under
`/Users/alibadereddin/Code/GitHub/saasassin/screenshots/marketing/` (the owner's
checkout, gitignored — not the loop worktree, which is removed after the run).
Claims must be true today and match `story.md`'s "claims we must not make" list.
Uploading videos or posting anywhere is the owner's decision: list what is ready.

On Fridays, also draft one SEO article from the story's article list and a weekly
recap video script.

## 7. Report

Append the log entry (slice, result, checks, commit, deploy id, smoke test, drafts,
blockers), remove the loop worktree if everything shipped, and end with a three-line
summary: what shipped, what's next, what needs the owner.

## Never

- push to `main` with any failing check, force-push, or rewrite history;
- touch production data or sign in to production with any account;
- post, upload, email or message anyone; change billing, auth providers or DNS;
- copy a competitor's code, text, screenshots or logos, or make a claim we can't show;
- switch the focus competitor without the owner.
