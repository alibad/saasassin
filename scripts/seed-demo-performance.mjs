#!/usr/bin/env node
/**
 * Seeds a FICTIONAL company, "Northwind Robotics" (30 people), into LOCAL Firebase
 * emulators for demos and marketing recordings of SaaSassin Performance.
 *
 * It never touches a real project. It refuses to run unless:
 * - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set, and
 * - FIREBASE_PROJECT_ID starts with "demo-" (Firebase's prefix for projects that
 *   cannot exist in the cloud).
 * Real credentials in the environment are dropped before anything is imported.
 *
 * It drives the real server data layer (src/lib/lattice/*), so every record and
 * audit event is written exactly as the product writes it. Afterwards, the seeded
 * timestamps are spread over a believable Sep–Nov 2026 history (weekday office
 * hours, Europe/Amsterdam). Actions taken in the app after seeding keep real time.
 *
 * Every person, email (on the reserved `.example` domain) and review below is made
 * up. The emulator data is wiped first on every run.
 *
 * Usage (with the emulators running, e.g. Auth on 9177 and Firestore on 8177):
 *   FIREBASE_PROJECT_ID=demo-saasassin-performance \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8177 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9177 \
 *   node scripts/seed-demo-performance.mjs
 *
 * Then run `next dev` with the same three variables plus
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID=<same demo- id> and
 * NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=<auth host> (see src/lib/firebase/emulators.ts),
 * and sign in as any seeded person with DEMO_PASSWORD below (emulator-only).
 */
import { randomUUID } from "node:crypto";
import { register } from "node:module";

// ---------------------------------------------------------------------------
// Safety gate — before any Firebase module is loaded.
// ---------------------------------------------------------------------------

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

function refuse(message) {
  console.error(`seed-demo-performance: refusing to run. ${message}`);
  process.exit(1);
}

if (!firestoreHost || !authHost) {
  refuse("Set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST to local emulator hosts.");
}
if (!projectId.startsWith("demo-")) {
  refuse(`FIREBASE_PROJECT_ID must start with "demo-" (got "${projectId}").`);
}
if (process.env.NODE_ENV === "production") {
  refuse("NODE_ENV is production.");
}
process.env.NODE_ENV ??= "development";
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
  delete process.env[name];
}

