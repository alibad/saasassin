#!/usr/bin/env node
/**
 * Export one SaaSassin product as a standalone, self-hostable Next.js repository.
 *
 *   node scripts/export-product.mjs <slug> <outDir>
 *
 * The monorepo stays the single source of truth. Instead of a hand-maintained file list, the
 * exporter traces the import graph (`@/` and relative imports, static and dynamic, plus CSS
 * `@import`s) from the product's routes, the root layout, the proxy and client instrumentation.
 * It adds the tests that exercise only exported code, copies the configs and public assets that
 * code needs, and generates the files a standalone repository needs: package.json, next.config.ts
 * (defaulting STANDALONE_PRODUCT to the product), firestore.rules, .env.example, a minimal root
 * page, docs/STATUS.md and README.md (from scripts/product-readme.template.md).
 *
 * Lines containing `standalone:omit` are dropped from exported files; the root layout uses it to
 * leave out the parent site's header and footer.
 *
 * The output directory is mirrored: everything except .git, node_modules, .next, .vercel and
 * local env files is replaced, so files deleted or no longer reachable in the monorepo disappear
 * from the product repository too. It refuses to write inside this repository, or into a
 * non-empty directory that is neither a git checkout nor a previous export of the same product.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const GITHUB_OWNER = "alibad";
export const MONOREPO_URL = `https://github.com/${GITHUB_OWNER}/saasassin`;

const SITE_URL = "https://saasassin.net";
const OMIT_MARKER = "standalone:omit";
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx"];
const RESOLVE_EXTENSIONS = [...SOURCE_EXTENSIONS, ".json", ".css"];
const TEXT_EXTENSIONS = new Set([...RESOLVE_EXTENSIONS, ".md", ".txt", ".svg", ".yaml", ".yml", ".rules", ".csv"]);
const PRESERVED_OUTPUT_ENTRIES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.test.local",
  "next-env.d.ts",
]);
/** Next.js metadata files that live in src/app and are served by convention, not imported. */
const APP_METADATA_FILE = /^(favicon\.ico|(icon|apple-icon|opengraph-image|twitter-image)\d*\.(png|jpe?g|gif|svg|ico))$/;
/** Copied unchanged when present. */
const VERBATIM_FILES = [
  "tsconfig.json",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "components.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "firebase.json",
  "firestore.indexes.json",
  "vitest.config.mjs",
  ".gitignore",
  "LICENSE",
  "SECURITY.md",
  "AGENTS.md",
  "CLAUDE.md",
];
/** Env vars read by exported code that a standalone deployment never needs to set. */
const IGNORED_ENV = new Set(["NODE_ENV", "FLEET_SUBDOMAINS_ENABLED"]);

