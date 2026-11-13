/**
 * Shared plumbing for the product demo seeds (seed-demo-planner.mjs, seed-demo-mail.mjs).
 *
 * - guardEmulators() refuses to run unless BOTH emulator hosts are set, the project id starts
 *   with "demo-" and NODE_ENV is not production; it drops real credentials from the
 *   environment and checks that both emulators answer. Call it before importing anything that
 *   loads Firebase.
 * - registerSourceLoader() lets a plain Node script import the TypeScript data layer under
 *   src/ (the `@/` alias, a `server-only` stub, Node's built-in type stripping, Node 22.18+),
 *   so every record and audit event is written exactly as the product writes it.
 * - wipeEmulators() clears the demo project's Firestore and Auth emulator data.
 * - portrait() reads a fictional person's photo from scripts/demo-people/. Those portraits
 *   were generated locally with an image model for these demos; they are not real people.
 */
import { readFile } from "node:fs/promises";
import { register } from "node:module";

export function guardEmulators(scriptName) {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  const refuse = (message) => {
    console.error(`${scriptName}: refusing to run. ${message}`);
    process.exit(1);
  };

  if (!firestoreHost || !authHost) refuse("Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to local emulator hosts.");
  if (!projectId.startsWith("demo-")) refuse(`FIREBASE_PROJECT_ID must start with "demo-" (got "${projectId}").`);
  if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");
  process.env.NODE_ENV ??= "development";
  for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[name];

  return { projectId, firestoreHost, authHost, refuse };
}

export async function assertEmulatorsReachable({ firestoreHost, authHost, refuse }) {
  for (const [label, host] of [["Firestore", firestoreHost], ["Auth", authHost]]) {
    try {
      const response = await fetch(`http://${host}/`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      refuse(`The ${label} emulator at ${host} is not reachable (${error instanceof Error ? error.message : error}).`);
    }
  }
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
  // next/headers and friends are CommonJS entry files without an "exports" map.
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
}

export async function wipeEmulators({ projectId, firestoreHost, authHost, refuse }) {
  for (const url of [
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
  ]) {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) refuse(`Could not clear emulator data at ${url} (HTTP ${response.status}).`);
  }
}

export async function portrait(key) {
  return new Uint8Array(await readFile(new URL(`./demo-people/${key}.jpg`, import.meta.url)));
}

/** A Date for local wall-clock time in an IANA zone (minute precision is enough for demos). */
export function zonedDate(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess))
    .reduce((acc, part) => ({ ...acc, [part.type]: Number(part.value) }), {});
  const asLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess - (asLocal - guess));
}

/** Year, month, day and weekday (0 = Sunday) of an instant in an IANA zone. */
export function localDay(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(date)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
}

export function addDays({ year, month, day }, offset) {
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
}
