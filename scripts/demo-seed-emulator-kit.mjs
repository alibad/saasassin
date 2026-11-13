/**
 * Shared plumbing for the Creator and Community demo seeds (scripts/seed-demo-creator.mjs,
 * scripts/seed-demo-community.mjs). Nothing here imports Firebase, so a seed can run the safety
 * gate before any Firebase module is loaded.
 *
 * - gateEmulators(): refuses to run unless both emulator hosts are set, they answer, and the
 *   project id starts with "demo-" (a prefix Firebase reserves for projects that can never exist
 *   in the cloud). Real credentials are dropped from the environment.
 * - registerSourceLoader(): lets Node import the TypeScript data layer (`@/` aliases, a stub for
 *   `server-only`, Node's built-in type stripping), so seeds write exactly what the product writes.
 * - timeline(): runs seed steps and later spreads their real write times over a believable
 *   recent history, ending shortly before now.
 */
import { register } from "node:module";

export async function gateEmulators(name) {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  const refuse = (message) => {
    console.error(`${name}: refusing to run. ${message}`);
    process.exit(1);
  };
  if (!firestoreHost || !authHost) refuse("Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to local emulator hosts.");
  if (!projectId.startsWith("demo-")) refuse(`FIREBASE_PROJECT_ID must start with "demo-" (got "${projectId}").`);
  if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");
  process.env.NODE_ENV ??= "development";
  for (const variable of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[variable];
  for (const [label, host] of [["Firestore", firestoreHost], ["Auth", authHost]]) {
    try {
      const response = await fetch(`http://${host}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      refuse(`The ${label} emulator at ${host} is not reachable (${error instanceof Error ? error.message : error}).`);
    }
  }
  return { projectId, firestoreHost, authHost, refuse };
}

export function registerSourceLoader() {
  const srcUrl = new URL("../src/", import.meta.url).href;
  const hooks = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const SRC = ${JSON.stringify(srcUrl)};
function file(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, path + ".ts", path + ".tsx", path + "/index.ts"]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return pathToFileURL(candidate).href;
  }
  return null;
}
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  // Seeds run outside a request: anything that reads cookies must not be called, so fail loudly.
  if (specifier === "next/headers") {
    return { url: "data:text/javascript,export async function cookies(){throw new Error('No request in a seed script')}export async function headers(){throw new Error('No request in a seed script')}", shortCircuit: true };
  }
  if (specifier === "next/server") return next("next/server.js", context);
  if (specifier.startsWith("@/")) {
    const found = file(new URL(specifier.slice(2), SRC));
    if (found) return { url: found, shortCircuit: true };
  }
  if (/^\\.\\.?\\//.test(specifier) && context.parentURL && context.parentURL.startsWith(SRC)) {
    const found = file(new URL(specifier, context.parentURL));
    if (found) return { url: found, shortCircuit: true };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith(SRC) && url.endsWith(".ts")) return next(url, { ...context, format: "module-typescript" });
  return next(url, context);
}
`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
}

const DAY = 86_400_000;

/**
 * Seed steps run in real time; `at(fromDaysAgo, toDaysAgo, …)` records each step's real window and
 * the simulated window it stands for. `remapTree` then rewrites every ISO string and Timestamp
 * written during the seed into its simulated time (monotonic, so ordering is kept). Values written
 * before the seed started (or after it ended, such as invitation expiry dates) are left alone.
 */
export function timeline(Timestamp) {
  const seedStart = Date.now();
  const anchor = seedStart;
  const phases = [];

  async function at(fromDaysAgo, toDaysAgo, label, work) {
    const realStart = Date.now();
    const result = await work();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const realEnd = Date.now();
    phases.push({ realStart, realEnd, simStart: anchor - fromDaysAgo * DAY, simEnd: anchor - toDaysAgo * DAY });
    console.log(`  ✓ ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return result;
  }

  function mapTime(ms) {
    const phase = [...phases].reverse().find((candidate) => ms >= candidate.realStart - 2) ?? null;
    if (!phase || ms > phases.at(-1).realEnd + 2_000) return null;
    const fraction = Math.min(1, Math.max(0, (ms - phase.realStart) / Math.max(1, phase.realEnd - phase.realStart)));
    return Math.round(phase.simStart + fraction * (phase.simEnd - phase.simStart));
  }

  function remap(value) {
    if (value instanceof Timestamp) {
      const mapped = value.toMillis() >= seedStart ? mapTime(value.toMillis()) : null;
      return mapped === null ? value : Timestamp.fromMillis(mapped);
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const parsed = Date.parse(value);
      const mapped = parsed >= seedStart ? mapTime(parsed) : null;
      return mapped === null ? value : new Date(mapped).toISOString();
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object" && value.constructor === Object) {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry)]));
    }
    return value;
  }

  async function remapTree(reference, counter = { count: 0 }) {
    const snapshot = await reference.get();
    if (snapshot.exists) {
      await reference.set(remap(snapshot.data()));
      counter.count += 1;
    }
    for (const collection of await reference.listCollections()) {
      for (const document of await collection.listDocuments()) await remapTree(document, counter);
    }
    return counter;
  }

  /** An ISO date `days` before the seed started, for fields the seed sets directly. */
  const daysAgo = (days) => new Date(anchor - days * DAY).toISOString();

  return { at, remapTree, daysAgo, seedStart };
}

/** Removes one product's emulator data and the seed's own accounts, leaving other demo data alone. */
export async function wipeProduct(db, auth, product, uids) {
  await db.recursiveDelete(db.collection("products").doc(product));
  for (const uid of uids) await auth.deleteUser(uid).catch(() => undefined);
}

/** Stable pseudo-randomness, so every run produces the same fictional data. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
