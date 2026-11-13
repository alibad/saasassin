#!/usr/bin/env node
/**
 * Sync the generated per-product repositories (github.com/alibad/saasassin-<slug>) from this
 * monorepo, which stays the single source of truth.
 *
 *   node scripts/publish-products.mjs [--commit | --push] [--dir <path>] [--allow-dirty] [slug...]
 *
 * For each product (all ten by default) it uses a local clone at ../saasassin-products/<slug>,
 * next to the main checkout (override with --dir or SAASASSIN_PRODUCTS_DIR), cloning
 * https://github.com/alibad/saasassin-<slug>.git when the clone is missing.
 *
 *   (default)  dry run: export into a temporary directory and print what would change against
 *              the clone's origin/main (or HEAD). Nothing in the clone is modified.
 *   --commit   export into the clone and commit "sync: saasassin@<short-sha>" when something
 *              changed. Nothing is pushed.
 *   --push     --commit, then push the branch to origin. Never force-pushes.
 *
 * --commit and --push require a clean monorepo working tree (the commit names the monorepo
 * commit it was generated from; --allow-dirty overrides) and a clean clone that fast-forwards to
 * origin/main.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { exportProduct, GITHUB_OWNER, loadFleetApps, repoRoot } from "./export-product.mjs";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const BRANCH = "main";

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    // Fail instead of waiting for credentials when a repository is missing or private.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
  }).trim();
}

function tryGit(cwd, args, options) {
  try {
    return git(cwd, args, options);
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const options = { mode: "dry-run", dir: process.env.SAASASSIN_PRODUCTS_DIR ?? null, allowDirty: false, slugs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--push") options.mode = "push";
    else if (arg === "--commit") options.mode = options.mode === "push" ? "push" : "commit";
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--dir") options.dir = argv[(index += 1)];
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`);
    else options.slugs.push(arg);
  }
  return options;
}

/** ../saasassin-products next to the main checkout (not next to a linked worktree). */
function defaultProductsDir() {
  const commonDir = git(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return path.resolve(path.dirname(commonDir), "..", "saasassin-products");
}

const repoUrl = (slug) => `https://github.com/${GITHUB_OWNER}/saasassin-${slug}.git`;

function sameRepository(url, slug) {
  const normalized = url.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "").toLowerCase();
  return normalized === `https://github.com/${GITHUB_OWNER}/saasassin-${slug}`.toLowerCase();
}

/** Returns the clone directory, cloning when missing; null when the remote cannot be cloned. */
function ensureClone(productsDir, slug) {
  const clone = path.join(productsDir, slug);
  if (fs.existsSync(path.join(clone, ".git"))) {
    const origin = tryGit(clone, ["config", "--get", "remote.origin.url"]);
    if (!origin || !sameRepository(origin, slug)) {
      throw new Error(`${clone} is not a clone of ${repoUrl(slug)} (origin: ${origin ?? "none"})`);
    }
    return clone;
  }
  if (fs.existsSync(clone) && fs.readdirSync(clone).length) {
    throw new Error(`${clone} exists but is not a git clone; move it aside first`);
  }
  fs.mkdirSync(productsDir, { recursive: true });
  try {
    git(productsDir, ["clone", "--quiet", repoUrl(slug), slug]);
    return clone;
  } catch (error) {
    fs.rmSync(clone, { recursive: true, force: true });
    const reason = String(error.stderr ?? error.message).trim().split("\n").pop();
    return { missing: true, reason };
  }
}

function describeChanges(nameStatus, limit = 25) {
  const lines = nameStatus ? nameStatus.split("\n") : [];
  const counts = { A: 0, M: 0, D: 0 };
  for (const line of lines) counts[line[0]] = (counts[line[0]] ?? 0) + 1;
  const summary = `${lines.length} file(s): ${counts.A} added, ${counts.M} modified, ${counts.D} deleted`;
  if (!limit) return summary;
  const shown = lines.slice(0, limit).map((line) => `      ${line}`);
  if (lines.length > limit) shown.push(`      ... and ${lines.length - limit} more`);
  return [summary, ...shown].join("\n");
}

