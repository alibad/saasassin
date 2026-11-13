#!/usr/bin/env node
/**
 * Seeds a FICTIONAL product research team, "Harvest & Co." (grocery delivery), into
 * LOCAL Firebase emulators for screenshots and demos of Studies.
 *
 * It never touches a real project. It refuses to run unless:
 * - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set, and
 * - FIREBASE_PROJECT_ID starts with "demo-" (Firebase's prefix for projects that
 *   cannot exist in the cloud).
 * Real credentials in the environment are dropped before anything is imported.
 *
 * It drives the real server data layer (src/lib/studies/*, src/lib/fleet/platform/*):
 * studies are built and published by researchers, and every participant session goes
 * through the same public start/submit calls the participant page uses. Afterwards the
 * history and session timings are spread over Oct–Nov 2026.
 *
 * Every person, email (on the reserved `.example` domain), answer and portrait
 * (generated locally, scripts/demo-assets/studies-people) is made up. Only Studies' own
 * data and this script's accounts are replaced on each run.
 *
 * Usage (with the emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8282 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9282 \
 *   node scripts/seed-demo-studies.mjs
 *
 * Then run `next dev` with the same three variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID
 * and NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (see src/lib/firebase/emulators.ts), and
 * sign in as nadia.haddad@harvest-and-co.example with DEMO_PASSWORD below (emulator-only).
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
  console.error(`seed-demo-studies: refusing to run. ${message}`);
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
export const DEMO_PASSWORD = "harvest-emulator-only";
const DOMAIN = "harvest-and-co.example";
const PRODUCT = "studies";

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
const studies = await import("@/lib/studies/data");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// The fictional team
// ---------------------------------------------------------------------------

const PEOPLE = [
  ["nadia", "Nadia Haddad", "Research Lead", "owner"],
  ["tom", "Tom Becker", "UX Researcher", "admin"],
  ["ines", "Inês Duarte", "Product Designer", "member"],
  ["kwame", "Kwame Mensah", "Content Designer", "member"],
  ["arjun", "Arjun Patel", "Design Operations", "member"],
  ["rachel", "Rachel Kim", "Product Manager, Orders", "viewer"],
].map(([key, name, title, role]) => ({
  key,
  name,
  title,
  role,
  uid: `hv-${key}`,
  email: `${key === "ines" ? "ines" : name.split(" ")[0].toLowerCase()}.${name.split(" ").at(-1).toLowerCase()}@${DOMAIN}`,
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

// Stable pseudo-randomness so every run produces the same results.
let seed = 20261113;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pickWeighted = (entries) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries.at(-1)[0];
};
const between = (min, max) => Math.round(min + random() * (max - min));

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
function mapTime(ms) {
  const phase = [...phases].reverse().find((candidate) => ms >= candidate.realStart - 2) ?? null;
  if (!phase || ms > phases.at(-1).realEnd + 2_000) return null;
  const fraction = Math.min(1, Math.max(0, (ms - phase.realStart) / Math.max(1, phase.realEnd - phase.realStart)));
  if (phase.simEnd <= phase.simStart) return phase.simStart + Math.round(fraction * 50 * 60_000);
  return Math.round(phase.simStart + fraction * (phase.simEnd - phase.simStart));
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
// Studies (fictional)
// ---------------------------------------------------------------------------

const welcome = (id, title, body) => ({
  type: "welcome",
  id,
  title,
  body,
  consentRequired: true,
  consentText: "I agree to take part. My answers are stored without my name or email.",
});
const question = { required: true, logic: [], screenOut: [] };

const TREE = [
  ["shop", "Shop", null],
  ["fruit", "Fruit & vegetables", "shop"],
  ["bakery", "Bakery", "shop"],
  ["dairy", "Dairy & eggs", "shop"],
  ["deals", "Deals", "shop"],
  ["orders", "Orders", null],
  ["upcoming", "Upcoming deliveries", "orders"],
  ["order-details", "Order details", "upcoming"],
  ["past", "Past orders", "orders"],
  ["refunds", "Returns & refunds", "orders"],
  ["account", "Account", null],
  ["profile", "Profile", "account"],
  ["addresses", "Addresses", "account"],
  ["payment", "Payment methods", "account"],
  ["preferences", "Delivery preferences", "account"],
  ["notifications", "Notifications", "preferences"],
  ["help", "Help", null],
  ["delivery-help", "Delivery questions", "help"],
  ["contact", "Contact us", "help"],
  ["faq", "FAQs", "help"],
].map(([id, label, parentId]) => ({ id, label, parentId }));

const NAV_STUDY = {
  title: "Account navigation",
  description: "Can people find delivery, refund and notification settings in the proposed app navigation?",
  settings: { participantCap: 60, closeAt: null, endMessage: "Thank you — that really helps us make Harvest easier to use.", minDurationSeconds: null },
  blocks: [
    welcome("intro", "Help us shape the Harvest app", "This takes about four minutes. You'll answer a few questions and look for things in a menu. There are no wrong answers — we're testing the menu, not you."),
    { ...question, type: "multiple_choice", id: "frequency", prompt: "How often do you order groceries online?", allowMultiple: false, screenOut: ["never"], options: [
      { id: "weekly", label: "Every week" }, { id: "monthly", label: "A few times a month" }, { id: "rarely", label: "A few times a year" }, { id: "never", label: "Never" },
    ] },
    { ...question, type: "tree_test", id: "tree", prompt: "Imagine you're using the Harvest app. Tap through the menu to where you'd go.", tree: TREE, tasks: [
      { id: "address", prompt: "Where would you change the delivery address for an order you've already placed?", correctNodeIds: ["order-details"] },
      { id: "refund", prompt: "Where would you ask for a refund for a missing item?", correctNodeIds: ["refunds"] },
      { id: "texts", prompt: "Where would you stop getting text messages about your deliveries?", correctNodeIds: ["notifications"] },
    ] },
    { ...question, type: "opinion_scale", id: "ease", prompt: "How easy was it to find things?", scale: 5, minLabel: "Very hard", maxLabel: "Very easy" },
    { ...question, type: "open_text", id: "confusing", prompt: "Was anything confusing?", required: false, maxLength: 2000 },
  ],
};

const CHECKOUT_STUDY = {
  title: "Checkout first impressions",
  description: "Do shoppers notice the delivery fee and slot before they pay?",
  settings: { participantCap: 40, closeAt: null, endMessage: "Thanks for taking part!", minDurationSeconds: null },
  blocks: [
    welcome("intro", "A quick look at our new checkout", "You'll open a prototype, try to place an order, and tell us how it went. About three minutes."),
    { ...question, type: "website_task", id: "task", prompt: "Add bananas and oat milk to your basket, choose a delivery slot for tomorrow morning and get to the payment step.", url: "https://checkout-prototype.harvest-and-co.example/", successQuestion: "Did you reach the payment step?" },
    { ...question, type: "opinion_scale", id: "confidence", prompt: "How confident were you about the total you'd pay?", scale: 5, minLabel: "Not at all", maxLabel: "Completely" },
    { ...question, type: "multiple_choice", id: "noticed", prompt: "What did you notice before paying?", allowMultiple: true, options: [
      { id: "fee", label: "The delivery fee" }, { id: "slot", label: "The delivery slot" }, { id: "subs", label: "Substitution settings" }, { id: "none", label: "None of these" },
    ] },
    { ...question, type: "yes_no", id: "again", prompt: "Would you use this checkout again?" },
  ],
};

const SORT_STUDY = {
  title: "Help centre card sort",
  description: "How do shoppers group common support topics?",
  settings: { participantCap: 30, closeAt: null, endMessage: "Thank you — your answers were recorded.", minDurationSeconds: null },
  blocks: [
    welcome("intro", "Sort our help topics", "Drag each topic into the group where you'd expect to find it. About two minutes."),
    { ...question, type: "card_sort", id: "sort", prompt: "Put each help topic in the group where you'd look for it.", cards: [
      { id: "slot", label: "Change my delivery slot" }, { id: "missing", label: "An item is missing" }, { id: "damaged", label: "An item arrived damaged" },
      { id: "card", label: "Update my card" }, { id: "promo", label: "Promo code isn't working" }, { id: "cancel", label: "Cancel an order" }, { id: "allergens", label: "Allergen information" },
    ], categories: [
      { id: "orders", label: "Orders & delivery" }, { id: "payments", label: "Payments" }, { id: "products", label: "Products" },
    ] },
  ],
};

const DRAFT_STUDY = {
  title: "Recipe bundles concept",
  description: "Would weekly recipe bundles replace a regular shop?",
  settings: { participantCap: 50, closeAt: null, endMessage: "Thank you — your answers were recorded.", minDurationSeconds: null },
  blocks: [
    welcome("intro", "Tell us about cooking at home", "Five quick questions about how you plan meals."),
    { ...question, type: "multiple_choice", id: "plan", prompt: "How do you usually plan the week's meals?", allowMultiple: false, options: [
      { id: "list", label: "I write a list" }, { id: "recipes", label: "I pick recipes first" }, { id: "none", label: "I don't plan" },
    ] },
    { ...question, type: "opinion_scale", id: "interest", prompt: "How interested would you be in a weekly recipe bundle?", scale: 5, minLabel: "Not at all", maxLabel: "Very" },
  ],
};

// Participant answers -------------------------------------------------------

const COMMENTS = [
  "I expected the address to be in my account settings, not inside the order.",
  "Notifications took me a while — I didn't think of delivery preferences.",
  "Pretty clear overall.",
  "Refunds were exactly where I thought.",
  "Not sure if changing the address in Account would change today's order too.",
  "The Orders section made sense once I opened it.",
  "I looked under Help first for the text messages.",
  "",
  "Nothing really, it was easy.",
  "Would be nice to search instead of tapping through.",
];

function treeAttempt(taskId) {
  const plans = {
    address: [
      [["orders", "upcoming", "order-details"], 26], [["account", "orders", "upcoming", "order-details"], 7], [["account", "addresses"], 10], [["help", "delivery-help"], 2], [null, 3],
    ],
    refund: [
      [["orders", "refunds"], 36], [["help", "orders", "refunds"], 5], [["help", "contact"], 4], [["orders", "past"], 2], [null, 1],
    ],
    texts: [
      [["account", "preferences", "notifications"], 17], [["account", "profile", "preferences", "notifications"], 9], [["help", "faq"], 7], [["account", "profile"], 9], [null, 4],
    ],
  };
  const path = pickWeighted(plans[taskId]);
  if (!path) return { path: random() < 0.5 ? [] : ["help"], selectedNodeId: null, durationMs: between(9_000, 25_000) };
  const indirect = path.length > 3 || (path[0] === "help" && taskId === "refund");
  return { path, selectedNodeId: path.at(-1), durationMs: between(indirect ? 22_000 : 8_000, indirect ? 48_000 : 26_000) };
}

function navAnswers(index) {
  const frequency = pickWeighted([["weekly", 22], ["monthly", 16], ["rarely", 9], ["never", 3]]);
  const answers = { intro: { consented: true }, frequency: { selected: [frequency] } };
  const timings = { intro: between(5_000, 14_000), frequency: between(3_000, 8_000) };
  if (frequency === "never") return { answers, timings };
  const tasks = { address: treeAttempt("address"), refund: treeAttempt("refund"), texts: treeAttempt("texts") };
  answers.tree = { tasks };
  timings.tree = Object.values(tasks).reduce((sum, task) => sum + task.durationMs, 0) + between(2_000, 6_000);
  const failures = Object.entries(tasks).filter(([taskId, task]) => task.selectedNodeId !== ({ address: "order-details", refund: "refunds", texts: "notifications" })[taskId]).length;
  answers.ease = { value: Math.max(1, Math.min(5, pickWeighted([[5, 4], [4, 6], [3, 3], [2, 1]]) - (failures > 1 ? 1 : 0))) };
  timings.ease = between(2_000, 6_000);
  const comment = COMMENTS[index % COMMENTS.length];
  if (comment) answers.confusing = { text: comment };
  timings.confusing = between(4_000, 30_000);
  return { answers, timings };
}

function checkoutAnswers() {
  const success = random() < 0.78;
  const noticed = ["slot"];
  if (random() < 0.42) noticed.push("fee");
  if (random() < 0.3) noticed.push("subs");
  const taskMs = between(success ? 60_000 : 110_000, success ? 140_000 : 220_000);
  return {
    answers: {
      intro: { consented: true },
      task: { success, durationMs: taskMs, opened: true },
      confidence: { value: noticed.includes("fee") ? pickWeighted([[5, 4], [4, 5], [3, 1]]) : pickWeighted([[4, 2], [3, 5], [2, 3]]) },
      noticed: { selected: noticed },
      again: { value: random() < (success ? 0.82 : 0.4) ? "yes" : "no" },
    },
    timings: { intro: between(4_000, 10_000), task: taskMs, confidence: between(3_000, 7_000), noticed: between(4_000, 9_000), again: between(2_000, 4_000) },
  };
}

function sortAnswers() {
  const expected = { slot: "orders", missing: "orders", damaged: "orders", card: "payments", promo: "payments", cancel: "orders", allergens: "products" };
  const alternatives = { missing: "products", damaged: "products", promo: "orders", cancel: "payments", slot: "orders", card: "payments", allergens: "products" };
  const placements = Object.fromEntries(Object.entries(expected).map(([card, category]) => [card, random() < 0.74 ? category : alternatives[card]]));
  return { answers: { intro: { consented: true }, sort: { placements } }, timings: { intro: between(4_000, 9_000), sort: between(50_000, 120_000) } };
}

async function runSessions(tenantId, studyId, count, make) {
  const ids = [];
  for (let index = 0; index < count; index += 1) {
    const { answers, timings } = make(index);
    const session = await studies.startParticipantSession(tenantId, studyId);
    await studies.recordParticipantProgress(tenantId, studyId, { sessionId: session.sessionId, token: session.token, answers, blockTimings: timings, final: true });
    ids.push({ id: session.sessionId, answers, timings });
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Harvest & Co. studies (fictional) into emulators for ${projectId}…`);

await db.recursiveDelete(db.collection("products").doc(PRODUCT));
for (const member of PEOPLE) await auth.deleteUser(member.uid).catch(() => undefined);
const seedStart = Date.now();

for (const member of PEOPLE) {
  await auth.createUser({ uid: member.uid, email: member.email, password: DEMO_PASSWORD, displayName: member.name, emailVerified: true });
  await profiles.updateAccountProfile(PRODUCT, actor(member.key), { name: member.name, title: member.title });
  const photo = new Uint8Array(readFileSync(new URL(`./demo-assets/studies-people/${member.key}.jpg`, import.meta.url)));
  await profiles.setUploadedPhoto(PRODUCT, actor(member.key), photo);
}
console.log(`  ✓ ${PEOPLE.length} people with profile photos`);

let tenantId = "";
await at("2026-10-05T08:40:00Z", null, "workspace created by Nadia", async () => {
  tenantId = (await tenants.createTenant(PRODUCT, actor("nadia"), "Harvest & Co. Research")).id;
});
await at("2026-10-05T09:00:00Z", "2026-10-06T15:00:00Z", "team joined", async () => {
  for (const member of PEOPLE.filter((candidate) => candidate.role !== "owner")) {
    await tenants.grantMembership(PRODUCT, tenantId, actor("nadia"), { uid: member.uid, email: member.email, name: member.name }, member.role);
  }
});

const ids = {};
let navSessions = [];

await at("2026-10-07T09:00:00Z", "2026-10-09T16:00:00Z", "card sort built and run", async () => {
  ids.sort = (await studies.createStudy(actor("kwame"), tenantId, SORT_STUDY)).id;
  await studies.transitionStudy(actor("kwame"), tenantId, ids.sort, "publish");
});
await at("2026-10-09T16:00:00Z", "2026-10-16T18:00:00Z", "card sort responses", async () => {
  await runSessions(tenantId, ids.sort, 24, sortAnswers);
  await studies.transitionStudy(actor("kwame"), tenantId, ids.sort, "close");
});

await at("2026-10-19T09:00:00Z", "2026-10-21T16:00:00Z", "navigation study built and published", async () => {
  ids.nav = (await studies.createStudy(actor("tom"), tenantId, { ...NAV_STUDY, title: "Untitled study", blocks: NAV_STUDY.blocks.slice(0, 2) })).id;
  await studies.updateStudyDraft(actor("ines"), tenantId, ids.nav, NAV_STUDY);
  await studies.transitionStudy(actor("tom"), tenantId, ids.nav, "publish");
});
await at("2026-10-21T16:00:00Z", "2026-11-12T20:00:00Z", "navigation responses", async () => {
  navSessions = await runSessions(tenantId, ids.nav, 50, navAnswers);
});

await at("2026-10-27T09:00:00Z", "2026-10-28T12:00:00Z", "checkout study built and published", async () => {
  ids.checkout = (await studies.createStudy(actor("ines"), tenantId, CHECKOUT_STUDY)).id;
  await studies.transitionStudy(actor("ines"), tenantId, ids.checkout, "publish");
});
await at("2026-10-28T12:00:00Z", "2026-11-12T18:00:00Z", "checkout responses", async () => {
  await runSessions(tenantId, ids.checkout, 29, checkoutAnswers);
});

await at("2026-11-10T10:00:00Z", "2026-11-11T15:00:00Z", "recipe bundles draft", async () => {
  ids.draft = (await studies.createStudy(actor("arjun"), tenantId, DRAFT_STUDY)).id;
});

// Realistic timings: the data layer measured real (milliseconds-long) sessions.
const responseDocs = await db.collection(`products/${PRODUCT}/tenants/${tenantId}/responses`).get();
const speeders = new Set();
for (const [index, doc] of responseDocs.docs.entries()) {
  const timings = { ...(doc.get("blockTimings") ?? {}) };
  if (doc.get("studyId") === ids.nav && doc.get("status") === "completed" && speeders.size < 2 && index % 9 === 4) {
    for (const key of Object.keys(timings)) timings[key] = Math.round(timings[key] / 6);
    speeders.add(doc.id);
  }
  const durationMs = Object.values(timings).reduce((sum, value) => sum + value, 0) + between(3_000, 12_000);
  await doc.ref.update({ blockTimings: timings, ...(doc.get("status") !== "in_progress" ? { durationMs } : {}) });
}

await at("2026-11-12T20:30:00Z", null, "in-progress sessions", async () => {
  for (let index = 0; index < 3; index += 1) await studies.startParticipantSession(tenantId, ids.nav);
});

const failedAddress = navSessions.filter((session) => session.answers.tree?.tasks.address.selectedNodeId === "addresses").map((session) => session.id);
const buriedTexts = navSessions.filter((session) => session.answers.tree?.tasks.texts.selectedNodeId === "profile").map((session) => session.id);

await at("2026-11-05T10:00:00Z", "2026-11-12T16:00:00Z", "quality review and findings", async () => {
  const [speeder] = [...speeders];
  if (speeder) await studies.setResponseExclusion(actor("tom"), tenantId, ids.nav, speeder, { excluded: true, reason: "Finished in under a minute and skipped every task." });
  await studies.createFinding(actor("tom"), tenantId, ids.nav, {
    title: "One in five look for the delivery address under Account",
    summary: "People treat the address as a profile setting, not a property of the order. Most who went to Account → Addresses believed it would change today's delivery too.",
    severity: "high",
    status: "open",
    evidence: [
      { kind: "block", blockId: "tree", note: "Task 1: Account → Addresses is the top wrong destination." },
      ...failedAddress.slice(0, 2).map((responseId) => ({ kind: "response", responseId, blockId: "tree", note: "" })),
    ],
  });
  await studies.createFinding(actor("nadia"), tenantId, ids.nav, {
    title: "Text message settings are buried two levels deep",
    summary: "Notifications sits inside Delivery preferences, so many participants backtracked or gave up at Profile. Lift Notifications to the top of Account.",
    severity: "medium",
    status: "in_progress",
    evidence: [
      { kind: "block", blockId: "tree", note: "Task 3 has the lowest directness of the three tasks." },
      ...buriedTexts.slice(0, 1).map((responseId) => ({ kind: "response", responseId, blockId: "tree", note: "" })),
    ],
  });
  await studies.createFinding(actor("ines"), tenantId, ids.nav, {
    title: "Refunds are found directly by most people",
    summary: "No change needed: Orders → Returns & refunds matches expectations.",
    severity: "low",
    status: "resolved",
    evidence: [{ kind: "block", blockId: "tree", note: "Task 2." }],
  });
  await studies.setResultsSharing(actor("nadia"), tenantId, ids.nav, true);
});

await at("2026-11-12T10:00:00Z", "2026-11-12T15:30:00Z", "webhook and invitation", async () => {
  try {
    await studies.createWebhook(actor("tom"), tenantId, { url: `https://hooks.${DOMAIN}/studies`, events: ["response.completed", "study.closed"] });
  } catch (error) {
    console.warn(`    (webhook skipped: ${error instanceof Error ? error.message : error})`);
  }
  await team.createInvitation(PRODUCT, tenantId, actor("nadia"), { email: `lea.martin@${DOMAIN}`, role: "member" }, (token) => `/apps/studies/invite/${token}`);
});

// Spread sessions over their phases with believable start and end times.
const counter = { count: 0 };
await remapTree(db.doc(`products/${PRODUCT}/tenants/${tenantId}`), seedStart, counter);
const remapped = await db.collection(`products/${PRODUCT}/tenants/${tenantId}/responses`).get();
for (const doc of remapped.docs) {
  const started = doc.get("startedAt");
  const durationMs = doc.get("durationMs");
  if (started && typeof durationMs === "number") await doc.ref.update({ submittedAt: Timestamp.fromMillis(started.toMillis() + durationMs) });
}
console.log(`  ✓ history spread over Oct–Nov 2026 (${counter.count} documents)`);

const shared = (await db.doc(`products/${PRODUCT}/tenants/${tenantId}/studies/${ids.nav}`).get()).get("shareToken");
console.log(`
Harvest & Co. Research is ready (fictional demo data, emulators only).
  workspace:  ${tenantId}
  people:     ${PEOPLE.length} (sign in as ${person("nadia").email}, the owner; password: DEMO_PASSWORD in this script)
  studies:    ${Object.keys(ids).length} · navigation sessions: ${navSessions.length}
  open:       /apps/studies?workspace=${tenantId}&view=study&study=${ids.nav}&tab=results
  participant: /apps/studies/p/${tenantId}/${ids.checkout}
  shared:     /apps/studies/r/${tenantId}/${ids.nav}/${shared}
`);
process.exit(0);