for (const [label, host] of [["Firestore", firestoreHost], ["Auth", authHost]]) {
  try {
    const response = await fetch(`http://${host}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    refuse(`The ${label} emulator at ${host} is not reachable (${error instanceof Error ? error.message : error}).`);
  }
}

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "northwind-emulator-only";
const DOMAIN = "northwind-robotics.example";

// ---------------------------------------------------------------------------
// Load the TypeScript data layer directly: `@/` aliases, `server-only` stub,
// and Node's built-in type stripping (Node 22.18+).
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
const data = await import("@/lib/lattice/data");
const program = await import("@/lib/lattice/program-data");
const integrations = await import("@/lib/lattice/integrations-data");
const { linkInvitedMemberships } = await import("@/lib/lattice/member-links");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// The fictional company
// ---------------------------------------------------------------------------

/**
 * key, name, title, team, manager key, CSV role, and a short profile used to write
 * believable review text. `lead` describes them as a manager (for upward reviews).
 */
const PEOPLE = [
  ["maya", "Maya Okafor", "Chief Executive Officer", "Leadership", null, "manager", {
    did: "closed the Series B and set three company priorities everyone can repeat", evidence: "the board approved the 2027 plan in a single meeting", strength: "clear, short decisions", next: "hand more hiring loops to the leadership team", lead: "keeps our one-to-ones about decisions, not status" }],
  ["rosa", "Rosa Whitfield", "Head of People", "People", "maya", "manager", {
    did: "moved the review program off spreadsheets and ran our first calibrated cycle", evidence: "every packet was released on schedule, with a complete audit trail", strength: "calm, careful process design", next: "run manager training before the mid-year cycle", lead: "gives me real ownership and explains the why behind people decisions" }],
  ["theo", "Theo Lindqvist", "People Operations Specialist", "People", "rosa", "employee", {
    did: "rebuilt onboarding for the fall hiring class", evidence: "new hires had a laptop, accounts and a buddy on day one", strength: "reliable follow-through", next: "own the employee-record cleanup before year end" }],
  ["chen", "Chen Wei", "VP Engineering", "Leadership", "maya", "manager", {
    did: "merged the platform and autonomy roadmaps into one release train", evidence: "four releases shipped this half without a rollback", strength: "technical judgment under pressure", next: "grow a second engineering manager in hardware", lead: "protects focus time and makes trade-offs explicit" }],
  ["ana", "Ana Petrova", "Engineering Manager, Platform", "Platform", "chen", "manager", {
    did: "cut firmware rollout time from three days to under one", evidence: "the last four rollouts finished inside 24 hours with no rollback", strength: "turning stressful releases into routine", next: "hand the release process to Dara and hire a third engineer", lead: "gives clear ownership and real coaching in our one-to-ones" }],
  ["ben", "Ben Carter", "Senior Robotics Engineer", "Platform", "ana", "employee", {
    did: "led the gripper controller rewrite", evidence: "grasp failures in the warehouse pilot fell by a third", strength: "patient, thorough code review", next: "write the controller design doc for new hires" }],
  ["dara", "Dara Nwosu", "Firmware Engineer", "Platform", "ana", "employee", {
    did: "shipped over-the-air updates for the field fleet", evidence: "the last rollout reached every robot in under a day", strength: "careful release discipline", next: "automate the hardware-in-the-loop test rig" }],
  ["ilan", "Ilan Brooks", "Engineering Manager, Autonomy", "Autonomy", "chen", "manager", {
    did: "stabilized navigation for the second customer site", evidence: "interventions per shift dropped from nine to two", strength: "turning incidents into roadmap items", next: "hire a senior perception engineer", lead: "runs blameless incident reviews that actually change things" }],
  ["priya", "Priya Raman", "Perception Engineer", "Autonomy", "ilan", "employee", {
    did: "retrained the pallet detector on night-shift footage", evidence: "low-light recall rose from 81 to 94 percent", strength: "rigorous evaluation", next: "share the evaluation harness with the whole team" }],
  ["mateo", "Mateo Alvarez", "Motion Planning Engineer", "Autonomy", "ilan", "employee", {
    did: "added smooth replanning around people in aisles", evidence: "safety stops fell by 40 percent at the pilot site", strength: "simulations that explain behaviour", next: "pair with QA on regression scenarios" }],
  ["hana", "Hana Sato", "Simulation Engineer", "Autonomy", "ilan", "employee", {
    did: "built the nightly simulation suite", evidence: "it caught two planner regressions before they reached a robot", strength: "tools other people actually use", next: "cut the suite runtime in half" }],
  ["jonas", "Jonas Weber", "Machine Learning Engineer", "Autonomy", "ilan", "employee", {
    did: "moved model training onto a reproducible pipeline", evidence: "any production model can now be rebuilt from a tag", strength: "quiet reliability", next: "demo his work more often" }],
  ["kofi", "Kofi Asante", "Hardware Lead", "Hardware", "chen", "manager", {
    did: "brought the v3 chassis from prototype to pilot build", evidence: "the pilot build passed vibration testing on the first run", strength: "pragmatic design reviews", next: "write down supplier decisions for the team", lead: "makes time to teach, even in crunch weeks" }],
  ["lena", "Lena Fischer", "Mechanical Engineer", "Hardware", "kofi", "employee", {
    did: "redesigned the battery bay for tool-free swaps", evidence: "a battery swap now takes under two minutes", strength: "designs technicians love", next: "lead the v4 enclosure study" }],
  ["ravi", "Ravi Menon", "Electrical Engineer", "Hardware", "kofi", "employee", {
    did: "simplified the power distribution board", evidence: "it went from 14 to 9 components with no field failures", strength: "thorough bench testing", next: "mentor the incoming hardware intern" }],
  ["sofia", "Sofia Marin", "Test Technician", "Hardware", "kofi", "employee", {
    did: "set up the end-of-line test station", evidence: "every pilot unit now ships with a signed test record", strength: "spotting issues before anyone asks", next: "train operations on the test station" }],
  ["omar", "Omar Haddad", "Head of Operations", "Operations", "maya", "manager", {
    did: "stood up the pilot production line", evidence: "we built 40 robots this half against a plan of 36", strength: "steady planning", next: "second-source the drive motors", lead: "is clear about priorities and shows up when the line stops" }],
  ["elena", "Elena Rossi", "Supply Chain Manager", "Operations", "omar", "employee", {
    did: "renegotiated lead times with our two main suppliers", evidence: "average part lead time fell from 11 to 7 weeks", strength: "calm negotiation", next: "build a shortage early-warning report" }],
  ["tomas", "Tomás Silva", "Manufacturing Technician", "Operations", "omar", "employee", {
    did: "wrote the assembly work instructions for the pilot line", evidence: "first-pass yield reached 92 percent", strength: "precise, visual documentation", next: "cross-train on the test station" }],
  ["nora", "Nora Kim", "Quality Engineer", "Operations", "omar", "employee", {
    did: "introduced weekly defect reviews with engineering", evidence: "open defects fell from 48 to 15", strength: "data-driven root-cause work", next: "own supplier quality audits" }],
  ["julia", "Julia Novak", "Head of Sales", "Sales", "maya", "manager", {
    did: "closed our first multi-site warehouse contract", evidence: "pipeline for next half is three times target", strength: "honest forecasting", next: "hand pilots to customer success earlier", lead: "coaches deals without taking them over" }],
  ["marcus", "Marcus Reed", "Account Executive", "Sales", "julia", "employee", {
    did: "turned two pilots into paid deployments", evidence: "both customers expanded within a quarter", strength: "listening before pitching", next: "tighten mutual action plans" }],
  ["aisha", "Aisha Bello", "Account Executive", "Sales", "julia", "employee", {
    did: "opened the logistics vertical in the Nordics", evidence: "four qualified opportunities from a standing start", strength: "persistent, thoughtful outreach", next: "pair with solutions on technical discovery" }],
  ["felix", "Felix Wagner", "Solutions Engineer", "Sales", "julia", "employee", {
    did: "built the site-survey toolkit", evidence: "a site survey now takes one day instead of three", strength: "translating customer needs for engineering", next: "record a library of demo scenarios" }],
  ["camille", "Camille Laurent", "Customer Success Manager", "Customer Success", "julia", "manager", {
    did: "launched quarterly business reviews for every customer", evidence: "every customer renewed this half", strength: "trusted relationships", next: "build a health score from operations data", lead: "shares customer context so I understand the why" }],
  ["diego", "Diego Morales", "Support Engineer", "Customer Success", "camille", "employee", {
    did: "set up remote diagnostics for robots in the field", evidence: "median time to resolve dropped from two days to five hours", strength: "patient troubleshooting", next: "write runbooks for the top ten issues" }],
  ["grace", "Grace Mensah", "Field Service Engineer", "Customer Success", "camille", "employee", {
    did: "commissioned robots at three new customer sites", evidence: "every site went live in its scheduled week", strength: "steady under pressure on site", next: "train customer maintenance teams" }],
  ["hiro", "Hiro Tanaka", "Finance Lead", "Finance", "maya", "employee", {
    did: "moved us to a five-day monthly close", evidence: "the board pack now goes out on day seven", strength: "clarity with numbers", next: "build unit economics per deployment" }],
  ["zara", "Zara Ahmed", "Product Manager", "Product", "maya", "manager", {
    did: "ran discovery with six warehouse operators", evidence: "the fleet dashboard roadmap now traces back to real interviews", strength: "crisp problem framing", next: "write fewer, sharper specs", lead: "gives detailed, kind feedback on my work" }],
  ["sam", "Sam Ortiz", "Product Designer", "Product", "zara", "employee", {
    did: "redesigned the fleet dashboard", evidence: "operators found blocked robots twice as fast in testing", strength: "fast prototyping", next: "start a small design system" }],
].map(([key, name, title, team, manager, role, profile]) => ({
  key, name, title, team, manager, role, profile,
  first: name.split(" ")[0],
  email: `${name.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}.${name.split(" ").slice(-1)[0].toLowerCase()}@${DOMAIN}`,
  uid: `nw-${key}`,
}));

const byKey = new Map(PEOPLE.map((person) => [person.key, person]));
const person = (key) => {
  const found = byKey.get(key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return found;
};
const actor = (key) => ({ uid: person(key).uid, email: person(key).email, name: person(key).name, emailVerified: true });
const owner = actor("rosa");

// Stable pseudo-randomness so every run produces the same company.
let seed = 20261113;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// ---------------------------------------------------------------------------
// Simulated history: each step's real writes are spread over a sim window.
// ---------------------------------------------------------------------------

const phases = [];
async function at(simStart, simEnd, label, work) {
  const realStart = Date.now();
  await work();
  // Server timestamps can land a few ms after the call returns.
  await new Promise((resolve) => setTimeout(resolve, 25));
  const realEnd = Date.now();
  phases.push({ realStart, realEnd, simStart: Date.parse(simStart), simEnd: Date.parse(simEnd ?? simStart) });
  console.log(`  ✓ ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 25));
}