/* ------------------------------------------------------------------------------------------ */
/* Product registry                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Loads `fleetApps` from src/lib/fleet/apps.ts (transpiled in memory; it has no runtime imports). */
export async function loadFleetApps() {
  const source = fs.readFileSync(path.join(repoRoot, "src/lib/fleet/apps.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const registry = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
  return registry.fleetApps;
}

function productSpec(app, apps) {
  const isPerformance = app.slug === "performance";
  return {
    app,
    isPerformance,
    appRoot: isPerformance ? "/lattice" : `/apps/${app.slug}`,
    // /api/fleet/performance/* (profile, photo, avatar) uses Performance's own session, so it
    // ships with Performance and never with the other products.
    routeDirs: isPerformance
      ? ["src/app/lattice", "src/app/api/lattice", "src/app/api/fleet/performance"]
      : [`src/app/apps/${app.slug}`, `src/app/api/${app.slug}`, "src/app/api/fleet"],
    routeExcludes: isPerformance ? [] : ["src/app/api/fleet/performance/"],
    testPrefix: isPerformance ? "lattice" : app.slug,
    emulatorConfig: isPerformance ? "vitest.lattice.config.mjs" : "vitest.emulator.config.mjs",
    rulesTest: isPerformance ? "tests/firestore.rules.test.ts" : "tests/fleet-products.rules.test.ts",
    forbidden: forbiddenPatterns(app, apps),
  };
}

/** Parent-site and other-product code that must never reach a product repository. */
function forbiddenPatterns(app, apps) {
  const patterns = [
    /^src\/app\/(catalog|roadmap|ops|logo-lab|missions|targets)\//,
    /^src\/app\/apps\/page\.tsx$/,
    /^src\/app\/api\/(catalog|interest|ops)\//,
    /^src\/data\//,
    /^src\/lib\/(data|ops-auth|ops-data)\.ts$/,
    /^src\/components\/(site-header|site-footer|catalog-explorer|interest-form|mission-|ops-|target-card)/,
    /^public\/brand\/variations\//,
    /^docs\/(roadmap|knowledge-base|missions|loop)/,
  ];
  for (const other of apps) {
    if (other.slug === app.slug) continue;
    if (other.slug === "performance") {
      patterns.push(/^src\/(app\/lattice|app\/api\/lattice|lib\/lattice)\//, /^src\/components\/lattice-/, /^tests\/lattice[-.]/);
    } else {
      const slug = other.slug;
      patterns.push(
        new RegExp(`^src/(app/apps/${slug}|app/api/${slug}|lib/${slug}|components/${slug})/`),
        new RegExp(`^tests/${slug}[-.]`),
      );
    }
  }
  return patterns;
}

/* ------------------------------------------------------------------------------------------ */
/* Import graph                                                                                */
/* ------------------------------------------------------------------------------------------ */

const toRel = (absolute) => path.relative(repoRoot, absolute).split(path.sep).join("/");
const exists = (rel) => fs.existsSync(path.join(repoRoot, rel));
const readText = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

function stripOmitted(text) {
  if (!text.includes(OMIT_MARKER)) return text;
  return text
    .split("\n")
    .filter((line) => !line.includes(OMIT_MARKER))
    .join("\n");
}

function readSource(rel) {
  if (!TEXT_EXTENSIONS.has(path.extname(rel))) return fs.readFileSync(path.join(repoRoot, rel));
  return stripOmitted(readText(rel));
}

function localSpecifiers(rel, text) {
  const extension = path.extname(rel);
  if (extension === ".css") {
    const imports = [...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map((match) => match[1]);
    const urls = [...text.matchAll(/url\(\s*["']?(\.{1,2}\/[^"')]+)["']?\s*\)/g)].map((match) => match[1]);
    return [...imports, ...urls];
  }
  if (SOURCE_EXTENSIONS.includes(extension)) {
    return ts.preProcessFile(text, true, true).importedFiles.map((file) => file.fileName);
  }
  return [];
}

function resolveSpecifier(fromRel, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = path.resolve(repoRoot, path.dirname(fromRel), specifier);
  } else return null; // a package import, satisfied by package.json

  const candidates = [
    base,
    ...RESOLVE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...RESOLVE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!found) throw new Error(`${fromRel}: cannot resolve import "${specifier}"`);
  return toRel(found);
}

/** Adds `entries` and everything they import to `graph` (rel path -> { content, from }). */
function trace(entries, graph, from = null) {
  const queue = entries.map((rel) => [rel, from]);
  while (queue.length) {
    const [rel, parent] = queue.shift();
    if (graph.has(rel)) continue;
    const content = readSource(rel);
    graph.set(rel, { content, from: parent });
    if (typeof content !== "string") continue;
    for (const specifier of localSpecifiers(rel, content)) {
      const dependency = resolveSpecifier(rel, specifier);
      if (dependency && !graph.has(dependency)) queue.push([dependency, rel]);
    }
  }
  return graph;
}

function importChain(graph, rel) {
  const chain = [];
  for (let current = rel; current; current = graph.get(current)?.from ?? null) chain.unshift(current);
  return chain.join(" -> ");
}

function walk(relDir) {
  const absolute = path.join(repoRoot, relDir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const rel = `${relDir}/${entry.name}`;
    return entry.isDirectory() ? walk(rel) : [rel];
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Selection                                                                                   */
/* ------------------------------------------------------------------------------------------ */

function entryFiles(spec) {
  const routeFiles = spec.routeDirs
    .flatMap(walk)
    .filter((rel) => !spec.routeExcludes.some((prefix) => rel.startsWith(prefix)));
  if (!routeFiles.length) throw new Error(`No route files found for ${spec.app.slug} in ${spec.routeDirs.join(", ")}`);
  const conventions = ["src/app/layout.tsx", "src/proxy.ts", "src/instrumentation.ts", "src/instrumentation-client.ts"];
  const metadata = fs
    .readdirSync(path.join(repoRoot, "src/app"))
    .filter((name) => APP_METADATA_FILE.test(name))
    .map((name) => `src/app/${name}`);
  return [...conventions.filter(exists), ...metadata, ...routeFiles];
}

/**
 * Product-named tests (`tests/<slug>-*.ts`, `tests/<slug>.emulator.spec.ts`) are entries in their
 * own right. Any other test is included when everything it imports from src is already exported
 * (e.g. the routing tests). The Firestore rules test that matches the generated rules is added
 * explicitly because it reads firestore.rules from disk rather than importing it.
 */
function selectTests(spec, graph) {
  const named = new RegExp(`^tests/${spec.testPrefix}[-.]`);
  const candidates = fs
    .readdirSync(path.join(repoRoot, "tests"))
    .filter((name) => /\.(test|spec)\.ts$/.test(name) && !name.endsWith(".rules.test.ts"))
    .map((name) => `tests/${name}`)
    .sort();
  const before = new Set(graph.keys());
  const tests = [];

  for (const test of candidates.filter((rel) => named.test(rel))) {
    trace([test], graph);
    tests.push(test);
  }
  const addedByTests = [...graph.keys()].filter((rel) => !before.has(rel) && rel.startsWith("src/"));

  for (const test of candidates.filter((rel) => !named.test(rel))) {
    const closure = trace([test], new Map());
    const sourceDependencies = [...closure.keys()].filter((rel) => rel !== test && !rel.startsWith("tests/"));
    if (!sourceDependencies.length || !sourceDependencies.every((rel) => graph.has(rel))) continue;
    for (const [rel, node] of closure) if (!graph.has(rel)) graph.set(rel, node);
    tests.push(test);
  }

  let rulesTest = null;
  if (exists(spec.rulesTest)) {
    trace([spec.rulesTest], graph);
    rulesTest = spec.rulesTest;
    tests.push(spec.rulesTest);
  }

  for (const test of tests) {
    const content = graph.get(test).content;
    for (const match of content.matchAll(/fixtures\/([\w.-]+)/g)) {
      const fixture = `tests/fixtures/${match[1]}`;
      if (exists(fixture)) trace([fixture], graph, test);
    }
  }

  const emulatorSpecs = tests.filter((rel) => rel.endsWith(".emulator.spec.ts"));
  return { tests, rulesTest, emulatorSpecs, addedByTests };
}

/** Files in public/ referenced by an absolute path string ("/brand/mark.png") in exported code. */
function publicAssets(graph) {
  const assets = new Set();
  for (const { content } of graph.values()) {
    if (typeof content !== "string") continue;
    for (const match of content.matchAll(/["'`(]\/([\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]+)(?=["'`)?#])/g)) {
      const rel = `public/${match[1]}`;
      if (exists(rel)) assets.add(rel);
    }
  }
  return [...assets].sort();
}

/** Paths like "./tests/stubs/server-only.ts" referenced from config files (vitest aliases). */
function configReferences(rel) {
  return [...readText(rel).matchAll(/["']\.\/((?:tests|src|scripts)\/[\w/.-]+)["']/g)]
    .map((match) => match[1])
    .filter(exists);
}

/* ------------------------------------------------------------------------------------------ */
/* Generated files                                                                             */
/* ------------------------------------------------------------------------------------------ */

function buildPackageJson(spec, { rulesTest, emulatorSpecs }) {
  const base = JSON.parse(readText("package.json"));
  const { app } = spec;
  const repo = `https://github.com/${GITHUB_OWNER}/saasassin-${app.slug}`;
  const scripts = {
    dev: base.scripts.dev,
    build: base.scripts.build,
    start: base.scripts.start,
    lint: base.scripts.lint,
    // A fresh clone has no next-env.d.ts or route types until Next generates them.
    typecheck: `next typegen && ${base.scripts.typecheck}`,
    test: base.scripts.test,
  };
  if (rulesTest) scripts["test:rules"] = base.scripts["test:rules"];
  if (emulatorSpecs.length) {
    scripts["test:emulator"] =
      // The Auth emulator lets the shared team spec sign real (emulated) users up and verify them.
      `firebase emulators:exec --only firestore,auth --project demo-saasassin "pnpm exec vitest run --config ${spec.emulatorConfig}"`;
  }
  if (base.scripts["firebase:emulators"]) scripts["firebase:emulators"] = base.scripts["firebase:emulators"];

  const pkg = {
    name: `saasassin-${app.slug}`,
    version: base.version,
    private: true,
    description: `SaaSassin ${app.productName}: a free, open-source ${app.targetName} alternative.`,
    license: base.license ?? "AGPL-3.0-only",
    homepage: `https://${app.subdomain}.saasassin.net`,
    repository: { type: "git", url: `git+${repo}.git` },
    bugs: { url: `${repo}/issues` },
    scripts,
  };
  // Dependencies stay identical so the copied pnpm-lock.yaml remains valid with --frozen-lockfile.
  for (const [key, value] of Object.entries(base)) if (!(key in pkg)) pkg[key] = value;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function buildNextConfig(spec) {
  const source = readText("next.config.ts");
  const anchor = "const nextConfig: NextConfig = {\n";
  if (!source.includes(anchor)) throw new Error("next.config.ts: cannot find the nextConfig object literal");
  return source.replace(
    anchor,
    `${anchor}  // This repository serves SaaSassin ${spec.app.productName} at the root of every host (src/proxy.ts).\n` +
      "  // Inlined at build time, so a fresh deployment works without setting STANDALONE_PRODUCT.\n" +
      `  env: { STANDALONE_PRODUCT: process.env.STANDALONE_PRODUCT || "${spec.app.slug}" },\n`,
  );
}

function buildFirestoreRules(spec) {
  const source = readText("firestore.rules");
  const productsBlock = /\n((?:[ \t]*\/\/[^\n]*\n)*)([ \t]*)match \/products\/\{product\}\/\{document=\*\*\} \{\n[\s\S]*?\n\2\}\n/;
  const match = source.match(productsBlock);
  if (!match) throw new Error("firestore.rules: cannot find the products/{product} block");
  if (spec.isPerformance) return source.replace(productsBlock, "");

  return [
    "rules_version = '2';",
    "",
    "service cloud.firestore {",
    "  match /databases/{database}/documents {",
    match[0].replace(/^\n/, "").trimEnd(),
    "",
    "    match /{document=**} {",
    "      allow read, write: if false;",
    "    }",
    "  }",
    "}",
    "",
  ].join("\n");
}

function envGroups(slug) {
  return [
    {
      names: ["STANDALONE_PRODUCT"],
      comment: [
        "This repository serves one product at the root of every host. next.config.ts defaults",
        `this to "${slug}", so set it only to override the default.`,
      ],
      values: { STANDALONE_PRODUCT: slug },
    },
    {
      names: ["NEXT_PUBLIC_SITE_URL"],
      comment: ["Public URL of this deployment, used for page metadata."],
      values: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
    },
    {
      names: [
        "NEXT_PUBLIC_FIREBASE_API_KEY",
        "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
        "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
        "NEXT_PUBLIC_FIREBASE_APP_ID",
      ],
      comment: [
        "Firebase Web SDK configuration (Firebase console > Project settings > Your apps > Web app).",
        "These identifiers are public by design; data stays protected by Firebase Auth, server",
        "authorization and Firestore rules.",
      ],
      values: {
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "your-project-id.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "your-project-id",
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "your-project-id.firebasestorage.app",
      },
    },
    {
      names: ["NEXT_PUBLIC_FLEET_AUTH_PROVIDERS", "NEXT_PUBLIC_FLEET_MFA_TOTP"],
      comment: [
        "Sign-in options. Google and email/password are always shown. Add microsoft, github or apple",
        "(comma separated) only after enabling that provider in Firebase Authentication. Set",
        "NEXT_PUBLIC_FLEET_MFA_TOTP=enabled once TOTP multi-factor is switched on for the project.",
      ],
      values: { NEXT_PUBLIC_FLEET_AUTH_PROVIDERS: "google", NEXT_PUBLIC_FLEET_MFA_TOTP: "" },
    },
    {
      names: ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
      comment: [
        "Server-only Firebase Admin credentials from a service-account key (Project settings >",
        "Service accounts). Never prefix these with NEXT_PUBLIC_.",
      ],
      values: {
        FIREBASE_PROJECT_ID: "your-project-id",
        FIREBASE_PRIVATE_KEY: '"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"',
      },
    },
    {
      names: ["GOOGLE_APPLICATION_CREDENTIALS"],
      comment: [
        "Local alternative to FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY: an absolute path to the",
        "service-account JSON key, stored outside the repository.",
      ],
      values: {},
    },
    {
      names: ["FIREBASE_STORAGE_BUCKET"],
      comment: ["Optional Firebase Storage bucket for the Admin SDK."],
      values: {},
    },
    {
      names: ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST"],
      comment: ["Optional, cookieless product analytics. Leave the token empty to turn analytics off."],
      values: { NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" },
    },
  ];
}

/** Env vars read via `process.env.NAME` in exported, non-test code, with the file that reads each. */
function usedEnv(graph) {
  const used = new Map();
  for (const [rel, { content }] of graph) {
    if (typeof content !== "string" || rel.startsWith("tests/")) continue;
    for (const match of content.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!IGNORED_ENV.has(match[1]) && !used.has(match[1])) used.set(match[1], rel);
    }
  }
  return used;
}

function buildEnvExample(spec, used) {
  const lines = [`# SaaSassin ${spec.app.productName}. Copy to .env.local and fill in your own Firebase project.`, ""];
  const documented = new Set();
  const names = [];
  for (const group of envGroups(spec.app.slug)) {
    const present = group.names.filter((name) => name === "STANDALONE_PRODUCT" || used.has(name));
    if (!present.length) continue;
    lines.push(...group.comment.map((line) => `# ${line}`));
    for (const name of present) {
      lines.push(`${name}=${group.values[name] ?? ""}`);
      documented.add(name);
      names.push(name);
    }
    lines.push("");
  }
  for (const [name, rel] of used) {
    if (documented.has(name)) continue;
    lines.push(`# Read by ${rel}.`, `${name}=`, "");
    names.push(name);
  }
  return { text: `${lines.join("\n").trimEnd()}\n`, names };
}

function buildRootPage(spec) {
  return [
    'import { redirect } from "next/navigation";',
    "",
    `// src/proxy.ts serves SaaSassin ${spec.app.productName} at "/" whenever STANDALONE_PRODUCT is set (next.config.ts`,
    "// sets it by default). This page only renders if it is not, and sends visitors to the product.",
    "export default function Home() {",
    `  redirect("${spec.appRoot}");`,
    "}",
    "",
  ].join("\n");
}

/** The "what people can do" sections of a status file, without dev-only commands and notes. */
function extractCapabilities(status, slug) {
  const sections = [];
  let current = null;
  let fenced = false;
  for (const line of status.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^## /.test(line)) {
      current = { heading: line.slice(3).trim(), lines: [] };
      sections.push(current);
    } else if (current) current.lines.push(line);
  }
  // "What users can do now" first, then any "what changed for users" round notes.
  const canDo = (section) => /\bwhat\b.*\bcan\b/i.test(section.heading);
  const changed = (section) => !canDo(section) && /\bwhat\b.*\bchanged\b/i.test(section.heading);
  const picked = [...sections.filter(canDo), ...sections.filter(changed)];
  if (!picked.length) {
    throw new Error(`docs/fleet/status/${slug}.md has no "What ... can do" section for the README`);
  }

  const devOnly = /JAVA_HOME|JENV_VERSION|\.emulator-[a-z]+\.json|uncommitted/;
  const render = (section) => {
    const blocks = [];
    let block = [];
    let inFence = false;
    for (const line of section.lines) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (line.trim() === "") {
        if (block.length) blocks.push(block);
        block = [];
      } else {
        // Demote sub-headings under the README section; drop "new in this round" markers.
        block.push(
          line
            .replace(/^(#{3,5}) /, "#$1 ")
            .replace(/\*\*New:\*\*\s+(\S)/g, (_, first) => first.toUpperCase())
            .replace(/ \(new\)/gi, ""),
        );
      }
    }
    if (block.length) blocks.push(block);
    const kept = [];
    for (const lines of blocks.filter((candidate) => !devOnly.test(candidate.join("\n")))) {
      const previous = kept.at(-1);
      // Rejoin a table that a blank line split in two (the second half would not render).
      if (previous?.at(-1).startsWith("|") && lines[0].startsWith("|") && !/^\|[\s-:|]+\|$/.test(lines[1] ?? "")) {
        previous.push(...lines);
      } else kept.push([...lines]);
    }
    return kept.map((lines) => lines.join("\n")).join("\n\n");
  };

  if (picked.length === 1) return render(picked[0]);
  return picked.map((section) => `### ${section.heading}\n\n${render(section)}`).join("\n\n");
}

function lowerFirst(text) {
  return /^[A-Z][a-z]/.test(text) ? `${text[0].toLowerCase()}${text.slice(1)}` : text;
}

function renderTemplate(template, values) {
  const output = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`README template: no value for {{${key}}}`);
    return values[key];
  });
  return output;
}

function buildReadme(spec, { emulatorSpecs, envNames, capabilities }) {
  const { app } = spec;
  const repo = `https://github.com/${GITHUB_OWNER}/saasassin-${app.slug}`;
  const deployEnv = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
  ].filter((name) => envNames.includes(name));
  const deployParams = new URLSearchParams({
    "repository-url": repo,
    "project-name": `saasassin-${app.slug}`,
    "repository-name": `saasassin-${app.slug}`,
    env: deployEnv.join(","),
    envDescription: "Firebase web app config and service-account credentials (see the README)",
    envLink: `${repo}#1-create-a-firebase-project`,
  });
  const rulesSummary = spec.isPerformance
    ? "`firestore.rules` limits browser reads to organization members with the right role and " +
      "permission, and server-owned records (nominations, calibrations, packets, goals, feedback, " +
      "one-to-ones) can only be written by the server."
    : "`firestore.rules` denies all browser access to product data: every read and write goes " +
      "through the server routes, which check the session, tenant membership and role with the " +
      "Firebase Admin SDK.";

  const briefUrl = spec.isPerformance ? `${SITE_URL}/targets/lattice/research` : `${SITE_URL}/targets/${app.targetSlug}`;
  return renderTemplate(readText("scripts/product-readme.template.md"), {
    productName: app.productName,
    targetName: app.targetName,
    targetSlug: app.targetSlug,
    slug: app.slug,
    subdomain: app.subdomain,
    promise: app.promise,
    category: app.category,
    audienceLower: lowerFirst(app.audience),
    hostedUrl: `https://${app.subdomain}.saasassin.net`,
    briefUrl,
    briefLabel: briefUrl.replace(/^https:\/\//, ""),
    interestUrl: `${SITE_URL}/targets/${app.targetSlug}#interest`,
    deployUrl: `https://vercel.com/new/clone?${deployParams.toString()}`,
    appRoot: spec.appRoot,
    capabilities,
    rulesSummary,
    emulatorCommand: emulatorSpecs.length
      ? "pnpm test:emulator   # the golden workflow against a real Firestore emulator"
      : "",
  });
}

function buildStatus(spec) {
  const source = `docs/fleet/status/${spec.app.slug}.md`;
  if (!exists(source)) throw new Error(`Missing ${source}`);
  return (
    `> Synced from \`${source}\` in the [SaaSassin monorepo](${MONOREPO_URL}). File paths match this ` +
    "repository.\n\n" +
    readText(source)
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Output                                                                                      */
/* ------------------------------------------------------------------------------------------ */

function prepareOutDir(outDir, slug) {
  const relative = path.relative(repoRoot, outDir);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`Refusing to export into ${outDir}: it is inside this repository.`);
  }
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
    return;
  }
  const entries = fs.readdirSync(outDir);
  const packagePath = path.join(outDir, "package.json");
  const packageName = fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf8")).name : null;
  const isGitCheckout = entries.includes(".git");
  if (packageName && packageName !== `saasassin-${slug}`) {
    throw new Error(`Refusing to overwrite ${outDir}: its package.json belongs to "${packageName}".`);
  }
  if (entries.length && !isGitCheckout && !packageName) {
    throw new Error(`Refusing to overwrite ${outDir}: not empty, not a git checkout and not a saasassin-${slug} export.`);
  }
  for (const entry of entries) {
    if (!PRESERVED_OUTPUT_ENTRIES.has(entry)) fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
  }
}

/**
 * Exports `slug` into `outDir`. Returns what was written so callers (publish-products.mjs) can
 * report it.
 */
export async function exportProduct({ slug, outDir }) {
  const apps = await loadFleetApps();
  const app = apps.find((candidate) => candidate.slug === slug);
  if (!app) throw new Error(`Unknown product "${slug}". Products: ${apps.map((candidate) => candidate.slug).join(", ")}`);
  const spec = productSpec(app, apps);

  const graph = trace(entryFiles(spec), new Map());
  const { tests, rulesTest, emulatorSpecs, addedByTests } = selectTests(spec, graph);

  const files = new Map();
  for (const [rel, { content }] of graph) files.set(rel, content);
  for (const asset of publicAssets(graph)) files.set(asset, fs.readFileSync(path.join(repoRoot, asset)));

  const configs = [...VERBATIM_FILES.filter(exists)];
  if (rulesTest) configs.push("vitest.rules.config.mjs", "scripts/test-firestore-rules.mjs");
  if (emulatorSpecs.length) configs.push(spec.emulatorConfig);
  for (const config of configs) {
    files.set(config, readSource(config));
    trace(configReferences(config), graph, config);
  }
  for (const [rel, { content }] of graph) if (!files.has(rel)) files.set(rel, content);

  const violations = [...files.keys()].filter((rel) => spec.forbidden.some((pattern) => pattern.test(rel)));
  if (violations.length) {
    const chains = violations.map((rel) => `  ${graph.has(rel) ? importChain(graph, rel) : rel}`);
    throw new Error(`The ${slug} export reaches code that belongs elsewhere:\n${chains.join("\n")}`);
  }

  const used = usedEnv(graph);
  const env = buildEnvExample(spec, used);
  const capabilities = extractCapabilities(readText(`docs/fleet/status/${slug}.md`), slug);

  files.set("src/app/page.tsx", buildRootPage(spec));
  files.set("package.json", buildPackageJson(spec, { rulesTest, emulatorSpecs }));
  files.set("next.config.ts", buildNextConfig(spec));
  files.set("firestore.rules", buildFirestoreRules(spec));
  files.set(".env.example", env.text);
  files.set("docs/STATUS.md", buildStatus(spec));
  files.set("README.md", buildReadme(spec, { emulatorSpecs, envNames: env.names, capabilities }));

  prepareOutDir(outDir, slug);
  for (const [rel, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const target = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  return {
    slug,
    outDir,
    files: [...files.keys()].sort(),
    tests,
    addedByTests,
    env: env.names,
  };
}

async function main() {
  const [slug, outDir] = process.argv.slice(2);
  if (!slug || !outDir) {
    console.error("Usage: node scripts/export-product.mjs <slug> <outDir>");
    process.exit(2);
  }
  const result = await exportProduct({ slug, outDir: path.resolve(outDir) });
  const sourceFiles = result.files.filter((rel) => rel.startsWith("src/")).length;
  console.log(`Exported saasassin-${slug} to ${result.outDir}`);
  console.log(`  ${result.files.length} files (${sourceFiles} under src/)`);
  console.log(`  tests: ${result.tests.join(", ")}`);
  if (result.addedByTests.length) console.log(`  reachable only from tests: ${result.addedByTests.join(", ")}`);
  console.log(`  .env.example: ${result.env.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
