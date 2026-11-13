#!/usr/bin/env node
/**
 * Seeds a FICTIONAL sales team, "Kitewell" (a warehouse labor-planning software company),
 * into LOCAL Firebase emulators for demos, screenshots and recordings of Revenue.
 *
 * It never touches a real project. It refuses to run unless:
 * - FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set, and
 * - FIREBASE_PROJECT_ID starts with "demo-" (Firebase's prefix for projects that
 *   cannot exist in the cloud).
 * Real credentials in the environment are dropped before anything is imported.
 *
 * It drives the real server code (src/lib/revenue/* and the shared accounts/teams
 * platform in src/lib/fleet/platform/*): accounts, invitations, profile photos, deals,
 * consented call transcripts, analysis, coaching and forecast calls are written exactly
 * as the product writes them. Afterwards, the seeded timestamps are spread over the last
 * eleven weeks (relative to when you run it), so risk signals and "days in stage" read
 * naturally. Actions taken in the app after seeding keep real time.
 *
 * Every person, company, email (on the reserved `.example` domain) and conversation
 * below is made up. The profile photos in scripts/demo-assets/revenue/ are AI-generated
 * portraits of people who do not exist. The emulator data is wiped first on every run.
 *
 * Usage (with the emulators running, e.g. Auth on 9286 and Firestore on 8286):
 *   FIREBASE_PROJECT_ID=demo-saasassin-revenue \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8286 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9286 \
 *   node scripts/seed-demo-revenue.mjs
 *
 * Then run `next dev` with the same three variables plus
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID=<same demo- id> and
 * NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=<auth host> (see src/lib/firebase/emulators.ts),
 * open /apps/revenue and sign in as dana.whitaker@kitewell.example (the owner) or any
 * other seeded person with DEMO_PASSWORD below (emulator-only).
 */
import { readFile } from "node:fs/promises";
import { register } from "node:module";

// ---------------------------------------------------------------------------
// Safety gate — before any Firebase module is loaded.
// ---------------------------------------------------------------------------

const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