/** Weekday office hours, 09:00–18:00 Europe/Amsterdam (UTC+1 in this period). */
const OFFICE_START_UTC = 8;
const OFFICE_END_UTC = 17;
function officeMinutes(startMs, endMs) {
  const minutes = [];
  for (let t = startMs; t <= endMs; t += 60_000) {
    const date = new Date(t);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();
    if (day !== 0 && day !== 6 && hour >= OFFICE_START_UTC && hour < OFFICE_END_UTC) minutes.push(t);
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
    const original = snapshot.data();
    const updated = remap(original, seedStart);
    await reference.set(updated);
    counter.count += 1;
  }
  for (const collection of await reference.listCollections()) {
    for (const document of await collection.listDocuments()) {
      await remapTree(document, seedStart, counter);
    }
  }
}

// ---------------------------------------------------------------------------
// Review writing helpers
// ---------------------------------------------------------------------------

const ANA_REVIEWS = {
  self: {
    outcomes: "Cut fleet firmware rollout time from three days to under one, and grew Platform from one engineer to two without slowing delivery.",
    evidence: "The release dashboard shows the last four rollouts finishing inside 24 hours with no rollback. Ben and Dara each led a release on their own this half.",
    rating: 4,
    next: "Hand the release process to Dara completely and spend more time hiring for the third Platform seat.",
  },
  manager: {
    outcomes: "Ana turned firmware releases from an all-hands event into a routine, and took on her first two direct reports while doing it.",
    evidence: "Rollout time went from three days to under one. Ben led the gripper controller rewrite and Dara shipped over-the-air updates, both with Ana coaching rather than doing.",
    rating: 4,
    next: "Write down the 2027 platform roadmap and share it beyond engineering, so sales and operations can plan around it.",
  },
  ilan: {
    outcomes: "Ana's release process let Autonomy ship navigation fixes weekly instead of monthly.",
    evidence: "When the second customer site needed a Saturday hotfix, her rollback plan was ready before we asked for it.",
    rating: 5,
    next: "Bring Autonomy into release planning earlier; we sometimes hear about freeze dates late.",
  },
  kofi: {
    outcomes: "Platform and Hardware finally share one test plan for the v3 chassis.",
    evidence: "Her team joined every pilot-build test day and fixed firmware issues on the spot.",
    rating: 4,
    next: "Document the firmware–hardware interface so new hardware engineers ramp up faster.",
  },
  zara: {
    outcomes: "Ana gave product honest estimates, and they held.",
    evidence: "Firmware support for the fleet dashboard landed in the sprint she committed to.",
    rating: 4,
    next: "Say no a little earlier when scope creeps; we would rather hear it in planning.",
  },
  ben: {
    outcomes: "Ana gave me the gripper rewrite end to end and stayed out of the way.",
    evidence: "Our weekly one-to-ones always ended with one clear next step.",
    rating: 5,
    next: "Share more of the hiring plan with the team.",
  },
  dara: {
    outcomes: "Ana made releases calm. I led one on my own by October.",
    evidence: "She paired with me on the first rollout and then handed it over.",
    rating: 4,
    next: "Protect a little more focus time during release weeks.",
  },
};

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function baseRating(key) {
  const ratings = { maya: 4, rosa: 4, theo: 4, chen: 4, ana: 4, ben: 5, dara: 4, ilan: 4, priya: 5, mateo: 4, hana: 4, jonas: 3, kofi: 4, lena: 5, ravi: 3, sofia: 3, omar: 4, elena: 3, tomas: 3, nora: 4, julia: 3, marcus: 4, aisha: 3, felix: 4, camille: 4, diego: 3, grace: 3, hiro: 4, zara: 4, sam: 2 };
  return ratings[key] ?? 3;
}