/** Export into a temp tree and diff it against the clone with a throwaway index. */
async function dryRun(slug, clone) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), `saasassin-${slug}-`));
  try {
    const tree = path.join(temp, "tree");
    const result = await exportProduct({ slug, outDir: tree });
    let gitDir = clone ? path.join(clone, ".git") : null;
    if (!gitDir) {
      gitDir = path.join(temp, "empty.git");
      git(temp, ["init", "--quiet", "--bare", gitDir]);
    }
    const base =
      (clone && (tryGit(clone, ["rev-parse", "--verify", "--quiet", `origin/${BRANCH}`]) ??
        tryGit(clone, ["rev-parse", "--verify", "--quiet", "HEAD"]))) || EMPTY_TREE;
    // A throwaway index and object store (reading the clone's objects as alternates) leave the
    // clone untouched.
    const objects = path.join(temp, "objects");
    fs.mkdirSync(objects);
    const env = {
      ...process.env,
      GIT_INDEX_FILE: path.join(temp, "index"),
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(gitDir, "objects"),
    };
    const run = (args) => git(tree, ["--git-dir", gitDir, "--work-tree", tree, ...args], { env });
    run(["read-tree", base]);
    run(["add", "-A"]);
    const changes = run(["diff", "--cached", "--name-status", "--no-renames", base]);
    return { result, changes, base };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function commitSync(slug, clone, { sha, fullSha, push }) {
  if (git(clone, ["status", "--porcelain"])) {
    throw new Error(`${clone} has uncommitted changes; commit or discard them first`);
  }
  const head = tryGit(clone, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  if (!head) git(clone, ["symbolic-ref", "HEAD", `refs/heads/${BRANCH}`]);
  else {
    const branch = git(clone, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch !== BRANCH) throw new Error(`${clone} is on branch ${branch}, expected ${BRANCH}`);
  }
  git(clone, ["fetch", "--quiet", "origin"]);
  if (tryGit(clone, ["rev-parse", "--verify", "--quiet", `origin/${BRANCH}`])) {
    git(clone, ["merge", "--quiet", "--ff-only", `origin/${BRANCH}`]);
  }

  const result = await exportProduct({ slug, outDir: clone });
  git(clone, ["add", "-A"]);
  const changes = git(clone, ["diff", "--cached", "--name-status", "--no-renames", ...(head ? ["HEAD"] : [EMPTY_TREE])]);
  if (!changes) return { result, changes, committed: false, pushed: false };

  const message = [
    `sync: saasassin@${sha}`,
    "",
    `Generated from https://github.com/${GITHUB_OWNER}/saasassin/commit/${fullSha}`,
    "by scripts/export-product.mjs.",
  ].join("\n");
  git(clone, ["commit", "--quiet", "-m", message]);
  if (push) git(clone, ["push", "--quiet", "origin", `${BRANCH}:${BRANCH}`]);
  return { result, changes, committed: true, pushed: push };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/publish-products.mjs [--commit | --push] [--dir <path>] [--allow-dirty] [slug...]");
    return;
  }
  const apps = await loadFleetApps();
  const known = apps.map((app) => app.slug);
  const slugs = options.slugs.length ? options.slugs : known;
  const unknown = slugs.filter((slug) => !known.includes(slug));
  if (unknown.length) throw new Error(`Unknown product(s): ${unknown.join(", ")}. Products: ${known.join(", ")}`);

  const sha = git(repoRoot, ["rev-parse", "--short", "HEAD"]);
  const fullSha = git(repoRoot, ["rev-parse", "HEAD"]);
  const dirty = git(repoRoot, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty && options.mode !== "dry-run" && !options.allowDirty) {
    throw new Error("The monorepo has uncommitted changes; commit them first so the sync names a real commit (or pass --allow-dirty).");
  }
  const productsDir = path.resolve(options.dir ?? defaultProductsDir());
  console.log(`saasassin@${sha}${dirty ? " (with uncommitted changes)" : ""} -> ${productsDir} [${options.mode}]`);

  let failures = 0;
  for (const slug of slugs) {
    try {
      const clone = ensureClone(productsDir, slug);
      if (clone?.missing) {
        if (options.mode !== "dry-run") {
          throw new Error(`cannot clone ${repoUrl(slug)} (${clone.reason}); create the empty repository first`);
        }
        const { changes } = await dryRun(slug, null);
        console.log(`- ${slug}: ${repoUrl(slug)} not reachable (${clone.reason}); would publish as the first commit\n    ${describeChanges(changes, 0)}`);
        continue;
      }
      if (options.mode === "dry-run") {
        const { changes, base } = await dryRun(slug, clone);
        const against = base === EMPTY_TREE ? "empty repository" : base.slice(0, 7);
        console.log(changes ? `- ${slug}: would commit against ${against}\n    ${describeChanges(changes)}` : `- ${slug}: up to date`);
        continue;
      }
      const outcome = await commitSync(slug, clone, { sha, fullSha, push: options.mode === "push" });
      if (!outcome.committed) console.log(`- ${slug}: up to date`);
      else {
        console.log(`- ${slug}: committed sync: saasassin@${sha}${outcome.pushed ? " and pushed" : " (not pushed)"}\n    ${describeChanges(outcome.changes)}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`- ${slug}: FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (failures) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