function refuse(message) {
  console.error(`seed-demo-revenue: refusing to run. ${message}`);
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
export const DEMO_PASSWORD = "kitewell-emulator-only";
const DOMAIN = "kitewell.example";
const PRODUCT = "revenue";

// ---------------------------------------------------------------------------
// Load the TypeScript server code directly: `@/` aliases, `server-only` stub,
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
  // next/headers and friends are CommonJS files without an exports map; never called while seeding.
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

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const data = await import("@/lib/revenue/data");
const pipeline = await import("@/lib/revenue/pipeline-data");
const tenants = await import("@/lib/fleet/platform/tenants");
const team = await import("@/lib/fleet/platform/team");
const profiles = await import("@/lib/fleet/platform/profiles");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// The fictional sales team
// ---------------------------------------------------------------------------

/** key, name, title, workspace role, photo (scripts/demo-assets/revenue/<key>.jpg) */
const PEOPLE = [
  ["dana", "Dana Whitaker", "VP of Sales", "owner", true],
  ["rachel", "Rachel Kim", "Revenue Operations Lead", "admin", true],
  ["priya", "Priya Raman", "Sales Manager, Enterprise", "manager", true],
  ["marcus", "Marcus Bell", "Sales Manager, Mid-Market", "manager", true],
  ["kenji", "Kenji Watanabe", "Senior Account Executive", "rep", true],
  ["amara", "Amara Nwosu", "Account Executive", "rep", true],
  ["sofia", "Sofia Alvarez", "Account Executive", "rep", true],
  ["liam", "Liam Brennan", "Account Executive", "rep", true],
  ["owen", "Owen Fletcher", "Chief Financial Officer", "viewer", false],
].map(([key, name, title, role, photo]) => ({
  key,
  name,
  title,
  role,
  photo,
  first: name.split(" ")[0],
  email: `${name.split(" ")[0].toLowerCase()}.${name.split(" ").slice(-1)[0].toLowerCase()}@${DOMAIN}`,
  uid: `kw-${key}`,
}));
const byKey = new Map(PEOPLE.map((member) => [member.key, member]));
const person = (key) => {
  const found = byKey.get(key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return found;
};
const user = (key) => ({ uid: person(key).uid, email: person(key).email, name: person(key).name, emailVerified: true });

/** People invited who haven't created an account yet. */
const PENDING_INVITES = [
  ["jordan.reyes@kitewell.example", "rep"],
  ["nadia.haddad@kitewell.example", "manager"],
];

// ---------------------------------------------------------------------------
// Time: everything is placed relative to now, on weekday office hours (UTC).
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const NOW = Date.now();

/** A weekday `days` ago at `hour`:`minute` UTC (weekends move back to Friday). */
function ago(days, hour = 15, minute = 0) {
  const date = new Date(NOW - days * DAY);
  date.setUTCHours(hour, minute, 0, 0);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setTime(date.getTime() - DAY);
  if (date.getTime() > NOW - 60 * 60_000) date.setTime(NOW - 3 * 60 * 60_000);
  return date.toISOString();
}

function dateIn(days) {
  return new Date(NOW + days * DAY).toISOString().slice(0, 10);
}

const phases = [];
/** Runs `work` and records that every write it made belongs at simulated time `simIso`. */
async function at(simIso, label, work) {
  const realStart = Date.now();
  const result = await work();
  await new Promise((resolve) => setTimeout(resolve, 25));
  phases.push({ realStart, realEnd: Date.now(), simStart: Date.parse(simIso) });
  console.log(`  ✓ ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 25));
  return result;
}

function mapTime(ms) {
  const phase = [...phases].reverse().find((candidate) => ms >= candidate.realStart - 2) ?? null;
  if (!phase || ms > phases.at(-1).realEnd + 2_000) return null;
  // Keep the real order and spacing, stretched so one phase's writes span a few minutes.
  return phase.simStart + Math.round((ms - phase.realStart) * 40);
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
    for (const document of await collection.listDocuments()) {
      await remapTree(document, seedStart, counter);
    }
  }
}

// ---------------------------------------------------------------------------
// Transcripts. Each turn lasts about as long as it takes to say: roughly 70 transcript
// words a minute (allowing for the pauses and fillers a clean transcript drops), plus a
// beat between speakers. Talk ratio and monologues come out the way the call reads.
// ---------------------------------------------------------------------------

function transcript(speakers, turns) {
  let cursor = 3;
  return turns
    .map(([key, text]) => {
      const stamp = Math.round(cursor);
      cursor += text.split(/\s+/).filter(Boolean).length * 0.85 + 2.5;
      const mm = String(Math.floor(stamp / 60)).padStart(2, "0");
      const ss = String(stamp % 60).padStart(2, "0");
      return `[${mm}:${ss}] ${speakers[key]}: ${text}`;
    })
    .join("\n");
}

const CONSENT = (jurisdiction, basis = "all-party-verbal", notes = "") => ({ jurisdiction, basis, allPartyConfirmed: true, notes });

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Kitewell (fictional) into emulators for ${projectId}…`);

for (const url of [
  `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
  `http://${authHost}/emulator/v1/projects/${projectId}/accounts`,
]) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) refuse(`Could not clear emulator data at ${url} (HTTP ${response.status}).`);
}

const seedStart = Date.now();

// 1. Emulator-only sign-in accounts, profiles and photos.
for (const member of PEOPLE) {
  await auth.createUser({ uid: member.uid, email: member.email, password: DEMO_PASSWORD, displayName: member.name, emailVerified: true });
  await profiles.updateAccountProfile(PRODUCT, user(member.key), { name: member.name, title: member.title });
  if (member.photo) {
    const bytes = await readFile(new URL(`./demo-assets/revenue/${member.key}.jpg`, import.meta.url));
    await profiles.setUploadedPhoto(PRODUCT, user(member.key), new Uint8Array(bytes));
  }
}
console.log(`  ✓ ${PEOPLE.length} emulator accounts with profiles (${PEOPLE.filter((member) => member.photo).length} photos)`);

// 2. The workspace and the team, through real invitations.
const tenant = await at(ago(80, 14), "workspace created by Dana Whitaker", () => tenants.createTenant(PRODUCT, user("dana"), "Kitewell Sales"));
const tenantId = tenant.id;
const ctx = (key) => data.revenueContext(user(key), tenantId);

await at(ago(80, 14, 20), "team invited and joined", async () => {
  for (const member of PEOPLE.filter((candidate) => candidate.key !== "dana")) {
    let token = "";
    await team.createInvitation(PRODUCT, tenantId, user("dana"), { email: member.email, role: member.role }, (secret) => {
      token = secret;
      return `http://localhost:3486/apps/revenue/invite/${secret}`;
    });
    await team.acceptInvitationByToken(PRODUCT, user(member.key), token);
  }
});

// 3. Trackers and settings the way this team uses them.
await at(ago(79, 16), "trackers and scoring set up by Rachel Kim", async () => {
  const workspace = await data.loadWorkspace(await ctx("rachel"));
  const competitor = workspace.trackers.find((tracker) => tracker.kind === "competitor");
  await data.saveTracker(await ctx("rachel"), competitor?.id ?? null, { name: "Competitors", kind: "competitor", keywords: ["LaborLens", "Shiftwise", "Rosterly"] });
  await data.saveTracker(await ctx("rachel"), null, { name: "Integrations", kind: "keyword", keywords: ["WMS", "integration", "API", "single sign-on"] });
  await data.saveTracker(await ctx("rachel"), null, { name: "Overtime", kind: "keyword", keywords: ["overtime", "temp labor", "agency staff"] });
});

// 4. Accounts and the people at them.
const ACCOUNTS = {
  harbor: ["Harbor & Pine Logistics", "harborpine.example"],
  northgate: ["Northgate Outfitters", "northgate-outfitters.example"],
  ironwood: ["Ironwood Building Supply", "ironwoodsupply.example"],
  fieldstone: ["Fieldstone Logistics", "fieldstone-logistics.example"],
  meridian: ["Meridian Cold Chain", "meridiancold.example"],
  cascade: ["Cascade Grocers", "cascadegrocers.example"],
  summit: ["Summit Ridge Pharma", "summitridge.example"],
  bluefin: ["Bluefin Marine Parts", "bluefinmarine.example"],
  alder: ["Alder Health Supply", "alderhealth.example"],
  quarry: ["Quarry Lane Home", "quarrylane.example"],
};
const CONTACTS = {
  grace: ["harbor", "Grace Moreno", "VP of Operations"],
  victor: ["harbor", "Victor Chen", "Chief Financial Officer"],
  ellie: ["harbor", "Ellie Ward", "Director of IT"],
  daniel: ["northgate", "Daniel Osei", "Head of Fulfillment"],
  megan: ["northgate", "Megan Hart", "Procurement Manager"],
  teresa: ["ironwood", "Teresa Lindgren", "Chief Operating Officer"],
  mark: ["ironwood", "Mark Oyelaran", "Distribution Center Manager"],
  hannah: ["fieldstone", "Hannah Brooks", "Director of Operations"],
  carlos: ["meridian", "Carlos Mendes", "Operations Director"],
  joanna: ["meridian", "Joanna Pike", "Site General Manager"],
  beth: ["cascade", "Beth Calloway", "Night Operations Manager"],
  naomi: ["summit", "Naomi Fischer", "Director of Distribution"],
  kevin: ["alder", "Kevin Tran", "VP of Supply Chain"],
  laura: ["quarry", "Laura Becker", "Head of Logistics"],
};
const accountIds = {};
const contactIds = {};
await at(ago(78, 15), "accounts and contacts added", async () => {
  for (const [key, [name, domain]] of Object.entries(ACCOUNTS)) {
    const owner = { harbor: "kenji", northgate: "amara", ironwood: "amara", fieldstone: "sofia", meridian: "sofia", cascade: "liam", summit: "kenji", bluefin: "liam", alder: "sofia", quarry: "liam" }[key];
    accountIds[key] = (await data.createAccount(await ctx(owner), { name, domain })).id;
  }
  for (const [key, [account, name, title]] of Object.entries(CONTACTS)) {
    contactIds[key] = (await pipeline.createContact(await ctx("rachel"), { accountId: accountIds[account], name, title, email: `${name.split(" ")[0].toLowerCase()}@${ACCOUNTS[account][1]}` })).id;
  }
});

// 5. Deals, created and moved through stages over the last eleven weeks.
const DEALS = {
  alder: { account: "alder", name: "Alder Health — two DCs", owner: "sofia", amount: 98_000, close: -45, path: [[80, "discovery"], [66, "demo"], [55, "proposal"], [50, "negotiation"], [45, "closed_won"]], roles: { kevin: "economic_buyer" } },
  summit: { account: "summit", name: "Summit Ridge — validated sites pilot", owner: "kenji", amount: 210_000, close: -6, path: [[70, "discovery"], [55, "demo"], [38, "proposal"]], roles: { naomi: "champion" } },
  quarry: { account: "quarry", name: "Quarry Lane — replatform", owner: "liam", amount: 75_000, close: -40, path: [[62, "discovery"], [48, "demo"], [40, "closed_lost"]], roles: { laura: "decision_maker" } },
  harbor: { account: "harbor", name: "Harbor & Pine — 3-site rollout", owner: "kenji", amount: 186_000, close: 21, path: [[52, "discovery"], [36, "demo"], [20, "proposal"]], roles: { grace: "champion", victor: "economic_buyer", ellie: "influencer" } },
  ironwood: { account: "ironwood", name: "Ironwood — 5 branches", owner: "amara", amount: 134_000, close: 12, path: [[40, "discovery"], [22, "demo"], [15, "proposal"]], roles: { teresa: "economic_buyer", mark: "champion" } },
  northgate: { account: "northgate", name: "Northgate — peak season expansion", owner: "amara", amount: 142_000, close: 35, path: [[30, "discovery"], [12, "demo"], [8, "proposal"]], roles: { daniel: "champion", megan: "blocker" } },
  cascade: { account: "cascade", name: "Cascade Grocers — night shift", owner: "liam", amount: 56_000, close: 30, path: [[25, "discovery"], [11, "demo"]], roles: { beth: "champion" } },
  meridian: { account: "meridian", name: "Meridian — cold storage pilot", owner: "sofia", amount: 88_000, close: 48, path: [[18, "discovery"], [6, "demo"]], roles: { carlos: "decision_maker", joanna: "user" } },
  fieldstone: { account: "fieldstone", name: "Fieldstone — labor planning", owner: "sofia", amount: 64_000, close: 70, path: [[9, "discovery"]], roles: { hannah: "champion" } },
  bluefin: { account: "bluefin", name: "Bluefin — starter", owner: "liam", amount: 28_000, close: 90, path: [[5, "prospecting"]], roles: {} },
};
const dealIds = {};
const moves = [];
for (const [key, deal] of Object.entries(DEALS)) {
  const [[createdDaysAgo, firstStage], ...rest] = deal.path;
  dealIds[key] = await at(ago(createdDaysAgo, 15, 30), `deal: ${deal.name}`, async () => {
    const created = await data.createDeal(await ctx(deal.owner), {
      name: deal.name,
      accountId: accountIds[deal.account],
      stage: firstStage,
      amount: deal.amount,
      currency: "USD",
      closeDate: dateIn(deal.close),
      ownerEmail: person(deal.owner).email,
    });
    for (const [contact, role] of Object.entries(deal.roles)) {
      await pipeline.setContactDealRole(await ctx(deal.owner), contactIds[contact], { dealId: created.id, role });
    }
    return created.id;
  });
  for (const [daysAgo, stage] of rest) moves.push({ key, daysAgo, stage });
}

// 6. Calls: consented transcripts against deals, linked speakers, then coaching.
const callIds = {};

async function logCall(key, { deal, title, rep, daysAgo, hour, speakers, turns, consent, links }) {
  const occurredAt = ago(daysAgo, hour);
  const id = await at(new Date(Date.parse(occurredAt) + 50 * 60_000).toISOString(), `call: ${title}`, async () => {
    const created = await data.createCall(await ctx(rep), {
      dealId: dealIds[deal],
      title,
      occurredAt,
      repEmail: person(rep).email,
      repSpeaker: speakers[rep],
      format: "plain",
      transcript: transcript(speakers, turns),
      consent,
    });
    for (const [speakerKey, name] of Object.entries(speakers)) {
      const link = byKey.has(speakerKey) ? { kind: "member", email: person(speakerKey).email } : contactIds[speakerKey] ? { kind: "contact", contactId: contactIds[speakerKey] } : null;
      if (link && (links ?? true)) await pipeline.linkSpeaker(await ctx(rep), created.id, { speaker: name, link });
    }
    return created.id;
  });
  callIds[key] = id;
  return id;
}

const NAMES = Object.fromEntries([...PEOPLE.map((member) => [member.key, member.name]), ...Object.entries(CONTACTS).map(([key, [, name]]) => [key, name])]);
const S = (...keys) => Object.fromEntries(keys.map((key) => [key, NAMES[key]]));

// Interleave stage moves with calls in time order.
async function movesUntil(daysAgo) {
  for (const move of moves.filter((entry) => !entry.done && entry.daysAgo >= daysAgo).sort((a, b) => b.daysAgo - a.daysAgo)) {
    move.done = true;
    const deal = DEALS[move.key];
    await at(ago(move.daysAgo, 16, 10), `${deal.name} → ${move.stage.replace("_", " ")}`, async () => {
      await data.updateDeal(await ctx(deal.owner), dealIds[move.key], { stage: move.stage });
    });
  }
}

await logCall("alderTerms", {
  deal: "alder", title: "Alder Health — final terms", rep: "sofia", daysAgo: 51, hour: 17,
  speakers: S("sofia", "kevin"), consent: CONSENT("US-OR"),
  turns: [
    ["sofia", "Thanks for jumping on, Kevin. Is it all right if I record this so I can focus on the conversation?"],
    ["kevin", "Sure, go ahead."],
    ["sofia", "Last time you said the board wanted to see the overtime numbers from the Salem pilot before signing. Did those land the way you hoped?"],
    ["kevin", "Better than I hoped. Overtime is down fourteen percent and we stopped calling in agency staff on Mondays. That was the line item finance kept asking about."],
    ["sofia", "That's great to hear. What would make the second DC go as smoothly as Salem?"],
    ["kevin", "Honestly, the same implementation lead. Priyanka from your team knew our WMS better than our own IT did by the end."],
    ["sofia", "I'll make sure she's on the Tacoma rollout. On terms, you asked for quarterly billing. We can do that on a two-year agreement at the same price."],
    ["kevin", "Two years at the same price with quarterly billing works. Send the paperwork and I'll get it signed this week."],
    ["sofia", "I'll send the order form today and book the Tacoma kickoff for the week after you sign. Anything else you need from me?"],
    ["kevin", "No, that's it. Thanks, Sofia. This was an easy one."],
  ],
});
await movesUntil(48);

await logCall("quarryReview", {
  deal: "quarry", title: "Quarry Lane — decision call", rep: "liam", daysAgo: 41, hour: 18,
  speakers: S("liam", "laura"), consent: CONSENT("US-TX"),
  turns: [
    ["liam", "Hi Laura, thanks for taking the call. Are you okay with me recording this?"],
    ["laura", "That's fine. I'll be straight with you, Liam. We've decided to go with Shiftwise."],
    ["liam", "I appreciate you telling me directly. Can I ask what tipped it?"],
    ["laura", "Mostly price. They came in about a third lower, and our sites are small enough that the forecasting felt like more than we need right now."],
    ["liam", "That's fair. If your volume grows the way you described for next year, would you be open to revisiting forecasting then?"],
    ["laura", "Maybe. If the scheduling alone doesn't fix overtime, I'll call you."],
    ["liam", "Deal. I'll check in after your peak season to see how it went. Thanks for the time, Laura."],
  ],
});
await movesUntil(38);

await logCall("summitReview", {
  deal: "summit", title: "Summit Ridge — proposal review", rep: "kenji", daysAgo: 24, hour: 16,
  speakers: S("kenji", "naomi"), consent: CONSENT("US-NJ", "all-party-written", "Consent captured in the meeting invite"),
  turns: [
    ["kenji", "Naomi, thanks for the time. As usual, are you comfortable with us recording?"],
    ["naomi", "Yes, our policy allows it as long as it stays internal."],
    ["kenji", "Understood, it stays in our workspace. I wanted to walk through the proposal for the two validated sites and hear where procurement landed."],
    ["naomi", "Procurement is fine with the price. The open question is validation. Anything that touches how we staff the controlled-temperature rooms has to go through our quality team."],
    ["kenji", "That makes sense. What does the quality team need to see from us, and how long does their review usually take?"],
    ["naomi", "A validation package and a change-control plan. Their review takes four to six weeks, and they're backed up until the new year."],
    ["kenji", "So realistically, a signature lands in January rather than this quarter. Is that a fair read?"],
    ["naomi", "That's fair. I'd rather tell you now than surprise you in December."],
    ["kenji", "Thank you. I'll send our validation package and a draft change-control plan by Friday, so it's in the quality team's queue early."],
    ["naomi", "Send it to me and I'll route it. I'll come back to you when I have a review date."],
  ],
});

await logCall("harborDiscovery", {
  deal: "harbor", title: "Harbor & Pine — discovery", rep: "kenji", daysAgo: 50, hour: 17,
  speakers: S("kenji", "grace"), consent: CONSENT("US-CA"),
  turns: [
    ["kenji", "Grace, thanks for making the time. Do you mind if I record so I can listen properly instead of typing?"],
    ["grace", "Go ahead."],
    ["kenji", "To start, what made you take this meeting now rather than six months ago?"],
    ["grace", "Overtime. We spent just over two million on overtime across our three DCs last year, and the CFO wants it down by a quarter before next peak."],
    ["kenji", "That's a clear target. Where does the overtime actually come from today? Is it volume you didn't see coming, or volume you saw but couldn't staff?"],
    ["grace", "Both, but mostly the second. We know the volume roughly a day ahead, but the shift leads build tomorrow's plan in a spreadsheet at nine at night and they guess."],
    ["kenji", "What happens when they guess wrong?"],
    ["grace", "We call people in on overtime, or we bring in agency staff at twice the cost. On a bad week it's both."],
    ["kenji", "If the plan for tomorrow were already built when the shift leads walked in, based on the orders in the WMS, what would that change for them?"],
    ["grace", "It would give them their evenings back, honestly. And I'd stop hearing about it in my one-to-ones."],
    ["kenji", "Who else would need to be involved to make a change like this, beyond you?"],
    ["grace", "Victor, our CFO, signs anything over a hundred thousand. And Ellie in IT has to approve anything that connects to the WMS."],
    ["kenji", "That's helpful. Here's what I'd suggest as a next step: a six-week pilot in one DC, with the forecast connected to your WMS, and we measure overtime against the same weeks last year."],
    ["grace", "Reno would be the right site. It's the messiest one."],
    ["kenji", "Then let's schedule a technical session with Ellie next week, and I'll send a pilot plan by Friday."],
  ],
});
await movesUntil(36);

await logCall("harborDemo", {
  deal: "harbor", title: "Harbor & Pine — technical session with IT", rep: "kenji", daysAgo: 35, hour: 18,
  speakers: S("kenji", "grace", "ellie"), consent: CONSENT("US-CA"),
  turns: [
    ["kenji", "Thanks for joining, both of you. Ellie, I know this one's mostly for you. Okay to record?"],
    ["ellie", "Yes. I mainly want to understand the WMS integration and where our data goes."],
    ["kenji", "Let's start there. We read open orders and labor standards from the WMS through its API every fifteen minutes. Nothing is written back to the WMS."],
    ["ellie", "Read-only is good. Where is the data stored, and who at your company can see it?"],
    ["kenji", "It's stored in your own workspace, encrypted at rest, and only your users can see it. Our support team gets access only when you grant it, and that's logged."],
    ["ellie", "Do you support single sign-on? I won't approve another set of passwords."],
    ["kenji", "Yes, single sign-on with your identity provider, and you can turn off passwords entirely."],
    ["grace", "Ellie, what would you need to say yes to a pilot in Reno?"],
    ["ellie", "A security questionnaire, and a test connection to our staging WMS. If both are clean, I'm comfortable with Reno."],
    ["kenji", "I'll send the questionnaire tomorrow, and we can set up the staging connection whenever your team has an hour this week."],
    ["ellie", "Thursday afternoon works for us."],
    ["kenji", "Great, I'll book Thursday at two with our integration engineer."],
  ],
});
await movesUntil(20);

await logCall("ironwoodDemo", {
  deal: "ironwood", title: "Ironwood — branch walkthrough", rep: "amara", daysAgo: 21, hour: 16,
  speakers: S("amara", "mark", "teresa"), consent: CONSENT("US-CO"),
  turns: [
    ["amara", "Teresa, Mark, thanks for having me. Is it all right if I record today's call?"],
    ["teresa", "That's fine."],
    ["amara", "Mark, last time you walked me through the Denver branch. Today I'd love to show you what that branch would look like in Kitewell, using your real order history."],
    ["mark", "Please. I want to see Mondays. Mondays are where it all falls apart."],
    ["amara", "Here's last Monday. The forecast expected thirty-one percent more picks than a normal day, and it would have scheduled four extra pickers from six a.m. instead of calling them in at noon."],
    ["mark", "That's exactly what happened. We called them in at noon and paid overtime till eight."],
    ["teresa", "How many branches would we need to roll out to see that across the company?"],
    ["amara", "All five share the same WMS, so it's one integration. We'd usually start with Denver and add the others two weeks apart."],
    ["teresa", "What does that cost across five branches?"],
    ["amara", "Our list price is about one hundred thirty-four thousand a year for five branches, including the integration. I'll send a proposal with the rollout plan by Friday."],
    ["teresa", "Send it. If the numbers hold up, I'd like to have this live before spring."],
  ],
});
await movesUntil(15);

await logCall("cascadeDemo", {
  deal: "cascade", title: "Cascade Grocers — night shift demo", rep: "liam", daysAgo: 11, hour: 22,
  speakers: S("liam", "beth"), consent: CONSENT("US-WA"),
  turns: [
    ["liam", "Hi Beth, thanks for staying on after your shift. Do you mind if I record?"],
    ["beth", "That's fine. I've got about half an hour."],
    ["liam", "Perfect. So I'll walk you through the whole product. Kitewell connects to your WMS, reads the order pool, forecasts the volume for every hour of the next day, and turns that into a shift plan. The plan respects your labor rules, so breaks, maximum hours, certifications for the forklift drivers, all of that is built in. Then during the shift, the live view shows you which zones are behind and suggests moving people between zones. We also have a productivity view that compares each zone against your labor standards, and a weekly report that your regional director can use without asking you for a spreadsheet. On top of that there's the mobile app for shift leads, and there's an API if your team wants to pull the data somewhere else."],
    ["beth", "Okay. That's a lot. Our problem is really just the night shift. We never know how many trucks are coming."],
    ["liam", "Right, and that's where the forecast helps, because it looks at the order pool and the history. We also have the integration with transport systems on the roadmap, which would show you the trucks directly. And the scheduling handles the rules, so your shift leads don't have to think about who's certified for what. Most of our customers start with the scheduling and then grow into the live view and the reports."],
    ["beth", "How much does something like this cost for one site?"],
    ["liam", "For one site it's usually around fifty to sixty thousand a year, depending on the integration."],
    ["beth", "Hm. I'd have to take that to my director. I'm not sure what she'll say."],
    ["liam", "Totally understand. Let me know what she thinks."],
    ["beth", "Will do. Thanks, Liam."],
  ],
});

await logCall("northgateDiscovery", {
  deal: "northgate", title: "Northgate — discovery", rep: "amara", daysAgo: 27, hour: 15,
  speakers: S("amara", "daniel"), consent: CONSENT("US-OH"),
  turns: [
    ["amara", "Daniel, thanks for the time. Is it okay if I record this for my notes?"],
    ["daniel", "Sure."],
    ["amara", "You mentioned peak season was rough last year. What actually happened?"],
    ["daniel", "Our volume doubled in six weeks and we hired two hundred seasonal workers. We still missed same-day shipping on eleven days, and the temp labor bill was double what we planned."],
    ["amara", "What's the target for this year?"],
    ["daniel", "No missed same-day days, and keep temp labor inside the budget. Our CEO said it in the all-hands, so it's on me now."],
    ["amara", "How do you plan seasonal hiring today?"],
    ["daniel", "Last year's numbers plus a growth percentage in a spreadsheet. It was wrong in both directions."],
    ["amara", "Would it help to see what the forecast would have said for last year's peak, using your real orders?"],
    ["daniel", "That would help a lot. If it would have been right, I can sell it internally."],
    ["amara", "Then the next step is a back-test on last year's data. I'll send the data request today, and we'll book a demo with the results in two weeks."],
  ],
});
await movesUntil(12);

await logCall("meridianDemo", {
  deal: "meridian", title: "Meridian — cold storage demo", rep: "sofia", daysAgo: 6, hour: 16,
  speakers: S("sofia", "carlos", "joanna"), consent: CONSENT("US-GA"),
  turns: [
    ["sofia", "Carlos, Joanna, thanks for joining. Is it all right with you both if I record?"],
    ["carlos", "Yes, fine."],
    ["joanna", "Fine with me."],
    ["sofia", "Joanna, you run the Atlanta site day to day. Before I show anything, what's the hardest part of staffing the freezer rooms?"],
    ["joanna", "People can only work so long in the freezer before a warm break, so every plan has to rotate them. We do it on a whiteboard."],
    ["sofia", "How often does the whiteboard plan survive the shift?"],
    ["joanna", "Until the first late truck, so about two hours."],
    ["sofia", "Let me show you a plan built with your rotation rules. Here every picker in the freezer has a warm break every ninety minutes, and when a truck is late, the plan re-balances the rotations automatically."],
    ["joanna", "That would save my shift leads an hour a night, easily."],
    ["carlos", "What does a pilot at one site look like, and what does it cost?"],
    ["sofia", "A six-week pilot at Atlanta, and the price for a single site is eighty-eight thousand a year if you continue. I'll send the pilot plan by Friday, and let's schedule a call with your IT team next week for the WMS integration."],
    ["carlos", "Send it over. I'll get IT on the call."],
  ],
});
await movesUntil(8);

await logCall("northgateDemo", {
  deal: "northgate", title: "Northgate — back-test results", rep: "amara", daysAgo: 9, hour: 17,
  speakers: S("amara", "daniel"), consent: CONSENT("US-OH"),
  turns: [
    ["amara", "Daniel, thanks for making time. Okay to record again?"],
    ["daniel", "Yes."],
    ["amara", "So here are the back-test results on last year's peak. I'll walk you through all of it, because I think the numbers really speak for themselves. For every week of peak, the forecast was within six percent of the real volume, and on the eleven days you missed same-day shipping, it would have told you two days ahead that you needed between eighteen and thirty more people. On temp labor, if you'd hired to the forecast instead of the spreadsheet, you would have spent about twenty-two percent less, mostly because you would have stopped over-hiring in the first two weeks. And the plan would have moved people from packing to picking on nine of those days. All of this is from your own order data, nothing modeled from other customers."],
    ["daniel", "That's impressive. Honestly, LaborLens showed us something similar last week, though."],
    ["amara", "That's good to know. Our forecast is built on your WMS data every fifteen minutes, so it updates during the day, not just overnight, and we include the shift plan, not just the forecast. I think when you compare, you'll see the difference is the planning part, which is where the overtime savings come from, and the integration is included in our price."],
    ["daniel", "What would it cost for our two DCs?"],
    ["amara", "For both DCs it would be one hundred forty-two thousand a year, including the integration and the seasonal hiring plan. I'll send you a proposal with a side-by-side by Friday."],
    ["daniel", "Send it. I'll need to get it past Megan in procurement, and she'll want to see the LaborLens quote next to yours."],
  ],
});

await logCall("ironwoodTerms", {
  deal: "ironwood", title: "Ironwood — commercial terms", rep: "amara", daysAgo: 3, hour: 16,
  speakers: S("amara", "teresa"), consent: CONSENT("US-CO"),
  turns: [
    ["amara", "Teresa, thanks for the time. Okay to record as usual?"],
    ["teresa", "Of course."],
    ["amara", "You've had the proposal for a week. What questions came up when you shared it internally?"],
    ["teresa", "The board asked one thing: what happens if we only see results in two branches out of five?"],
    ["amara", "That's a fair question. What would a fair answer look like for them?"],
    ["teresa", "Some way to stop paying for branches that aren't working."],
    ["amara", "Here's what I can do. We roll out in two waves. Denver and Aurora first, and the other three branches start billing only after the first wave shows a drop in overtime you agree with. If it doesn't, you can stop at two."],
    ["teresa", "That answers the board's question. What do you need from me to make that work?"],
    ["amara", "Your sign-off on the two-wave order form, and Mark as the project lead for the first wave. I'll send the updated order form today."],
    ["teresa", "Send it today and I'll sign by Friday. Let's set up the kickoff with Mark for the week after."],
    ["amara", "I'll book the kickoff for Tuesday the week after you sign. Thank you, Teresa."],
  ],
});
await movesUntil(4);

await logCall("fieldstoneDiscovery", {
  deal: "fieldstone", title: "Fieldstone — discovery", rep: "sofia", daysAgo: 2, hour: 15,
  speakers: S("sofia", "hannah"), consent: CONSENT("US-IL"),
  turns: [
    ["sofia", "Hannah, thank you for making time. Do you mind if I record so I can listen properly?"],
    ["hannah", "Not at all."],
    ["sofia", "Before I say anything about us, what's going on at Fieldstone that made labor planning a priority right now?"],
    ["hannah", "We just took on a large retail customer, and it changes our volume pattern completely. Our planners built their spreadsheets for steady volume, and now we have spikes every Monday and Thursday."],
    ["sofia", "What does a bad Monday look like today?"],
    ["hannah", "Trucks waiting at the dock, overtime for the morning crew, and an angry call from the customer by ten."],
    ["sofia", "And how is that being measured on your side? Is someone looking at overtime, dock time, or customer complaints?"],
    ["hannah", "All three, but dock wait time is in the contract. If we're over two hours on average, we pay a penalty."],
    ["sofia", "That's helpful. Who else would be part of deciding how to fix this?"],
    ["hannah", "My boss, the COO, and our IT lead, because anything that touches the WMS goes through him."],
    ["sofia", "What would you need to see from us to bring them into the next conversation?"],
    ["hannah", "Proof that it works with volume like ours. If you can show me a Monday from our own data, I'll get them in a room."],
    ["sofia", "Then here's a next step: send me six weeks of order history, and I'll send you a back-test of your Mondays by next Friday. Can we book thirty minutes the week after with your COO and IT lead to walk through it?"],
    ["hannah", "Yes, let's do that. I'll send the data today."],
  ],
});

await logCall("harborPricing", {
  deal: "harbor", title: "Harbor & Pine — pricing and security review", rep: "kenji", daysAgo: 4, hour: 17,
  speakers: S("kenji", "priya", "grace", "victor", "ellie"), consent: CONSENT("US-CA", "all-party-verbal", "Consent given at the start of the call"),
  turns: [
    ["kenji", "Thanks for making time, everyone. Grace, Victor, Ellie, I brought Priya, who leads our enterprise team, since we're getting into commercials today. Before we start, is everyone okay with us recording this?"],
    ["grace", "Yes, that's fine with all of us."],
    ["kenji", "Great. The agenda: recap where the pilot landed, walk through the three-site pricing, and make sure Ellie has what she needs for the security review. Does that still match what you need to leave with today?"],
    ["grace", "It does. The short version on the pilot is that Reno beat the plan. We cut overtime by about eighteen percent in six weeks, and the shift leads actually like the schedule view."],
    ["kenji", "That's the number I wanted the team to hear. When you say the shift leads like it, what changed for them day to day?"],
    ["grace", "They used to build the next day's plan in a spreadsheet at nine at night. Now the forecast is waiting when they come in, and they just adjust it. Marisol told me she gets her evenings back."],
    ["kenji", "Victor, from the finance side, how are you looking at the overtime savings against the cost?"],
    ["victor", "The overtime number is the reason we're here. But I need the price to make sense across three sites, not one, and I need to know what happens in year two."],
    ["kenji", "Fair. Here's the proposal. Three distribution centers, Reno, Stockton and Boise, at fifty-two thousand per site per year, so one hundred fifty-six thousand. Implementation and the WMS integration are thirty thousand one time. That's the one eighty-six you saw in the draft."],
    ["victor", "We had budgeted closer to one forty. Shiftwise came in lower when we looked at them last year, and I have to explain the gap to our CEO."],
    ["kenji", "I appreciate you being direct about that. Can I ask what Shiftwise was quoting for? The same three sites with forecasting, or scheduling only?"],
    ["victor", "Scheduling only, I think. Ellie would know."],
    ["ellie", "Scheduling only. No volume forecasting, and their WMS integration was a CSV export we'd have to babysit."],
    ["kenji", "Then that's the gap. The eighteen percent overtime reduction in Reno came from the forecast, not the schedule. If I hold the per-site price, would a three-year term with the price locked change the picture for you, Victor?"],
    ["victor", "A locked price for three years helps. What's the discount if we sign for three?"],
    ["kenji", "I won't discount the per-site price, because it's what lets us staff your rollout properly. What I can do is waive the thirty thousand implementation fee on a three-year agreement. That brings year one to one fifty-six."],
    ["victor", "That's a lot closer to what I can defend. Grace, can you live with a three-year commitment?"],
    ["grace", "If Stockton and Boise go live before peak, yes. That's the real deadline for us. Peak starts the first week of February."],
    ["priya", "Grace, that's exactly the timeline I wanted to pressure-test. If we start Stockton on December first, we're live in five weeks, and Boise follows two weeks later. The risk is your IT queue, not ours. Ellie, is that fair?"],
    ["ellie", "It's fair. My team can do the WMS connection in December if security signs off this month."],
    ["kenji", "Then let's make the security review the critical path. Ellie, what does your team still need from us?"],
    ["ellie", "Our SOC 2 questionnaire, your latest SOC 2 report, and a signed DPA. Procurement won't open the contract without all three."],
    ["kenji", "I'll send the SOC 2 report and our completed questionnaire by Friday, and our legal team will send the DPA with your redlines from last week already accepted."],
    ["ellie", "Perfect. If I get those by Friday, we can finish the review the week after."],
    ["victor", "And I'll need the three-year order form with the implementation fee waived, so I can take it to our CEO on the twentieth."],
    ["kenji", "You'll have it tomorrow. Anything else on the order form, Victor? Payment terms, billing per site?"],
    ["victor", "Annual billing in advance is fine. Net forty-five if you can."],
    ["priya", "Net forty-five is fine on a three-year agreement."],
    ["grace", "Then I think we have a path. Honestly, the team wants this. The question was always whether Victor could defend the number."],
    ["kenji", "Thank you, Grace. To recap the next steps: I send the order form tomorrow, the security package and DPA by Friday, Ellie's team finishes the review the following week, and Victor takes it to the CEO on the twentieth. Should we book thirty minutes on the twenty-first to sign and plan the Stockton kickoff?"],
    ["grace", "Book it. Send the invite to all three of us."],
    ["kenji", "Will do. Thanks, everyone."],
  ],
});
await at(ago(4, 18, 5), "Harbor & Pine → negotiation", async () => {
  await data.updateDeal(await ctx("kenji"), dealIds.harbor, { stage: "negotiation" });
});
await at(ago(3, 17, 30), "Ironwood → negotiation", async () => {
  await data.updateDeal(await ctx("amara"), dealIds.ironwood, { stage: "negotiation" });
});
await movesUntil(0);

// 7. Coaching: comments, scorecards, clips and assignments, at the moments they refer to.
async function segmentAt(callKey, startsWith) {
  const detail = await data.getCallDetail(await ctx("dana"), callIds[callKey]);
  const segment = detail.call.segments.find((entry) => entry.text.startsWith(startsWith));
  if (!segment) throw new Error(`No segment starting "${startsWith}" in ${callKey}`);
  return segment;
}

const scores = (discovery, listening, value, objections, nextSteps) => ({ discovery, listening, value, objections, "next-steps": nextSteps });

await at(ago(10, 18), "Marcus reviewed Liam's Cascade demo", async () => {
  const pitch = await segmentAt("cascadeDemo", "Perfect. So I'll walk you through");
  const end = await segmentAt("cascadeDemo", "Totally understand.");
  await data.addComment(await ctx("marcus"), callIds.cascadeDemo, { at: pitch.start, segmentIndex: pitch.index, body: "Three minutes of features before a single question. Beth told us her problem two lines later — start there next time." });
  await data.addComment(await ctx("marcus"), callIds.cascadeDemo, { at: end.start, segmentIndex: end.index, body: "We left without a date. Before hanging up, book the next meeting with her director while she's still on the line." });
  await data.addScorecard(await ctx("marcus"), callIds.cascadeDemo, { scores: scores(2, 2, 3, 3, 1), notes: "Good product knowledge. Ask before you show, and never end a call without a booked next step." });
  await data.createAssignment(await ctx("marcus"), callIds.cascadeDemo, { assigneeEmail: person("liam").email, note: "Listen from here and write down the three questions you'd ask Beth instead of the walkthrough.", at: pitch.start });
});

await at(ago(8, 17), "Priya scored the Northgate back-test call", async () => {
  const competitor = await segmentAt("northgateDemo", "That's impressive.");
  await data.addComment(await ctx("priya"), callIds.northgateDemo, { at: competitor.start, segmentIndex: competitor.index, body: "LaborLens is in this deal now. Ask what they showed and what Daniel liked about it before you compare." });
  await data.addScorecard(await ctx("priya"), callIds.northgateDemo, { scores: scores(3, 2, 4, 3, 4), notes: "Strong results, but you talked for most of the call. Let Daniel react to each number before moving on." });
});

await at(ago(2, 13), "Priya reviewed the Ironwood terms call", async () => {
  await data.addScorecard(await ctx("priya"), callIds.ironwoodTerms, { scores: scores(5, 4, 5, 5, 5), notes: "The two-wave offer answered the board's real worry without touching price. Exactly right." });
  const offer = await segmentAt("ironwoodTerms", "Here's what I can do.");
  await data.createSnippet(await ctx("priya"), callIds.ironwoodTerms, { title: "De-risking a rollout instead of discounting", playlist: "Pricing conversations", note: "Teresa's board was worried about results, not price. Amara answered the actual question.", startSegment: offer.index - 2, endSegment: offer.index + 1 });
});

await at(ago(1, 16), "Marcus scored Sofia's Fieldstone discovery", async () => {
  const first = await segmentAt("fieldstoneDiscovery", "Before I say anything about us");
  const close = await segmentAt("fieldstoneDiscovery", "Then here's a next step");
  await data.addScorecard(await ctx("marcus"), callIds.fieldstoneDiscovery, { scores: scores(5, 5, 4, 4, 5), notes: "Five open questions before any product talk, and a dated next step with the COO. Model discovery." });
  await data.createSnippet(await ctx("marcus"), callIds.fieldstoneDiscovery, { title: "Questions before product", playlist: "Great discovery", note: "Notice how each question builds on Hannah's last answer.", startSegment: first.index, endSegment: first.index + 7 });
  await data.addComment(await ctx("marcus"), callIds.fieldstoneDiscovery, { at: close.start, segmentIndex: close.index, body: "This is the close we want on every first call: their data, our back-test, and a meeting with the decision makers already booked." });
  await data.createAssignment(await ctx("marcus"), callIds.fieldstoneDiscovery, { assigneeEmail: person("liam").email, note: "Listen to Sofia's first ten minutes before your Bluefin call: she asks five questions before saying anything about us.", at: first.start });
});

await at(ago(3, 19), "Priya reviewed the Harbor & Pine pricing call", async () => {
  const hold = await segmentAt("harborPricing", "I won't discount the per-site price");
  const ask = await segmentAt("harborPricing", "I appreciate you being direct");
  const recap = await segmentAt("harborPricing", "Thank you, Grace. To recap");
  await data.addComment(await ctx("priya"), callIds.harborPricing, { at: hold.start, segmentIndex: hold.index, body: "This is the moment. You held the per-site price and traded the fee for term. Textbook." });
  await data.addComment(await ctx("dana"), callIds.harborPricing, { at: recap.start, segmentIndex: recap.index, body: "Love the recap with owners and dates. Let's get the twenty-first on the calendar today." });
  await data.addScorecard(await ctx("priya"), callIds.harborPricing, { scores: scores(4, 5, 5, 5, 5), notes: "Excellent commercial call. Next time, bring Victor's CEO question forward earlier so you can shape the business case." });
  await data.createSnippet(await ctx("priya"), callIds.harborPricing, { title: "Holding price, trading term", playlist: "Pricing conversations", note: "Victor asks for a discount; Kenji asks what the competitor quoted for, then trades the implementation fee for a three-year term.", startSegment: ask.index - 1, endSegment: hold.index + 1 });
  await data.createAssignment(await ctx("priya"), callIds.harborPricing, { assigneeEmail: person("amara").email, note: "Before your Northgate pricing call: listen to how Kenji turns the discount ask into a term conversation.", at: ask.start });
});

await at(ago(2, 15), "Amara reviewed her assignment", async () => {
  const workspace = await data.loadWorkspace(await ctx("amara"));
  const assignment = workspace.assignments.find((entry) => entry.assigneeEmail === person("amara").email);
  if (assignment) await data.acknowledgeAssignment(await ctx("amara"), assignment.id);
});

await at(ago(20, 14), "Sofia's coaching from Alder", async () => {
  const close = await segmentAt("alderTerms", "Two years at the same price");
  await data.createAssignment(await ctx("marcus"), callIds.alderTerms, { assigneeEmail: person("sofia").email, note: "Good example of trading billing terms for contract length. Note what Kevin asked for first.", at: close.start });
});
await at(ago(19, 15), "Sofia reviewed her assignment", async () => {
  const workspace = await data.loadWorkspace(await ctx("sofia"));
  const assignment = workspace.assignments.find((entry) => entry.assigneeEmail === person("sofia").email);
  if (assignment) await data.acknowledgeAssignment(await ctx("sofia"), assignment.id);
});

// 8. Forecast calls by deal owners, and one manager override.
await at(ago(4, 18, 20), "forecast calls", async () => {
  await pipeline.setDealForecast(await ctx("kenji"), dealIds.harbor, { kind: "call", category: "commit" });
  await pipeline.setDealForecast(await ctx("amara"), dealIds.ironwood, { kind: "call", category: "commit" });
  await pipeline.setDealForecast(await ctx("amara"), dealIds.northgate, { kind: "call", category: "best_case" });
  await pipeline.setDealForecast(await ctx("sofia"), dealIds.meridian, { kind: "call", category: "best_case" });
  await pipeline.setDealForecast(await ctx("kenji"), dealIds.summit, { kind: "call", category: "best_case" });
  await pipeline.setDealForecast(await ctx("liam"), dealIds.cascade, { kind: "call", category: "pipeline" });
});
await at(ago(1, 17), "Priya overrode Summit Ridge", async () => {
  await pipeline.setDealForecast(await ctx("priya"), dealIds.summit, { kind: "override", category: "pipeline", reason: "Quality review won't start until January, and we haven't spoken to Naomi in three weeks." });
});

// 9. Two people invited who haven't joined yet.
await at(ago(1, 15, 40), "pending invitations", async () => {
  for (const [email, role] of PENDING_INVITES) {
    await team.createInvitation(PRODUCT, tenantId, user("rachel"), { email, role }, (secret) => `http://localhost:3486/apps/revenue/invite/${secret}`);
  }
});

// Spread the seeded history over the last eleven weeks.
const counter = { count: 0 };
await remapTree(db.doc(`products/${PRODUCT}/tenants/${tenantId}`), seedStart, counter);
for (const member of PEOPLE) {
  for (const document of await db.collection(`products/${PRODUCT}/users/${member.uid}/tenants`).listDocuments()) {
    await remapTree(document, seedStart, counter);
  }
}
console.log(`  ✓ history spread over the last eleven weeks (${counter.count} documents)`);

const workspace = await data.loadWorkspace(await ctx("dana"));
console.log(`
Kitewell is ready (fictional demo data, emulators only).
  workspace:  ${workspace.tenant.name} (${tenantId})
  people:     ${workspace.members.length} members + ${PENDING_INVITES.length} pending invitations
  pipeline:   ${workspace.deals.length} deals, ${workspace.calls.length} calls, ${workspace.contacts.length} contacts
  sign in as: ${person("dana").email} (owner); password: DEMO_PASSWORD in this script
`);
process.exit(0);