function answersFor(cycle, review) {
  const subject = review.subject;
  const reviewer = review.reviewer;
  const p = subject.profile;
  if (cycle === "fall" && subject.key === "ana") {
    const text = review.direction === "self" ? ANA_REVIEWS.self
      : review.direction === "manager" ? ANA_REVIEWS.manager
        : ANA_REVIEWS[reviewer.key];
    if (text) return text;
  }
  const rating = Math.max(1, Math.min(5, baseRating(subject.key) + (random() < 0.2 ? (random() < 0.5 ? -1 : 1) : 0)));
  if (cycle === "fall") {
    if (review.direction === "self") {
      return { outcomes: `I ${p.did}.`, evidence: `${capitalize(p.evidence)}.`, rating, next: `I want to ${p.next}.` };
    }
    if (review.direction === "manager") {
      return { outcomes: `${subject.first} ${p.did}.`, evidence: `${capitalize(p.evidence)}. ${pick(["This was visible to the whole team.", "Customers noticed too.", "It made the next quarter easier to plan."])}`, rating, next: `${capitalize(p.next)}.` };
    }
    if (review.direction === "peer") {
      return { outcomes: `Working with ${subject.first}, I saw ${p.strength} up close.`, evidence: `${capitalize(p.evidence)}, and it made my own work easier.`, rating, next: pick([`Share more of how ${subject.first} works with the rest of the company.`, `Pull other teams in earlier.`, `Write more of it down so others can reuse it.`]) };
    }
    return { outcomes: `As my manager, ${subject.first} ${p.lead ?? "is supportive and clear"}.`, evidence: pick(["Our one-to-ones are short and useful.", "Priorities are clear even in busy weeks.", "I always know why a decision was made."]), rating, next: pick(["More context on company plans would help.", "Celebrate wins a little more often.", "Keep doing what you are doing."]) };
  }
  // Quarterly project check-in
  if (review.direction === "self") {
    return { went_well: `I ${p.did}.`, change: `Next quarter I want to ${p.next}.`, delivery: rating };
  }
  if (review.direction === "manager") {
    return { went_well: `${subject.first} ${p.did}; ${p.evidence}.`, change: `${capitalize(p.next)}.`, delivery: rating };
  }
  return { went_well: `${subject.first}'s ${p.strength} helped our project.`, change: "Share progress a little earlier.", delivery: rating };
}

function partial(answers) {
  const [firstKey] = Object.keys(answers);
  return { [firstKey]: answers[firstKey] };
}

