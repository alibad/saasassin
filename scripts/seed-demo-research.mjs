#!/usr/bin/env node
/**
 * Seeds a FICTIONAL research team, "Lumen Cycles" (team bike rentals), into LOCAL
 * Firebase emulators for screenshots and demos of Research.
 *
 * It never touches a real project. It refuses to run unless:
 * - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set, and
 * - FIREBASE_PROJECT_ID starts with "demo-" (Firebase's prefix for projects that
 *   cannot exist in the cloud).
 * Real credentials in the environment are dropped before anything is imported.
 *
 * It drives the real server data layer (src/lib/research/*, src/lib/fleet/platform/*),
 * so every record, profile photo and audit event is written exactly as the product
 * writes it. Seeded timestamps are then spread over Sep–Nov 2026 office hours.
 *
 * Every person, company, email (on the reserved `.example` domain), interview and
 * portrait (generated locally, scripts/demo-assets/research-people) is made up.
 * Only Research's own data and this script's accounts are replaced on each run,
 * so other products' demo data in the same emulator is left alone.
 *
 * Usage (with the emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8282 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9282 \
 *   node scripts/seed-demo-research.mjs
 *
 * Then run `next dev` with the same three variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID
 * and NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (see src/lib/firebase/emulators.ts), and
 * sign in as amara.osei@lumen-cycles.example with DEMO_PASSWORD below (emulator-only).
 */
import { readFileSync } from "node:fs";
import { register } from "node:module";

// ---------------------------------------------------------------------------
// Safety gate — before any Firebase module is loaded.
// ---------------------------------------------------------------------------

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

function refuse(message) {
  console.error(`seed-demo-research: refusing to run. ${message}`);
  process.exit(1);
}

if (!firestoreHost || !authHost) refuse("Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to local emulator hosts.");
if (!projectId.startsWith("demo-")) refuse(`FIREBASE_PROJECT_ID must start with "demo-" (got "${projectId}").`);
if (process.env.NODE_ENV === "production") refuse("NODE_ENV is production.");
process.env.NODE_ENV ??= "development";
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) delete process.env[name];

for (const [label, host] of [["Firestore", firestoreHost], ["Auth", authHost]]) {
  try {
    const response = await fetch(`http://${host}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    refuse(`The ${label} emulator at ${host} is not reachable (${error instanceof Error ? error.message : error}).`);
  }
}

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "lumen-emulator-only";
const DOMAIN = "lumen-cycles.example";
const PRODUCT = "research";

// ---------------------------------------------------------------------------
// Load the TypeScript data layer directly (same loader as seed-demo-performance.mjs).
// ---------------------------------------------------------------------------

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
  // The session helpers import next/headers; a seed has no request, so they must never be called.
  if (specifier === "next/headers") return { url: "data:text/javascript,export function cookies(){throw new Error('no request')}export function headers(){throw new Error('no request')}", shortCircuit: true };
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

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const tenants = await import("@/lib/fleet/platform/tenants");
const profiles = await import("@/lib/fleet/platform/profiles");
const team = await import("@/lib/fleet/platform/team");
const research = await import("@/lib/research/data");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// The fictional team
// ---------------------------------------------------------------------------

const PEOPLE = [
  ["amara", "Amara Osei", "Head of Research", "owner"],
  ["jonah", "Jonah Feld", "Senior UX Researcher", "admin"],
  ["sofia", "Sofia Brandt", "Research Operations", "admin"],
  ["priya", "Priya Natarajan", "Product Researcher", "member"],
  ["lucas", "Lucas Moreau", "Product Designer", "member"],
  ["mei", "Mei Tanaka", "Product Manager, Payments", "viewer"],
].map(([key, name, title, role]) => ({
  key,
  name,
  title,
  role,
  uid: `lc-${key}`,
  email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ").at(-1).toLowerCase()}@${DOMAIN}`,
}));
const person = (key) => {
  const found = PEOPLE.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return found;
};
const actor = (key) => {
  const p = person(key);
  return { uid: p.uid, email: p.email, name: p.name, emailVerified: true };
};

