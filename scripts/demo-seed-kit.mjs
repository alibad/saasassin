/**
 * Shared plumbing for the fictional demo seeds (seed-demo-feedback.mjs, seed-demo-trust.mjs):
 * the emulator-only safety gate, a loader for the TypeScript data layer, emulator wipes, and a
 * timeline that spreads the seeded writes over a believable history.
 *
 * Nothing here can reach a real project: `prepareDemoSeed` refuses to continue unless both
 * emulator hosts are set and the project id starts with "demo-", and it drops real
 * credentials from the environment before any Firebase module loads.
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";

export function prepareDemoSeed(name) {
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

  // `@/` aliases, a `server-only` stub, and Node's built-in type stripping (Node 22.18+).
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
  // Next's subpath entry points (next/headers, next/server) are CommonJS files without an exports map.
  if (/^next\\/[a-z-]+$/.test(specifier)) return next(specifier + ".js", context);
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
  return { projectId, firestoreHost, authHost, refuse };
}

/** Both emulators reachable, then every document and account in the demo project deleted. */
export async function wipeEmulators({ projectId, firestoreHost, authHost, refuse }) {
  for (const [label, host] of [["Firestore", firestoreHost], ["Auth", authHost]]) {
    try {
      const response = await fetch(`http://${host}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      refuse(`The ${label} emulator at ${host} is not reachable (${error instanceof Error ? error.message : error}).`);
    }
  }
  for (const url of [
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
  ]) {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) refuse(`Could not clear emulator data at ${url} (HTTP ${response.status}).`);
  }
}

/** A fictional portrait from scripts/demo-photos/<product>/<key>.webp, or null. */
export function demoPhoto(product, key) {
  try {
    return new Uint8Array(readFileSync(new URL(`./demo-photos/${product}/${key}.webp`, import.meta.url)));
  } catch {
    return null;
  }
}

/**
 * Simulated history: each step's real writes are later moved into its simulated window,
 * on weekday office hours (UTC 08:00–17:00). Call `at` in chronological order.
 */
export function createTimeline(Timestamp) {
  const phases = [];
  const seedStart = Date.now();

  async function at(simStart, simEnd, label, work) {
    const realStart = Date.now();
    await work();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const realEnd = Date.now();
    phases.push({ realStart, realEnd, simStart: Date.parse(simStart), simEnd: Date.parse(simEnd ?? simStart) });
    console.log(`  ✓ ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const officeCache = new Map();
  function officeMinutes(startMs, endMs) {
    const minutes = [];
    for (let t = startMs; t <= endMs; t += 60_000) {
      const date = new Date(t);
      const day = date.getUTCDay();
      const hour = date.getUTCHours();
      if (day !== 0 && day !== 6 && hour >= 8 && hour < 17) minutes.push(t);
    }
    return minutes;
  }

  function mapTime(ms) {
    const phase = [...phases].reverse().find((candidate) => ms >= candidate.realStart - 2) ?? null;
    if (!phase || ms > phases.at(-1).realEnd + 2_000) return null;
    const fraction = Math.min(1, Math.max(0, (ms - phase.realStart) / Math.max(1, phase.realEnd - phase.realStart)));
    if (phase.simEnd <= phase.simStart) return phase.simStart + Math.round(fraction * 40 * 60_000);
    const key = `${phase.simStart}-${phase.simEnd}`;
    if (!officeCache.has(key)) officeCache.set(key, officeMinutes(phase.simStart, phase.simEnd));
    const minutes = officeCache.get(key);
    if (!minutes.length) return phase.simStart + fraction * (phase.simEnd - phase.simStart);
    return minutes[Math.min(minutes.length - 1, Math.floor(fraction * minutes.length))] + Math.floor((ms % 60) * 1000);
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

  /** Rewrites a document and everything below it onto the simulated timeline. */
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

  return { at, remapTree };
}