function csvField(value) {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function reviewsOf(organizationId, cycleId) {
  const snapshot = await db.collection(`organizations/${organizationId}/reviewCycles/${cycleId}/reviews`).get();
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Northwind Robotics (fictional) into emulators for ${projectId}…`);

// 0. Wipe the demo project's emulator data.
for (const url of [
  `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
  `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
]) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) refuse(`Could not clear emulator data at ${url} (HTTP ${response.status}).`);
}

const seedStart = Date.now();

// 1. Emulator-only sign-in accounts with verified fictional emails.
for (const member of PEOPLE) {
  await auth.createUser({ uid: member.uid, email: member.email, password: DEMO_PASSWORD, displayName: member.name, emailVerified: true });
}
console.log(`  ✓ ${PEOPLE.length} emulator accounts`);

let organizationId = "";
await at("2026-09-14T09:12:00Z", null, "workspace created by Rosa Whitfield (Head of People)", async () => {
  organizationId = await data.createOrganization(owner, "Northwind Robotics");
});

await at("2026-09-15T08:30:00Z", null, "directory imported from CSV", async () => {
  const lines = ["name,email,title,team,manager_email,role"];
  for (const member of PEOPLE) {
    const manager = member.manager ? person(member.manager).email : "";
    lines.push([member.name, member.email, member.title, member.team, manager, member.role].map(csvField).join(","));
  }
  const preview = await data.importEmployees({ actor: owner, organizationId, csv: `${lines.join("\n")}\n`, dryRun: false });
  if (preview.errors.length) throw new Error(preview.errors.join(" "));
});

await at("2026-09-15T09:00:00Z", "2026-09-18T16:00:00Z", "employees signed in and claimed their records", async () => {
  for (const member of PEOPLE.filter((candidate) => candidate.key !== "rosa")) {
    await linkInvitedMemberships(actor(member.key));
  }
});

const members = await db.collection(`organizations/${organizationId}/members`).get();
const memberIdByEmail = new Map(members.docs.map((document) => [String(document.data().email), document.id]));
const memberId = (key) => memberIdByEmail.get(person(key).email);
const keyByMemberId = new Map(PEOPLE.map((member) => [memberIdByEmail.get(member.email), member.key]));

let fallTemplate = "";
let checkInTemplate = "";
const FALL_QUESTIONS = [
  { key: "outcomes", prompt: "What were the most important outcomes this cycle?", type: "text" },
  { key: "evidence", prompt: "What evidence shows the impact?", type: "text" },
  { key: "rating", prompt: "Overall performance", type: "rating" },
  { key: "next", prompt: "What should the focus be next cycle?", type: "text" },
].map((question) => ({ ...question, id: randomUUID() }));
const CHECK_IN_QUESTIONS = [
  { key: "went_well", prompt: "What went well on your project this quarter?", type: "text" },
  { key: "change", prompt: "What should change next quarter?", type: "text" },
  { key: "delivery", prompt: "Delivery against plan", type: "rating" },
].map((question) => ({ ...question, id: randomUUID() }));
const toAnswers = (questions, answers) => Object.fromEntries(
  questions.filter((question) => answers[question.key] !== undefined).map((question) => [question.id, answers[question.key]]),
);

await at("2026-09-21T10:05:00Z", null, "360 review template", async () => {
  fallTemplate = await data.createReviewTemplate({
    actor: owner,
    organizationId,
    name: "360 performance review",
    directions: ["self", "manager", "peer", "upward"],
    questions: FALL_QUESTIONS.map(({ id, prompt, type }) => ({ id, prompt, type, required: true })),
  });
});

// Goals and the first round of feedback.
const GOALS = [
  ["ana", "ana", "Cut firmware rollout time to under one day", "Every fleet rollout completes inside 24 hours with an automatic rollback path.", "2026-12-15", "public", [[40, "on_track", "Staged rollouts live on 20% of the fleet."], [75, "on_track", "Two rollouts under 30 hours."], [100, "done", "Last four rollouts finished inside 24 hours."]]],
  ["chen", "ana", "Hire a third Platform engineer", "Offer accepted by the end of the year.", "2026-12-31", "manager", [[30, "at_risk", "Two finalists withdrew; search reopened with a wider brief."]]],
  ["ana", "ben", "Ship gripper controller v2 to every pilot site", "All three pilot sites on v2 with grasp failure rate under 2%.", "2026-12-18", "public", [[50, "on_track", "Site one live."], [80, "on_track", "Site two live; site three scheduled."]]],
  ["ana", "dara", "Hardware-in-the-loop tests for every firmware release", "No release ships without a passing rig run.", "2026-12-11", "public", [[55, "at_risk", "Rig parts delayed two weeks."]]],
  ["ilan", "ilan", "Under two interventions per shift at site two", "Measured over four consecutive weeks.", "2026-11-30", "public", [[60, "on_track", "Down to four per shift."], [100, "done", "Two per shift for four weeks running."]]],
  ["ilan", "priya", "Low-light detection recall above 90%", "Measured on the night-shift evaluation set.", "2026-11-20", "public", [[70, "on_track", "Recall at 88%."], [100, "done", "Recall at 94% on the night-shift set."]]],
  ["kofi", "kofi", "v3 chassis pilot build passes vibration testing", "First-run pass on all pilot units.", "2026-10-30", "public", [[100, "done", "Passed on the first run."]]],
  ["omar", "omar", "Build 36 robots this half", "Pilot line output, quality-approved.", "2026-12-20", "public", [[60, "on_track", "22 built."], [90, "on_track", "32 built; ahead of plan."]]],
  ["omar", "elena", "Second source for drive motors", "A qualified second supplier under contract.", "2026-12-31", "manager", [[20, "off_track", "Best quote is 30% over budget."]]],
  ["julia", "julia", "Three signed multi-site contracts", "Signed contracts with at least two sites each.", "2026-12-31", "public", [[33, "on_track", "First contract signed."], [60, "at_risk", "Second contract slipped to January legal review."]]],
  ["camille", "camille", "A health score for every customer", "Weekly score combining uptime, tickets and usage.", "2026-12-15", "public", [[50, "on_track", "Uptime and ticket signals live."]]],
  ["zara", "zara", "Fleet dashboard v2 beta with two customers", "Two customer sites using v2 weekly.", "2026-12-18", "public", [[40, "on_track", "First site onboarded."], [70, "on_track", "Second site scheduled for next week."]]],
  ["rosa", "rosa", "Run the first calibrated review cycle", "Every packet released and acknowledged on schedule.", "2026-11-27", "public", [[50, "on_track", "Writing complete."], [90, "on_track", "Packets released; acknowledgements coming in."]]],
  ["rosa", "theo", "Clean up employee records before year end", "Titles, teams and managers verified for everyone.", "2026-12-19", "manager", [[60, "on_track", "Engineering and Operations verified."]]],
];
const goalIds = [];
await at("2026-09-22T08:00:00Z", "2026-10-02T16:00:00Z", "goals set", async () => {
  for (const [creator, ownerKey, title, description, dueDate, visibility] of GOALS) {
    goalIds.push(await program.createGoal({ actor: actor(creator), organizationId, ownerId: memberId(ownerKey), title, description, dueDate, visibility }));
  }
});

const FEEDBACK_EARLY = [
  ["ilan", "ana", "praise", "Your rollback plan for the site-two hotfix was ready before we asked. That calm made the whole weekend easier.", "public"],
  ["kofi", "lena", "praise", "The tool-free battery bay is the best thing the technicians have seen all year.", "public"],
  ["zara", "sam", "constructive", "The dashboard prototypes are strong. Next time, test with an operator before the design review, not after.", "manager"],
  ["omar", "tomas", "praise", "Your work instructions got the night shift productive in a week.", "public"],
  ["ben", "dara", "praise", "Thanks for staying late to verify the gripper firmware on the real robot.", "private"],
  ["julia", "felix", "praise", "The site-survey toolkit won us the second pilot.", "public"],
];
await at("2026-09-25T09:00:00Z", "2026-10-09T16:00:00Z", "feedback, first weeks", async () => {
  for (const [author, recipient, kind, body, visibility] of FEEDBACK_EARLY) {
    await program.giveFeedback({ actor: actor(author), organizationId, recipientId: memberId(recipient), kind, body, visibility });
  }
});

// Fall cycle: nominations → writing → calibration → packets.
let fallCycle = "";
await at("2026-10-05T13:20:00Z", null, "Fall 2026 cycle drafted", async () => {
  fallCycle = await data.createReviewCycle({
    actor: owner,
    organizationId,
    name: "Fall 2026 performance cycle",
    templateId: fallTemplate,
    dueDate: "2026-11-06",
    peerNominationEnabled: true,
    calibrationEnabled: true,
    anonymityThreshold: 3,
    schedule: { launchOn: "2026-10-12", nominationEndsOn: "2026-10-19", calibrationEndsOn: "2026-11-11", acknowledgementEndsOn: "2026-11-27" },
  });
});
const move = (cycleId, targetState, by = owner) => program.transitionReviewCycle({ actor: by, organizationId, cycleId, targetState, dryRun: false });

await at("2026-10-12T08:05:00Z", null, "Fall 2026 launched into peer nomination", async () => {
  const preview = await move(fallCycle, "peer_nomination");
  if (!preview.canTransition) throw new Error(preview.blockers.join(" "));
});

/** subject → nominated peers; `self` nominations wait for the manager's decision. */
const FALL_PEERS = {
  maya: [["chen", "julia", "omar"], "admin"], rosa: [["chen", "omar", "zara"], "self"], theo: [["hiro", "camille", "elena"], "manager"],
  chen: [["omar", "zara", "julia"], "manager"], ana: [["ilan", "kofi", "zara"], "self"], ben: [["dara", "mateo", "lena"], "manager"],
  dara: [["ben", "sofia", "hana"], "self"], ilan: [["ana", "kofi", "zara"], "manager"], priya: [["mateo", "hana", "jonas"], "self"],
  mateo: [["priya", "hana", "ben"], "manager"], hana: [["priya", "jonas", "mateo"], "self"], jonas: [["priya", "hana", "sam"], "manager"],
  kofi: [["ana", "omar", "nora"], "self"], lena: [["ravi", "sofia", "tomas"], "manager"], ravi: [["lena", "sofia", "dara"], "self"],
  sofia: [["ravi", "lena", "nora"], "manager"], omar: [["kofi", "julia", "hiro"], "manager"], elena: [["nora", "tomas", "hiro"], "self"],
  tomas: [["nora", "sofia", "elena"], "manager"], nora: [["elena", "tomas", "kofi"], "self"], julia: [["omar", "zara", "camille"], "manager"],
  marcus: [["aisha", "felix", "camille"], "self"], aisha: [["marcus", "felix", "grace"], "manager"], felix: [["marcus", "aisha", "diego"], "self"],
  camille: [["julia", "marcus", "zara"], "manager"], diego: [["grace", "felix", "theo"], "self"], grace: [["diego", "lena"], "manager"],
  hiro: [["omar", "zara"], "self"], zara: [["ana", "julia", "sam"], "manager"], sam: [["zara", "felix", "hana", "jonas"], "self"],
};
await at("2026-10-12T09:00:00Z", "2026-10-16T16:00:00Z", "peer nominations", async () => {
  for (const [subjectKey, [peers, by]] of Object.entries(FALL_PEERS)) {
    const subject = person(subjectKey);
    const nominator = by === "self" ? subjectKey : by === "manager" ? subject.manager : "rosa";
    await program.nominatePeers({ actor: actor(nominator), organizationId, cycleId: fallCycle, subjectId: memberId(subjectKey), peerIds: peers.map(memberId) });
  }
});
await at("2026-10-15T09:00:00Z", "2026-10-19T15:00:00Z", "managers decided pending nominations", async () => {
  const nominations = await db.collection(`organizations/${organizationId}/reviewCycles/${fallCycle}/nominations`).where("state", "==", "pending").get();
  for (const nomination of nominations.docs) {
    const subjectKey = keyByMemberId.get(nomination.data().subjectId);
    const peerKey = keyByMemberId.get(nomination.data().peerId);
    // Sam nominated his own manager as a peer; Zara declines that one.
    const decision = subjectKey === "sam" && peerKey === "zara" ? "declined" : "approved";
    await program.decideNomination({ actor: actor(person(subjectKey).manager), organizationId, cycleId: fallCycle, nominationId: nomination.id, decision });
  }
});
await at("2026-10-20T08:00:00Z", null, "Fall 2026 opened for writing", async () => {
  const preview = await move(fallCycle, "review_writing");
  if (!preview.canTransition) throw new Error(preview.blockers.join(" "));
});

const fallReviews = (await reviewsOf(organizationId, fallCycle)).map((review) => ({
  ...review,
  subject: person(keyByMemberId.get(review.subjectId)),
  reviewer: person(keyByMemberId.get(review.reviewerId)),
}));
// Stable, shuffled submission order so the history interleaves people.
const fallOrder = [...fallReviews].sort((a, b) => a.id.localeCompare(b.id));
const fallEarly = fallOrder.slice(0, Math.floor(fallOrder.length * 0.7));
const fallLate = fallOrder.slice(fallEarly.length);
const submitFall = async (review) => data.saveReview({
  actor: actor(review.reviewer.key),
  organizationId,
  cycleId: fallCycle,
  reviewId: review.id,
  answers: toAnswers(FALL_QUESTIONS, answersFor("fall", review)),
  submit: true,
});

await at("2026-10-20T09:30:00Z", "2026-10-23T16:00:00Z", "goal check-ins, round one", async () => {
  for (const [index, goal] of GOALS.entries()) {
    const [creator, ownerKey, , , , , checkIns] = goal;
    for (const [progress, status, note] of checkIns.slice(0, Math.max(1, checkIns.length - 1))) {
      await program.checkInGoal({ actor: actor(checkIns.length > 1 ? ownerKey : creator), organizationId, goalId: goalIds[index], progress, status, note });
    }
  }
});
await at("2026-10-21T08:00:00Z", "2026-11-03T08:30:00Z", "Fall 2026 reviews, most of them", async () => {
  for (const review of fallEarly) await submitFall(review);
});

// Quarterly check-in cycle (left in writing, partly complete).
let checkInCycle = "";
await at("2026-10-26T10:00:00Z", null, "quarterly check-in template and cycle", async () => {
  checkInTemplate = await data.createReviewTemplate({
    actor: owner,
    organizationId,
    name: "Quarterly project check-in",
    directions: ["self", "manager", "peer"],
    questions: CHECK_IN_QUESTIONS.map(({ id, prompt, type }) => ({ id, prompt, type, required: true })),
  });
  checkInCycle = await data.createReviewCycle({
    actor: owner,
    organizationId,
    name: "Q4 2026 project check-in",
    templateId: checkInTemplate,
    dueDate: "2026-11-27",
    peerNominationEnabled: true,
    calibrationEnabled: true,
    anonymityThreshold: 3,
  });
});
await at("2026-10-27T08:10:00Z", null, "Q4 check-in launched", async () => {
  await move(checkInCycle, "peer_nomination");
});
const CHECK_IN_PEERS = {
  ben: ["dara"], dara: ["ben"], priya: ["mateo", "hana"], mateo: ["hana", "jonas"], hana: ["priya"], jonas: ["priya"],
  lena: ["ravi"], ravi: ["sofia"], sofia: ["lena"], marcus: ["aisha"], aisha: ["felix"], diego: ["grace"],
};
await at("2026-10-27T09:00:00Z", "2026-10-30T15:00:00Z", "Q4 peers nominated by managers", async () => {
  for (const [subjectKey, peers] of Object.entries(CHECK_IN_PEERS)) {
    await program.nominatePeers({ actor: actor(person(subjectKey).manager), organizationId, cycleId: checkInCycle, subjectId: memberId(subjectKey), peerIds: peers.map(memberId) });
  }
});
await at("2026-11-02T08:00:00Z", null, "Q4 check-in opened for writing", async () => {
  await move(checkInCycle, "review_writing");
});

await at("2026-11-03T10:00:00Z", "2026-11-06T16:30:00Z", "Fall 2026 reviews, the rest", async () => {
  for (const review of fallLate) await submitFall(review);
});

const FEEDBACK_LATE = [
  ["zara", "ana", "constructive", "Flag scope risks in sprint planning rather than mid-sprint. Your estimates are good; the surprises come from late scope.", "manager"],
  ["ben", "ana", "praise", "Thank you for handing me the gripper rewrite and trusting me with it.", "private"],
  ["chen", "ilan", "praise", "The site-two incident review was the clearest write-up we have had.", "public"],
  ["camille", "diego", "praise", "Remote diagnostics turned a two-day site visit into a ten-minute call for our biggest customer.", "public"],
  ["nora", "elena", "praise", "Thanks for chasing the supplier on the encoder defect; it is fixed at the source now.", "public"],
  ["rosa", "theo", "praise", "Onboarding for the fall class was the smoothest we have run.", "manager"],
  ["maya", "rosa", "praise", "The new review process is the first one people have thanked us for.", "public"],
  ["mateo", "hana", "praise", "The nightly sim suite saved my planner change from a very bad Monday.", "public"],
  ["julia", "aisha", "constructive", "Great Nordic pipeline. Bring Felix into discovery calls earlier so technical questions don't stall deals.", "manager"],
  ["priya", "jonas", "praise", "Being able to rebuild any model from a tag made the recall investigation possible.", "public"],
];
await at("2026-11-04T09:00:00Z", "2026-11-12T16:00:00Z", "feedback, recent weeks", async () => {
  for (const [author, recipient, kind, body, visibility] of FEEDBACK_LATE) {
    await program.giveFeedback({ actor: actor(author), organizationId, recipientId: memberId(recipient), kind, body, visibility });
  }
});

// Quarterly check-in progress: about 60% submitted, a few drafts, the rest untouched.
const checkInReviews = (await reviewsOf(organizationId, checkInCycle)).map((review) => ({
  ...review,
  subject: person(keyByMemberId.get(review.subjectId)),
  reviewer: person(keyByMemberId.get(review.reviewerId)),
})).sort((a, b) => a.id.localeCompare(b.id));
const RECORD_FOR_CAMERA = (review) => review.reviewer.key === "rosa" && review.subject.key === "theo";
await at("2026-11-03T09:00:00Z", "2026-11-12T16:30:00Z", "Q4 check-in reviews in progress", async () => {
  let index = 0;
  for (const review of checkInReviews) {
    index += 1;
    if (RECORD_FOR_CAMERA(review)) continue; // Rosa writes this one on camera.
    const answers = toAnswers(CHECK_IN_QUESTIONS, answersFor("checkin", review));
    const roll = (index * 37) % 100;
    if (review.reviewer.key === "rosa" || (roll >= 62 && roll < 74)) {
      await data.saveReview({ actor: actor(review.reviewer.key), organizationId, cycleId: checkInCycle, reviewId: review.id, answers: partial(answers), submit: false });
    } else if (roll < 62) {
      await data.saveReview({ actor: actor(review.reviewer.key), organizationId, cycleId: checkInCycle, reviewId: review.id, answers, submit: true });
    }
  }
});

await at("2026-11-09T08:00:00Z", null, "Fall 2026 moved to calibration", async () => {
  const preview = await move(fallCycle, "calibration");
  if (!preview.canTransition) throw new Error(preview.blockers.join(" "));
});
const NOTES = ["Consistent with manager and peer signal.", "Strong peer signal; manager agrees.", "Discussed with the leadership group.", "Rating held after comparing with the team.", ""];
await at("2026-11-09T09:00:00Z", "2026-11-11T16:00:00Z", "calibration", async () => {
  for (const member of PEOPLE) {
    await program.saveCalibration({ actor: owner, organizationId, cycleId: fallCycle, subjectId: memberId(member.key), rating: baseRating(member.key), note: pick(NOTES) });
  }
});
await at("2026-11-12T08:30:00Z", null, "Fall 2026 packets released", async () => {
  const preview = await move(fallCycle, "acknowledgement");
  if (!preview.canTransition) throw new Error(preview.blockers.join(" "));
});

// Most people acknowledge; Ana and a few others have not yet.
const NOT_YET = new Set(["ana", "jonas", "sofia", "julia", "aisha", "grace", "sam", "hiro", "tomas"]);
const COMMENTS = { ben: "Thanks. Agreed on the design-doc focus.", lena: "Appreciate the detail from peers.", omar: "Fair summary of a busy half.", rosa: "Thank you, Maya.", priya: "Happy to share the harness next cycle." };
await at("2026-11-12T09:00:00Z", "2026-11-13T09:30:00Z", "packets acknowledged", async () => {
  for (const member of PEOPLE.filter((candidate) => !NOT_YET.has(candidate.key))) {
    await program.acknowledgePacket({ actor: actor(member.key), organizationId, cycleId: fallCycle, comment: COMMENTS[member.key] ?? "" });
  }
});

await at("2026-10-23T09:00:00Z", "2026-11-12T16:00:00Z", "goal check-ins, recent", async () => {
  for (const [index, goal] of GOALS.entries()) {
    const [, ownerKey, , , , , checkIns] = goal;
    if (checkIns.length < 2) continue;
    const [progress, status, note] = checkIns.at(-1);
    await program.checkInGoal({ actor: actor(ownerKey), organizationId, goalId: goalIds[index], progress, status, note });
  }
});

await at("2026-11-03T09:00:00Z", "2026-11-12T14:00:00Z", "one-to-ones", async () => {
  const chenAna = await program.createOneOnOne({ actor: actor("chen"), organizationId, counterpartId: memberId("ana"), scheduledFor: "2026-11-03" });
  await program.updateOneOnOne({ actor: actor("ana"), organizationId, meetingId: chenAna, operation: { type: "add_agenda_item", text: "2027 platform roadmap: who needs to see it" } });
  await program.updateOneOnOne({ actor: actor("chen"), organizationId, meetingId: chenAna, operation: { type: "add_agenda_item", text: "Hiring plan for the third Platform seat" } });
  await program.updateOneOnOne({ actor: actor("chen"), organizationId, meetingId: chenAna, operation: { type: "save_notes", sharedNotes: "Ana drafts the roadmap for the December all-hands. Chen reopens the req with a wider brief." } });
  await program.updateOneOnOne({ actor: actor("chen"), organizationId, meetingId: chenAna, operation: { type: "complete" } });

  const anaDara = await program.createOneOnOne({ actor: actor("ana"), organizationId, counterpartId: memberId("dara"), scheduledFor: "2026-11-06" });
  await program.updateOneOnOne({ actor: actor("dara"), organizationId, meetingId: anaDara, operation: { type: "add_agenda_item", text: "Taking over release coordination" } });
  await program.updateOneOnOne({ actor: actor("ana"), organizationId, meetingId: anaDara, operation: { type: "complete" } });

  const rosaTheo = await program.createOneOnOne({ actor: actor("rosa"), organizationId, counterpartId: memberId("theo"), scheduledFor: "2026-11-10" });
  await program.updateOneOnOne({ actor: actor("theo"), organizationId, meetingId: rosaTheo, operation: { type: "add_agenda_item", text: "Onboarding survey results" } });
  await program.updateOneOnOne({ actor: actor("rosa"), organizationId, meetingId: rosaTheo, operation: { type: "add_agenda_item", text: "Year-end record cleanup plan" } });
  const meeting = (await db.doc(`organizations/${organizationId}/oneOnOnes/${rosaTheo}`).get()).data();
  for (const item of meeting.agenda) {
    await program.updateOneOnOne({ actor: actor("rosa"), organizationId, meetingId: rosaTheo, operation: { type: "toggle_agenda_item", itemId: item.id } });
  }
  await program.updateOneOnOne({ actor: actor("rosa"), organizationId, meetingId: rosaTheo, operation: { type: "save_notes", sharedNotes: "Theo owns the cleanup. Rosa reviews the field list by Nov 20." } });
  await program.updateOneOnOne({ actor: actor("theo"), organizationId, meetingId: rosaTheo, operation: { type: "complete" } });

  const anaBen = await program.createOneOnOne({ actor: actor("ana"), organizationId, counterpartId: memberId("ben"), scheduledFor: "2026-11-17" });
  await program.updateOneOnOne({ actor: actor("ben"), organizationId, meetingId: anaBen, operation: { type: "add_agenda_item", text: "Gripper v2 rollout at site three" } });
  await program.updateOneOnOne({ actor: actor("ana"), organizationId, meetingId: anaBen, operation: { type: "add_agenda_item", text: "Design doc for new hires" } });
});

await at("2026-11-12T13:40:00Z", null, "Q4 check-in reminders", async () => {
  await program.sendCycleReminders({ actor: owner, organizationId, cycleId: checkInCycle });
});

await at("2026-11-13T08:20:00Z", "2026-11-13T08:50:00Z", "saved view, API key and webhook", async () => {
  const teams = await db.collection(`organizations/${organizationId}/teams`).get();
  const engineering = teams.docs.find((document) => document.data().name === "Autonomy");
  await program.saveReportView({ actor: owner, organizationId, name: "Autonomy · Fall 2026", cycleId: fallCycle, teamId: engineering?.id ?? null, shared: true });
  await integrations.createApiKey({ actor: owner, organizationId, name: "Data warehouse sync", scopes: ["directory:read", "cycles:read"] });
  // A fictional endpoint on the reserved .example domain: test deliveries fail
  // honestly (it cannot resolve), which is what the delivery log is built to show.
  await integrations.createWebhook({ actor: owner, organizationId, url: `https://hooks.${DOMAIN}/performance`, events: ["review_cycle.transitioned", "review_packet.acknowledged"] });
});

// Spread the seeded history over Sep–Nov 2026.
const counter = { count: 0 };
await remapTree(db.doc(`organizations/${organizationId}`), seedStart, counter);
for (const member of PEOPLE) {
  await remapTree(db.doc(`users/${member.uid}`), seedStart, counter);
}
console.log(`  ✓ history spread over Sep–Nov 2026 (${counter.count} documents)`);

const [fallAll, checkInAll] = await Promise.all([reviewsOf(organizationId, fallCycle), reviewsOf(organizationId, checkInCycle)]);
const submitted = (reviews) => reviews.filter((review) => review.state === "submitted").length;
console.log(`
Northwind Robotics is ready (fictional demo data, emulators only).
  workspace:          ${organizationId}
  people:             ${PEOPLE.length} (sign in as rosa.whitfield@${DOMAIN}, the owner; password: DEMO_PASSWORD in this script)
  Fall 2026 cycle:    acknowledgement · ${submitted(fallAll)}/${fallAll.length} reviews submitted
  Q4 check-in cycle:  review writing · ${submitted(checkInAll)}/${checkInAll.length} reviews submitted
`);
process.exit(0);