// ---------------------------------------------------------------------------
// Simulated history (same approach as seed-demo-performance.mjs)
// ---------------------------------------------------------------------------

const phases = [];
async function at(simStart, simEnd, label, work) {
  const realStart = Date.now();
  await work();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const realEnd = Date.now();
  phases.push({ realStart, realEnd, simStart: Date.parse(simStart), simEnd: Date.parse(simEnd ?? simStart) });
  console.log(`  ✓ ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 25));
}

/** Weekday office hours, 09:00–18:00 Europe/Amsterdam (UTC+1 in this period). */
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
const officeCache = new Map();
function mapTime(ms) {
  const phase = [...phases].reverse().find((candidate) => ms >= candidate.realStart - 2) ?? null;
  if (!phase || ms > phases.at(-1).realEnd + 2_000) return null;
  const fraction = Math.min(1, Math.max(0, (ms - phase.realStart) / Math.max(1, phase.realEnd - phase.realStart)));
  if (phase.simEnd <= phase.simStart) return phase.simStart + Math.round(fraction * 50 * 60_000);
  const cacheKey = `${phase.simStart}-${phase.simEnd}`;
  if (!officeCache.has(cacheKey)) officeCache.set(cacheKey, officeMinutes(phase.simStart, phase.simEnd));
  const minutes = officeCache.get(cacheKey);
  if (!minutes.length) return phase.simStart + fraction * (phase.simEnd - phase.simStart);
  const minute = minutes[Math.min(minutes.length - 1, Math.floor(fraction * minutes.length))];
  return minute + Math.floor((ms % 60) * 1000);
}
function remap(value, seedStart) {
  if (value instanceof Timestamp) {
    const mapped = value.toMillis() >= seedStart ? mapTime(value.toMillis()) : null;
    return mapped === null ? value : Timestamp.fromMillis(mapped);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const parsed = Date.parse(value);
    const mapped = parsed >= seedStart ? mapTime(parsed) : null;
    return mapped === null ? value : new Date(mapped).toISOString();
  }
  if (Array.isArray(value)) return value.map((entry) => remap(entry, seedStart));
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remap(entry, seedStart)]));
  }
  return value;
}
async function remapTree(reference, seedStart, counter) {
  const snapshot = await reference.get();
  if (snapshot.exists) {
    await reference.set(remap(snapshot.data(), seedStart));
    counter.count += 1;
  }
  for (const collection of await reference.listCollections()) {
    for (const document of await collection.listDocuments()) await remapTree(document, seedStart, counter);
  }
}

// ---------------------------------------------------------------------------
// Interviews (fictional). Each line: [speaker, text]; highlights point at exact words.
// ---------------------------------------------------------------------------

function vtt(lines, startSeconds) {
  let t = startSeconds;
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.000`;
  const cues = lines.map(([speaker, text]) => {
    const length = Math.max(4, Math.round(text.length / 14));
    const cue = `${stamp(t)} --> ${stamp(t + length)}\n<v ${speaker}>${text}`;
    t += length + 2;
    return cue;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

const I = "Interviewer";
const INTERVIEWS = {
  dana: {
    title: "Interview — Dana (P07)",
    participant: { name: "Dana (P07)", email: "", company: "Northfield Design · 12 people" },
    consent: { status: "granted", capturedOn: "2026-10-01", retentionUntil: "2027-10-01", notes: "Recording and quotes in internal reports. No external use." },
    start: 236,
    lines: [
      [I, "Thanks for making time, Dana. What happened the last time you booked bikes for your team?"],
      ["Dana (P07)", "We had an offsite in Utrecht, so I needed twelve bikes for two days. Finding the right bikes was quick, honestly that part was easy."],
      [I, "And then?"],
      ["Dana (P07)", "I got all the way to payment and only then saw a deposit on every bike. Twelve deposits. I closed the tab."],
      [I, "Did you come back to it?"],
      ["Dana (P07)", "Two days later. I just wanted the total before I typed my card — that's all it would have taken."],
      [I, "What would the total have needed to show?"],
      ["Dana (P07)", "Everything in one number. The rental, the deposit, and when the deposit comes back. Our finance team asks me that every single time."],
      [I, "Who else is involved when you book for the team?"],
      ["Dana (P07)", "Our office manager has the company card. So I screenshot the basket, send it to her, and she asks why the price changed."],
      [I, "If you could change one thing about booking, what would it be?"],
      ["Dana (P07)", "Let me send a quote link to whoever pays. Then I'm not the one explaining the deposit."],
    ],
  },
  ravi: {
    title: "Interview — Ravi (P04)",
    participant: { name: "Ravi (P04)", email: "", company: "Parcelpath · logistics" },
    consent: { status: "granted", capturedOn: "2026-09-29", retentionUntil: "2027-09-29", notes: "Internal use only." },
    start: 410,
    lines: [
      [I, "Walk me through your last booking."],
      ["Ravi (P04)", "I compared you with two other rental sites in separate tabs. Yours looked cheapest on the listing page."],
      [I, "What happened at checkout?"],
      ["Ravi (P04)", "The number jumped on the last step. Insurance and the deposit were added at the end, and suddenly you were the most expensive."],
      [I, "How did that feel?"],
      ["Ravi (P04)", "Like a trick, to be honest. I don't think it was meant that way, but that's how it reads."],
      [I, "Did you finish the booking?"],
      ["Ravi (P04)", "Yes, but only because the others had no bikes left that weekend. Next time I'd go elsewhere."],
      [I, "What would have kept you?"],
      ["Ravi (P04)", "Show the deposit on the listing. A small line under the price would do it."],
    ],
  },
  mo: {
    title: "Interview — Mo (P02)",
    participant: { name: "Mo (P02)", email: "", company: "Freelance producer" },
    consent: { status: "granted", capturedOn: "2026-09-24", retentionUntil: "2027-03-24", notes: "Quotes may be used without name." },
    start: 182,
    lines: [
      [I, "Where were you when you booked?"],
      ["Mo (P02)", "On my phone, on a train. I book most things on my phone."],
      [I, "How did checkout go?"],
      ["Mo (P02)", "Fine until the payment page. I didn't know there was a hold on my card until my bank sent a notification."],
      [I, "What did you do?"],
      ["Mo (P02)", "I called support because I thought I'd been charged twice. They were nice about it, but it was a twenty-minute call."],
      [I, "Anything else about booking on your phone?"],
      ["Mo (P02)", "The summary at the bottom was cut off. I could see the rental price but not the extras."],
    ],
  },
  elif: {
    title: "Interview — Elif (P09)",
    participant: { name: "Elif (P09)", email: "", company: "Hollis & Rye · HR" },
    consent: { status: "granted", capturedOn: "2026-10-06", retentionUntil: "2027-10-06", notes: "" },
    start: 95,
    lines: [
      [I, "How do bookings get approved at your company?"],
      ["Elif (P09)", "Anything over five hundred euros needs my manager's sign-off. The deposit pushes almost every booking over that line."],
      [I, "What does sign-off look like?"],
      ["Elif (P09)", "I export a PDF of the basket, email it, and wait a day. By then the bikes are sometimes gone."],
      [I, "Would anything make that faster?"],
      ["Elif (P09)", "If the quote showed the deposit separately, as refundable, my manager wouldn't count it."],
    ],
  },
  hugo: {
    title: "Interview — Hugo (P11)",
    participant: { name: "Hugo (P11)", email: "", company: "Ostrava Tours · fleet manager" },
    consent: { status: "granted", capturedOn: "2026-10-20", retentionUntil: "2027-10-20", notes: "" },
    start: 60,
    lines: [
      [I, "Tell me about your first week managing the fleet."],
      ["Hugo (P11)", "Mostly I was learning which bikes were actually available. The calendar said forty, the yard had thirty-one."],
      [I, "How did you find out?"],
      ["Hugo (P11)", "A customer turned up for a bike that was in for repairs. That was my second day."],
      [I, "What would have helped?"],
      ["Hugo (P11)", "One screen that shows what's rentable today, and what's in the workshop. I'd check it every morning."],
    ],
  },
  sanne: {
    title: "Interview — Sanne (P12)",
    participant: { name: "Sanne (P12)", email: "", company: "Duinwijk Holiday Parks" },
    consent: { status: "pending", capturedOn: "", retentionUntil: "2027-04-30", notes: "Signed form requested by email." },
    start: 140,
    lines: [
      [I, "What did you set up first when you joined?"],
      ["Sanne (P12)", "Prices for the season. I had a spreadsheet from my predecessor and copied it in by hand."],
      [I, "How long did that take?"],
      ["Sanne (P12)", "Most of a Friday. I'd have loved to just upload the spreadsheet."],
    ],
  },
  brightwater: {
    title: "Call — Brightwater Events",
    participant: { name: "Account lead (P15)", email: "", company: "Brightwater Events" },
    consent: { status: "granted", capturedOn: "2026-10-14", retentionUntil: "2026-11-30", notes: "Retention limited by contract." },
    start: 30,
    lines: [
      [I, "Why did you decide not to renew this season?"],
      ["Account lead (P15)", "Our events team books on short notice. Twice the bikes weren't confirmed until the day before, and we can't run an event on that."],
      [I, "Was price part of it?"],
      ["Account lead (P15)", "Less than you'd think. Certainty matters more to us than the rate."],
    ],
  },
  kade: {
    title: "Call — Kade Studio",
    participant: { name: "Studio manager (P16)", email: "", company: "Kade Studio" },
    consent: { status: "granted", capturedOn: "2026-10-16", retentionUntil: "2027-10-16", notes: "" },
    start: 45,
    lines: [
      [I, "What made you cancel after the summer?"],
      ["Studio manager (P16)", "The team only rides in summer. Paying for the plan in winter felt silly, so we stopped."],
      [I, "Would a seasonal plan have kept you?"],
      ["Studio manager (P16)", "Probably. Pause it in October, start again in April. That's all we need."],
    ],
  },
  theo: {
    title: "Interview — Theo (P01)",
    participant: { name: "Theo (P01)", email: "", company: "Visitor, pricing page" },
    consent: { status: "granted", capturedOn: "2026-05-02", retentionUntil: "2026-11-01", notes: "Six-month retention agreed for the pilot." },
    start: 20,
    lines: [
      [I, "Could you estimate the cost for a team of ten from this page?"],
      ["Theo (P01)", "Not really. It shows a price per bike per day, but I'd have to guess the rest."],
    ],
  },
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Lumen Cycles research (fictional) into emulators for ${projectId}…`);

// 0. Replace only Research's data and this script's accounts.
await db.recursiveDelete(db.collection("products").doc(PRODUCT));
for (const member of PEOPLE) await auth.deleteUser(member.uid).catch(() => undefined);
const seedStart = Date.now();

// 1. Emulator-only accounts with verified fictional emails, profiles and photos.
for (const member of PEOPLE) {
  await auth.createUser({ uid: member.uid, email: member.email, password: DEMO_PASSWORD, displayName: member.name, emailVerified: true });
  await profiles.updateAccountProfile(PRODUCT, actor(member.key), { name: member.name, title: member.title });
  const photo = new Uint8Array(readFileSync(new URL(`./demo-assets/research-people/${member.key}.jpg`, import.meta.url)));
  await profiles.setUploadedPhoto(PRODUCT, actor(member.key), photo);
}
console.log(`  ✓ ${PEOPLE.length} people with profile photos`);

let tenantId = "";
await at("2026-09-21T09:05:00Z", null, "workspace created by Amara", async () => {
  tenantId = (await tenants.createTenant(PRODUCT, actor("amara"), "Lumen Cycles Research")).id;
});
await at("2026-09-21T09:20:00Z", "2026-09-22T15:00:00Z", "team joined", async () => {
  for (const member of PEOPLE.filter((candidate) => candidate.role !== "owner")) {
    await tenants.grantMembership(PRODUCT, tenantId, actor("amara"), { uid: member.uid, email: member.email, name: member.name }, member.role);
  }
});

const projects = {};
const sources = {};
async function project(key, by, name, description) {
  projects[key] = (await research.createProject(tenantId, actor(by), { name, description })).id;
}
async function addInterview(projectKey, sourceKey, by) {
  const interview = INTERVIEWS[sourceKey];
  const role = person(by).role;
  const result = await research.applyResearchAction(tenantId, projects[projectKey], actor(by), role, {
    type: "source.create",
    title: interview.title,
    fileName: `${interview.title.split("— ").at(-1).replace(/[^\w]+/g, "-").toLowerCase()}.vtt`,
    format: "vtt",
    content: vtt(interview.lines, interview.start),
    participant: interview.participant,
    consent: interview.consent,
  });
  sources[sourceKey] = { id: result.sourceId, project: projectKey };
}
const highlights = {};
async function highlight(key, sourceKey, line, phrase, tags, by, note = "") {
  const { id, project: projectKey } = sources[sourceKey];
  const text = INTERVIEWS[sourceKey].lines[line][1];
  const start = text.indexOf(phrase);
  if (start < 0) throw new Error(`"${phrase}" is not in ${sourceKey} line ${line}`);
  const result = await research.applyResearchAction(tenantId, projects[projectKey], actor(by), person(by).role, {
    type: "highlight.create",
    sourceId: id,
    segmentId: `seg-${line + 1}`,
    start,
    end: start + phrase.length,
    tags,
    note,
  });
  highlights[key] = result.highlightId ?? result.id;
}
const themes = {};
const insights = {};
async function act(projectKey, by, action) {
  return research.applyResearchAction(tenantId, projects[projectKey], actor(by), person(by).role, action);
}

await at("2026-09-22T10:00:00Z", "2026-09-23T11:00:00Z", "projects started", async () => {
  await project("checkout", "amara", "Checkout friction", "Why do team leads abandon a booking at the payment step?");
  await project("pricing", "jonah", "Pricing page refresh", "Can a visitor estimate a team booking from the pricing page alone?");
});

await at("2026-09-24T09:30:00Z", "2026-10-07T16:30:00Z", "checkout interviews added", async () => {
  await addInterview("checkout", "mo", "priya");
  await addInterview("checkout", "ravi", "priya");
  await addInterview("checkout", "dana", "jonah");
  await addInterview("checkout", "elif", "priya");
  await addInterview("pricing", "theo", "lucas");
});

await at("2026-10-07T09:00:00Z", "2026-10-15T17:00:00Z", "quotes highlighted", async () => {
  await highlight("mo-hold", "mo", 3, "I didn't know there was a hold on my card", ["deposit", "trust"], "priya");
  await highlight("mo-twice", "mo", 5, "I thought I'd been charged twice", ["deposit", "support-cost"], "priya", "A twenty-minute support call per confused booking.");
  await highlight("mo-extras", "mo", 7, "I could see the rental price but not the extras", ["mobile", "total-cost"], "lucas");
  await highlight("ravi-jump", "ravi", 3, "The number jumped on the last step", ["pricing", "total-cost"], "priya");
  await highlight("ravi-trick", "ravi", 5, "Like a trick, to be honest", ["trust"], "priya");
  await highlight("ravi-elsewhere", "ravi", 7, "Next time I'd go elsewhere", ["churn-risk"], "priya");
  await highlight("ravi-listing", "ravi", 9, "Show the deposit on the listing", ["deposit", "feature-request"], "lucas");
  await highlight("dana-deposit", "dana", 3, "only then saw a deposit on every bike", ["deposit", "pricing"], "jonah");
  await highlight("dana-total", "dana", 5, "I just wanted the total before I typed my card", ["total-cost", "trust"], "jonah");
  await highlight("dana-one", "dana", 7, "Everything in one number", ["total-cost"], "jonah");
  await highlight("dana-back", "dana", 7, "when the deposit comes back", ["deposit"], "priya");
  await highlight("dana-why", "dana", 9, "she asks why the price changed", ["approval", "pricing"], "amara");
  await highlight("dana-quote", "dana", 11, "Let me send a quote link to whoever pays", ["approval", "feature-request"], "amara", "Strong signal for a shareable quote.");
  await highlight("elif-line", "elif", 1, "The deposit pushes almost every booking over that line", ["approval", "deposit"], "priya");
  await highlight("elif-gone", "elif", 3, "By then the bikes are sometimes gone", ["approval", "availability"], "priya");
  await highlight("elif-refund", "elif", 5, "showed the deposit separately, as refundable", ["deposit", "approval"], "lucas");
  await highlight("theo-guess", "theo", 1, "I'd have to guess the rest", ["total-cost", "pricing"], "lucas");
});

await at("2026-10-16T09:00:00Z", "2026-10-22T16:00:00Z", "themes and insights", async () => {
  themes.price = (await act("checkout", "jonah", { type: "theme.create", name: "Price transparency" })).themeId;
  themes.team = (await act("checkout", "amara", { type: "theme.create", name: "Booking for a team" })).themeId;
  insights.late = (await act("checkout", "priya", {
    type: "insight.create",
    title: "People abandon checkout when the deposit appears late",
    body: "Three of four participants first learned about the per-bike deposit on the payment step. Two left; one called support thinking they had been charged twice. Showing the deposit — and when it comes back — before payment is the most direct fix.",
    highlightIds: [highlights["dana-deposit"], highlights["ravi-jump"], highlights["mo-hold"], highlights["mo-twice"]],
    themeId: themes.price,
  })).insightId;
  insights.total = (await act("checkout", "jonah", {
    type: "insight.create",
    title: "Teams want one all-in total before they reach for a card",
    body: "Participants asked for a single number covering rental, insurance and deposit, plus the date the deposit is released.",
    highlightIds: [highlights["dana-total"], highlights["dana-one"], highlights["mo-extras"]],
    themeId: themes.price,
  })).insightId;
  insights.payer = (await act("checkout", "amara", {
    type: "insight.create",
    title: "The person booking is rarely the person paying",
    body: "Team bookings pass through an approver with the company card. Every unexplained change in price restarts that loop, and slow approvals cost bikes.",
    highlightIds: [highlights["dana-why"], highlights["dana-quote"], highlights["elif-line"], highlights["elif-gone"]],
    themeId: themes.team,
  })).insightId;
  insights.trick = (await act("checkout", "lucas", {
    type: "insight.create",
    title: "A late deposit reads as a trick and costs repeat bookings",
    body: "Even when the booking completes, a surprise at the last step damages trust enough that people plan to switch next time.",
    highlightIds: [highlights["ravi-trick"], highlights["ravi-elsewhere"]],
    themeId: themes.team,
  })).insightId;
});

await at("2026-10-26T10:00:00Z", "2026-10-28T15:00:00Z", "insights revised", async () => {
  await act("checkout", "amara", {
    type: "insight.update",
    insightId: insights.total,
    title: "Teams need one all-in total before they reach for a card",
    body: "Participants asked for a single number covering rental, insurance and deposit, plus the date the deposit is released. Showing it on the listing would also stop comparison shoppers from feeling misled.",
    highlightIds: [highlights["dana-total"], highlights["dana-one"], highlights["mo-extras"], highlights["ravi-listing"], highlights["dana-back"]],
    themeId: themes.price,
  });
  await act("checkout", "priya", {
    type: "insight.update",
    insightId: insights.payer,
    title: "The person booking is rarely the person paying",
    body: "Team bookings pass through an approver with the company card. Every unexplained change in price restarts that loop, and slow approvals cost bikes. A refundable deposit shown separately keeps most bookings under approval limits.",
    highlightIds: [highlights["dana-why"], highlights["dana-quote"], highlights["elif-line"], highlights["elif-gone"], highlights["elif-refund"]],
    themeId: themes.team,
  });
});

await at("2026-10-29T13:00:00Z", null, "report published", async () => {
  await act("checkout", "amara", {
    type: "report.create",
    title: "What's stopping team bookings at checkout",
    intro: "We spoke with four people who book bikes for their teams. The pattern is consistent: the deposit arrives too late, the total is never in one place, and the person paying is not the person booking. These three insights are where we'd start.",
    insightIds: [insights.late, insights.total, insights.payer],
  });
});

await at("2026-10-19T09:00:00Z", "2026-11-04T16:00:00Z", "onboarding project", async () => {
  await project("onboarding", "sofia", "Fleet manager onboarding", "What does a new fleet manager need in their first week?");
  await addInterview("onboarding", "hugo", "sofia");
  await addInterview("onboarding", "sanne", "priya");
  await highlight("hugo-yard", "hugo", 1, "The calendar said forty, the yard had thirty-one", ["availability", "data-quality"], "sofia");
  await highlight("hugo-screen", "hugo", 5, "One screen that shows what's rentable today", ["feature-request", "availability"], "sofia");
  await highlight("sanne-upload", "sanne", 3, "I'd have loved to just upload the spreadsheet", ["import", "setup"], "priya");
  await act("onboarding", "sofia", {
    type: "insight.create",
    title: "New fleet managers can't trust the availability calendar",
    body: "In their first week, managers discover the calendar and the yard disagree — usually through a customer.",
    highlightIds: [highlights["hugo-yard"], highlights["hugo-screen"]],
    themeId: null,
  });
});

await at("2026-11-02T09:00:00Z", "2026-11-11T16:00:00Z", "churn calls", async () => {
  await project("churn", "jonah", "Churn calls · Q3", "Why did accounts cancel after their first season?");
  const folder = await act("churn", "jonah", { type: "folder.create", name: "Enterprise accounts", restricted: true, memberUids: [person("priya").uid] });
  await addInterview("churn", "brightwater", "jonah");
  await addInterview("churn", "kade", "priya");
  await act("churn", "jonah", { type: "source.move", sourceId: sources.brightwater.id, folderId: folder.folderId ?? folder.id });
  await act("churn", "jonah", { type: "source.hold", sourceId: sources.brightwater.id, reason: "Contract review — matter 2026-31" });
  await highlight("bw-certainty", "brightwater", 3, "Certainty matters more to us than the rate", ["churn-risk", "availability"], "jonah");
  await highlight("kade-pause", "kade", 3, "Pause it in October, start again in April", ["seasonal", "feature-request"], "priya");
  await highlight("kade-winter", "kade", 1, "Paying for the plan in winter felt silly", ["seasonal", "pricing"], "priya");
  await act("churn", "priya", {
    type: "insight.create",
    title: "Seasonal teams leave rather than pay through the winter",
    body: "Small teams ride from April to October. Without a way to pause, they cancel — and some never come back.",
    highlightIds: [highlights["kade-pause"], highlights["kade-winter"]],
    themeId: null,
  });
});

await at("2026-11-12T10:00:00Z", "2026-11-12T15:30:00Z", "invitation sent", async () => {
  await team.createInvitation(PRODUCT, tenantId, actor("amara"), { email: `daniel.reyes@${DOMAIN}`, role: "member" }, (token) => `/apps/research/invite/${token}`);
});

// Spread the seeded history over Sep–Nov 2026.
const counter = { count: 0 };
await remapTree(db.doc(`products/${PRODUCT}/tenants/${tenantId}`), seedStart, counter);
console.log(`  ✓ history spread over Sep–Nov 2026 (${counter.count} documents)`);

console.log(`
Lumen Cycles Research is ready (fictional demo data, emulators only).
  workspace:  ${tenantId}
  people:     ${PEOPLE.length} (sign in as ${person("amara").email}, the owner; password: DEMO_PASSWORD in this script)
  projects:   ${Object.keys(projects).length} · interviews: ${Object.keys(sources).length} · highlights: ${Object.keys(highlights).length}
  open:       /apps/research?workspace=${tenantId}&view=project&project=${projects.checkout}&interview=${sources.dana.id}
`);
process.exit(0);
