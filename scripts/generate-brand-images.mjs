#!/usr/bin/env node
/**
 * Writes each product's static social card and home-screen icon from its brand data and mark:
 *
 *   src/app/apps/<slug>/opengraph-image.png  (+ opengraph-image.alt.txt)
 *   src/app/apps/<slug>/apple-icon.png
 *   (src/app/lattice/… for Performance)
 *
 *   node scripts/generate-brand-images.mjs [slug…]
 *
 * Run it after changing a brand's name, descriptor, colours or mark. The images are static files
 * rather than opengraph-image.tsx routes so they never depend on image tooling at request time.
 * The renderer is src/lib/brand/og.tsx; this script transpiles it and the brand modules into
 * node_modules/.cache (so `react` and `next` resolve) and renders with next/og. Headline fonts
 * come from Google Fonts; without network the images fall back to next/og's default face.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(repoRoot, "node_modules/.cache/brand-images");
const SLUGS = ["performance", "research", "planner", "creator", "feedback", "studies", "revenue", "community", "mail", "trust"];

const shared = [
  "src/lib/app-config.ts",
  "src/lib/brand/types.ts",
  "src/lib/brand/metadata.ts",
  "src/lib/brand/mark-svg.tsx",
  "src/lib/brand/og.tsx",
];

function outPath(rel) {
  return path.join(cacheDir, rel.replace(/\.(tsx?|mts)$/, ".mjs"));
}

function resolveLocal(fromRel, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(repoRoot, path.dirname(fromRel), specifier);
  else return null;
  for (const extension of [".ts", ".tsx"]) {
    if (fs.existsSync(base + extension)) return path.relative(repoRoot, base + extension);
  }
  throw new Error(`${fromRel}: cannot resolve ${specifier}`);
}

function transpile(rel) {
  const source = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: rel,
  });
  const rewritten = outputText.replace(/(from\s+|import\s*\(\s*)(["'])([^"']+)\2/g, (match, lead, quote, specifier) => {
    if (specifier === "next/og") return `${lead}${quote}next/og.js${quote}`;
    const local = resolveLocal(rel, specifier);
    if (!local) return match;
    let relative = path.relative(path.dirname(outPath(rel)), outPath(local)).split(path.sep).join("/");
    if (!relative.startsWith(".")) relative = `./${relative}`;
    return `${lead}${quote}${relative}${quote}`;
  });
  fs.mkdirSync(path.dirname(outPath(rel)), { recursive: true });
  fs.writeFileSync(outPath(rel), rewritten);
}

function routeDir(slug) {
  return path.join(repoRoot, slug === "performance" ? "src/app/lattice" : `src/app/apps/${slug}`);
}

const requested = process.argv.slice(2);
const slugs = requested.length ? requested : SLUGS;
for (const slug of slugs) if (!SLUGS.includes(slug)) throw new Error(`Unknown product "${slug}"`);

fs.rmSync(cacheDir, { recursive: true, force: true });
for (const rel of shared) transpile(rel);
for (const slug of slugs) {
  transpile(`src/brands/${slug}/brand.ts`);
  transpile(`src/brands/${slug}/mark.tsx`);
}

const { createElement } = await import("react");
const og = await import(pathToFileURL(outPath("src/lib/brand/og.tsx")).href);
const metadata = await import(pathToFileURL(outPath("src/lib/brand/metadata.ts")).href);

for (const slug of slugs) {
  const { brand } = await import(pathToFileURL(outPath(`src/brands/${slug}/brand.ts`)).href);
  const markModule = await import(pathToFileURL(outPath(`src/brands/${slug}/mark.tsx`)).href);
  const Mark = Object.values(markModule).find((value) => typeof value === "function");
  const renderMark = (size, colors) => createElement(Mark, { size, colors });

  const dir = routeDir(slug);
  const card = await og.brandOgImage(brand, renderMark);
  fs.writeFileSync(path.join(dir, "opengraph-image.png"), Buffer.from(await card.arrayBuffer()));
  fs.writeFileSync(path.join(dir, "opengraph-image.alt.txt"), `${metadata.brandTitle(brand)}\n`);
  const icon = og.brandAppleIcon(brand, renderMark);
  fs.writeFileSync(path.join(dir, "apple-icon.png"), Buffer.from(await icon.arrayBuffer()));
  console.log(`${slug}: ${path.relative(repoRoot, dir)}/{opengraph-image.png,apple-icon.png}`);
}
fs.rmSync(cacheDir, { recursive: true, force: true });
