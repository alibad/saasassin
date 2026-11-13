#!/usr/bin/env node
/**
 * Seeds a FICTIONAL product team, "Lumen Labs" (7 people), into LOCAL Firebase emulators for
 * demos, screenshots and recordings of Planner.
 *
 * Same fence as scripts/seed-demo-performance.mjs (see scripts/demo-seed-kit.mjs): it refuses to
 * run unless FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set and
 * FIREBASE_PROJECT_ID starts with "demo-", drops real credentials, and WIPES the demo project's
 * emulator data first.
 *
 * It drives Planner's real server code (src/lib/planner/service.ts and the shared team and
 * profile platform), so every task, plan version and audit event is written exactly as the
 * product writes it. Last week's work is backdated afterwards so History and Insights read like
 * a team that has been planning for a while; the current plan is computed at run time, so the
 * calendar is always current. Every person, email (reserved `.example` domain) and task is made
 * up; the portraits in scripts/demo-people/ were generated locally and show no real person.
 *
 * Usage (with the Auth and Firestore emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin-planner \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8283 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9283 \
 *   node scripts/seed-demo-planner.mjs
 *
 * Then run `next dev` with the same three variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID (same
 * demo- id) and NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (see src/lib/firebase/emulators.ts), open
 * /apps/planner/sign-in and sign in as priya.raman@lumenlabs.example with DEMO_PASSWORD below.
 */
import { addDays, assertEmulatorsReachable, guardEmulators, localDay, portrait, registerSourceLoader, wipeEmulators, zonedDate } from "./demo-seed-kit.mjs";

const env = guardEmulators("seed-demo-planner");
await assertEmulatorsReachable(env);
registerSourceLoader();

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "lumen-emulator-only";
const DOMAIN = "lumenlabs.example";
const PRODUCT = "planner";
const TZ = "Europe/Amsterdam";

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const service = await import("@/lib/planner/service");
const { createTenant, grantMembership } = await import("@/lib/fleet/platform/tenants");
const { updateAccountProfile, setUploadedPhoto } = await import("@/lib/fleet/platform/profiles");
const { createInvitation } = await import("@/lib/fleet/platform/team");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) env.refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PEOPLE = [
  { key: "priya", name: "Priya Raman", title: "Head of Product", role: "owner" },
  { key: "daniel", name: "Daniel Brooks", title: "Engineering Lead", role: "admin" },
  { key: "sofia", name: "Sofia Marchetti", title: "Product Designer", role: "member" },
  { key: "kenji", name: "Kenji Watanabe", title: "Frontend Engineer", role: "member" },
  { key: "amara", name: "Amara Nwosu", title: "Product Marketing", role: "member" },
  { key: "lucas", name: "Lucas Ferreira", title: "Data Analyst", role: "member" },
  { key: "hannah", name: "Hannah Weiss", title: "Customer Success", role: "viewer" },
].map((person) => ({ ...person, email: `${person.name.toLowerCase().replace(/\s+/g, ".")}@${DOMAIN}`, uid: "" }));

const person = (key) => PEOPLE.find((entry) => entry.key === key);
const actor = (key) => {
  const entry = person(key);
  return { uid: entry.uid, email: entry.email, name: entry.name, emailVerified: true };
};

// ---------------------------------------------------------------------------
// Time: plan "this" week if it's Monday–Wednesday, otherwise next week.
// ---------------------------------------------------------------------------

const realNow = new Date();
const today = localDay(realNow, TZ);
const mondayOffset = today.weekday === 0 ? 1 : today.weekday <= 3 ? 1 - today.weekday : 8 - today.weekday;
const planMonday = addDays(today, mondayOffset);
/** Local wall-clock time `dayOffset` days after the plan week's Monday, e.g. at(2, "15:30"). */
function at(dayOffset, time) {
  const day = addDays(planMonday, dayOffset);
  const [hour, minute] = time.split(":").map(Number);
  return zonedDate(day.year, day.month, day.day, hour, minute, TZ);
}
const iso = (dayOffset, time) => at(dayOffset, time).toISOString();
const dateKey = (dayOffset) => {
  const day = addDays(planMonday, dayOffset);
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------
// Backdating: run a step "at" a past moment, then move every timestamp it wrote there.
// ---------------------------------------------------------------------------

const TRACKED = ["tasks", "projects", "events", "plans", "auditEvents", "capacity", "invitations"];
let tenantId = "";
const tenantDoc = () => db.collection("products").doc(PRODUCT).collection("tenants").doc(tenantId);

async function ids() {
  const result = new Map();
  for (const name of TRACKED) result.set(name, new Set((await tenantDoc().collection(name).select().get()).docs.map((doc) => doc.id)));
  return result;
}

async function during(when, label, work) {
  const before = await ids();
  const value = await work();
  let step = 0;
  for (const name of TRACKED) {
    const snapshot = await tenantDoc().collection(name).get();
    for (const doc of snapshot.docs) {
      if (before.get(name).has(doc.id)) continue;
      const stamp = Timestamp.fromMillis(when.getTime() + step * 75_000);
      step += 1;
      const patch = {};
      for (const field of ["createdAt", "occurredAt", "updatedAt", "joinedAt"]) {
        if (doc.get(field) instanceof Timestamp) patch[field] = stamp;
      }
      if (Object.keys(patch).length) await doc.ref.update(patch);
    }
  }
  console.log(`  ✓ ${label}`);
  return value;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

await wipeEmulators(env);
console.log("Seeding Lumen Labs into the Planner emulator (fictional)…");

for (const entry of PEOPLE) {
  const user = await auth.createUser({ email: entry.email, password: DEMO_PASSWORD, displayName: entry.name, emailVerified: true });
  entry.uid = user.uid;
  await updateAccountProfile(PRODUCT, actor(entry.key), { name: entry.name, title: entry.title });
  await setUploadedPhoto(PRODUCT, actor(entry.key), await portrait(entry.key));
}
console.log(`  ✓ ${PEOPLE.length} people with profile photos`);

const priya = actor("priya");
const tenant = await createTenant(PRODUCT, priya, "Lumen Labs · Product");
tenantId = tenant.id;
const tenantStart = at(-11, "10:05");
await tenantDoc().update({ createdAt: Timestamp.fromDate(tenantStart) });
for (const doc of (await tenantDoc().collection("auditEvents").get()).docs) await doc.ref.update({ occurredAt: Timestamp.fromDate(tenantStart) });
await tenantDoc().collection("memberships").doc(person("priya").uid).update({ joinedAt: Timestamp.fromDate(tenantStart) });

await during(at(-11, "10:12"), "team joined", async () => {
  for (const entry of PEOPLE.filter((member) => member.role !== "owner")) {
    await grantMembership(PRODUCT, tenantId, priya, { uid: entry.uid, email: entry.email, name: entry.name }, entry.role);
  }
});

await during(at(-11, "10:30"), "working hours and focus hours", async () => {
  await service.saveSettings(priya, tenantId, {
    timeZone: TZ,
    days: [1, 2, 3, 4, 5],
    startMinute: 9 * 60,
    endMinute: 17 * 60 + 30,
    horizonDays: 14,
    minChunkMinutes: 30,
    maxChunkMinutes: 120,
    bufferMinutes: 10,
    focus: { deep: { startMinute: 9 * 60 + 45, endMinute: 12 * 60 + 30 }, shallow: { startMinute: 14 * 60, endMinute: 17 * 60 + 30 } },
  });
  await service.setMemberCapacity(actor("daniel"), tenantId, person("daniel").uid, { capacityMinutesPerDay: 300 });
  await service.setMemberFocus(actor("kenji"), tenantId, person("kenji").uid, { focus: { deep: { startMinute: 13 * 60, endMinute: 16 * 60 + 30 }, shallow: { startMinute: 9 * 60 + 45, endMinute: 11 * 60 } } });
});

const projects = await during(at(-11, "10:45"), "projects", async () => ({
  launch: (await service.createProject(priya, tenantId, { name: "Autumn launch" })).id,
  onboarding: (await service.createProject(priya, tenantId, { name: "Onboarding revamp" })).id,
  research: (await service.createProject(priya, tenantId, { name: "Customer research" })).id,
  ops: (await service.createProject(actor("daniel"), tenantId, { name: "Team operations" })).id,
}));

// Meetings: last week (history) and the plan week.
const EVERYONE = null;
const meetings = [];
for (const week of [-7, 0]) {
  for (let day = 0; day < 5; day += 1) meetings.push({ title: "Daily stand-up", day: week + day, start: "09:30", end: "09:45", who: EVERYONE });
  meetings.push(
    { title: "Sprint planning", day: week, start: "13:00", end: "14:00", who: EVERYONE },
    { title: "Demo hour", day: week + 4, start: "15:30", end: "16:30", who: EVERYONE },
  );
}
meetings.push(
  { title: "Design critique", day: 1, start: "11:00", end: "12:00", who: "sofia" },
  { title: "Priya / Daniel 1:1", day: 1, start: "15:00", end: "15:45", who: "priya" },
  { title: "Priya / Daniel 1:1", day: 1, start: "15:00", end: "15:45", who: "daniel" },
  { title: "Customer call: Brightwater", day: 2, start: "10:00", end: "11:00", who: "amara" },
  { title: "Analytics sync", day: 2, start: "14:00", end: "14:45", who: "lucas" },
  { title: "Architecture review", day: 2, start: "11:00", end: "12:00", who: "daniel" },
  { title: "Team lunch", day: 3, start: "12:15", end: "13:15", who: EVERYONE },
  { title: "Launch go / no-go", day: 3, start: "16:00", end: "16:45", who: EVERYONE },
  { title: "Interview: senior engineer", day: 4, start: "10:00", end: "11:00", who: "daniel" },
  { title: "Press briefing", day: 4, start: "11:30", end: "12:15", who: "amara" },
  { title: "Customer call: Northgate", day: -5, start: "10:00", end: "11:00", who: "amara" },
  { title: "Leadership sync", day: 0, start: "11:00", end: "11:45", who: "priya" },
  { title: "1:1 with Sofia", day: 2, start: "13:30", end: "14:00", who: "priya" },
  { title: "1:1 with Sofia", day: 2, start: "13:30", end: "14:00", who: "sofia" },
  { title: "Investor update call", day: 2, start: "16:00", end: "16:45", who: "priya" },
  { title: "Interview: product designer", day: 3, start: "10:00", end: "11:00", who: "priya" },
  { title: "Pipeline review", day: 4, start: "10:00", end: "10:45", who: "priya" },
);
await during(at(-8, "16:20"), "meetings", async () => {
  for (const meeting of meetings) {
    await service.createEvent(priya, tenantId, {
      title: meeting.title,
      start: iso(meeting.day, meeting.start),
      end: iso(meeting.day, meeting.end),
      memberId: meeting.who ? person(meeting.who).uid : null,
    });
  }
});

// Last week's work, which gets done.
const lastWeek = [
  { key: "roadmap", title: "Draft Q1 roadmap", who: "priya", project: "research", minutes: 120, priority: "high", due: [-4, "17:00"], actual: 150, doneAt: [-4, "16:10"] },
  { key: "guide", title: "Customer interview guide", who: "amara", project: "research", minutes: 60, priority: "medium", due: [-6, "17:00"], actual: 45, doneAt: [-6, "11:40"] },
  { key: "ratelimit", title: "Fix login rate limiting", who: "kenji", project: "launch", minutes: 180, priority: "urgent", due: [-5, "17:00"], actual: 240, doneAt: [-5, "16:30"] },
  { key: "pricing", title: "Pricing experiment analysis", who: "lucas", project: "launch", minutes: 120, priority: "high", due: [-4, "12:00"], actual: 110, doneAt: [-4, "11:20"] },
  { key: "audit", title: "Onboarding flow audit", who: "sofia", project: "onboarding", minutes: 90, priority: "medium", due: [-5, "17:00"], actual: 90, doneAt: [-5, "15:00"] },
  { key: "staging", title: "Set up the staging environment", who: "daniel", project: "ops", minutes: 150, priority: "high", due: [-6, "17:00"], actual: 200, doneAt: [-6, "16:45"] },
  { key: "contract", title: "Partner contract review", who: "priya", project: "ops", minutes: 60, priority: "medium", due: [-5, "12:00"], actual: 75, doneAt: [-4, "10:30"] },
];

// The plan week.
const thisWeek = [
  { key: "security", title: "Security questionnaire for Brightwater", who: "daniel", project: "launch", minutes: 360, priority: "urgent", due: [0, "13:00"] },
  { key: "checkout", title: "Fix checkout edge cases", who: "kenji", project: "launch", minutes: 150, priority: "urgent", due: [1, "17:00"] },
  { key: "qa", title: "QA the release candidate", who: "kenji", project: "launch", minutes: 180, priority: "high", due: [3, "12:00"], after: ["checkout"] },
  { key: "pricingcopy", title: "Finalize pricing page copy", who: "amara", project: "launch", minutes: 90, priority: "urgent", due: [1, "12:00"] },
  { key: "announce", title: "Write the launch announcement", who: "amara", project: "launch", minutes: 120, priority: "high", due: [2, "17:00"], after: ["pricingcopy"] },
  { key: "dashboard", title: "Launch metrics dashboard", who: "lucas", project: "launch", minutes: 150, priority: "high", due: [2, "17:00"] },
  { key: "deck", title: "Launch readiness deck", who: "priya", project: "launch", minutes: 90, priority: "high", due: [3, "15:00"] },
  { key: "video", title: "Record the product walkthrough", who: "sofia", project: "launch", minutes: 120, priority: "medium", due: [3, "17:00"], after: ["checklist"] },
  { key: "checklist", title: "Design the new welcome checklist", who: "sofia", project: "onboarding", minutes: 180, priority: "high", due: [2, "12:00"] },
  { key: "empty", title: "Prototype empty states", who: "sofia", project: "onboarding", minutes: 120, priority: "medium", due: [4, "17:00"] },
  { key: "api", title: "Build the checklist API", who: "daniel", project: "onboarding", minutes: 240, priority: "high", due: [4, "17:00"] },
  { key: "funnel", title: "Review onboarding funnel data", who: "lucas", project: "onboarding", minutes: 90, priority: "medium", due: [4, "12:00"] },
  { key: "synthesis", title: "Synthesize interview notes", who: "priya", project: "research", minutes: 120, priority: "medium", due: [1, "17:00"] },
  { key: "summary", title: "Share the research summary", who: "priya", project: "research", minutes: 60, priority: "medium", due: [4, "12:00"], after: ["synthesis"] },
  { key: "interviews", title: "Schedule five customer interviews", who: "amara", project: "research", minutes: 30, priority: "low", type: "shallow" },
  { key: "hiring", title: "Update the hiring plan", who: "daniel", project: "ops", minutes: 60, priority: "medium", due: [4, "17:00"] },
  { key: "expenses", title: "Submit October expenses", who: "priya", project: "ops", minutes: 30, priority: "low", type: "shallow" },
  { key: "okrs", title: "Draft Q1 OKRs", who: "priya", project: "research", minutes: 150, priority: "high", due: [2, "12:00"] },
  { key: "board", title: "Board update: launch section", who: "priya", project: "launch", minutes: 90, priority: "high", due: [2, "16:00"] },
  { key: "designs", title: "Review the onboarding designs", who: "priya", project: "onboarding", minutes: 45, priority: "medium", due: [3, "12:00"], after: ["checklist"] },
  { key: "allhands", title: "All-hands slides", who: "priya", project: "ops", minutes: 60, priority: "medium", due: [4, "15:00"] },
  { key: "pricingok", title: "Pricing sign-off with finance", who: "priya", project: "launch", minutes: 30, priority: "urgent", due: [1, "12:00"], type: "shallow" },
  { key: "debrief", title: "Hiring debrief notes", who: "priya", project: "ops", minutes: 45, priority: "medium", due: [3, "17:00"], type: "shallow" },
  { key: "gonogo", title: "Go / no-go prep", who: "priya", project: "launch", minutes: 60, priority: "high", lock: [3, "14:00"] },
];

const taskIds = {};
async function addTask(spec) {
  const { id } = await service.createTask(actor(spec.who === "daniel" ? "daniel" : "priya"), tenantId, {
    title: spec.title,
    projectId: projects[spec.project],
    durationMinutes: spec.minutes,
    priority: spec.priority,
    deadline: spec.due ? iso(...spec.due) : null,
    earliestStart: null,
    lockedStart: spec.lock ? iso(...spec.lock) : null,
    dependsOn: (spec.after ?? []).map((key) => taskIds[key]).filter(Boolean),
    assigneeId: person(spec.who).uid,
    notes: "",
    type: spec.type ?? "deep",
  });
  taskIds[spec.key] = id;
}

await during(at(-8, "16:40"), "last week's tasks", async () => {
  for (const spec of lastWeek) await addTask(spec);
});

const recurring = await during(at(-8, "17:05"), "repeating tasks", async () => ({
  prs: (await service.createTask(actor("daniel"), tenantId, {
    title: "Review pull requests", projectId: projects.ops, durationMinutes: 30, priority: "high", dependsOn: [], assigneeId: person("daniel").uid, notes: "", type: "shallow",
    recurrence: { freq: "weekdays", interval: 1, startDate: dateKey(-7) },
  })).id,
  metrics: (await service.createTask(actor("lucas"), tenantId, {
    title: "Weekly metrics email", projectId: projects.ops, durationMinutes: 45, priority: "medium", dependsOn: [], assigneeId: person("lucas").uid, notes: "", type: "shallow",
    recurrence: { freq: "weekly", interval: 1, weekdays: [1], startDate: dateKey(-7) },
  })).id,
}));

await during(at(-7, "08:50"), "plan v1", async () => {
  await service.runScheduler(priya, tenantId, { note: "Monday planning" }, iso(-7, "08:50"));
});

// The week happens: work gets done (with actual time), one task is pushed twice.
for (const spec of lastWeek) {
  const doneAt = at(...spec.doneAt);
  await during(doneAt, `done: ${spec.title}`, async () => {
    await service.updateTask(actor(spec.who), tenantId, taskIds[spec.key], { status: "done", actualMinutes: spec.actual });
  });
  await tenantDoc().collection("tasks").doc(taskIds[spec.key]).update({ completedAt: Timestamp.fromDate(doneAt), updatedAt: Timestamp.fromDate(doneAt) });
}
for (let day = -7; day <= -3; day += 1) {
  const when = at(day, "16:50");
  await during(when, `review pull requests (${dateKey(day)})`, async () => {
    await service.setOccurrenceStatus(actor("daniel"), tenantId, recurring.prs, { date: dateKey(day), status: "done", actualMinutes: day === -5 ? 50 : 30 });
  });
}
await during(at(-7, "11:15"), "weekly metrics email", async () => {
  await service.setOccurrenceStatus(actor("lucas"), tenantId, recurring.metrics, { date: dateKey(-7), status: "done", actualMinutes: 40 });
});

await during(at(-5, "14:20"), "this week's work captured", async () => {
  for (const spec of thisWeek.filter((entry) => !entry.after)) await addTask(spec);
  for (const spec of thisWeek.filter((entry) => entry.after)) await addTask(spec);
});

await during(at(-5, "14:40"), "plan v2", async () => {
  await service.runScheduler(actor("daniel"), tenantId, { note: "Replanned after the Brightwater request" }, iso(-5, "14:40"));
});

await during(at(-4, "17:10"), "hiring plan pushed", async () => {
  await service.pushTask(actor("daniel"), tenantId, taskIds.hiring, iso(-4, "17:10"));
});
await during(at(-3, "16:55"), "hiring plan pushed again", async () => {
  await service.pushTask(actor("daniel"), tenantId, taskIds.hiring, iso(-3, "16:55"));
});

await during(at(-3, "15:05"), "plan v3", async () => {
  await service.runScheduler(priya, tenantId, { note: "Friday replan for launch week" }, iso(-3, "15:05"));
});

// The current plan: computed now, from the real clock, so the calendar is always fresh.
const nowPlan = new Date(Math.min(Date.now(), at(0, "08:40").getTime()));
await during(nowPlan, "plan v4 (current)", async () => {
  await service.runScheduler(priya, tenantId, { note: "Planned for launch week" });
});
await tenantDoc().collection("plans").orderBy("version", "desc").limit(1).get().then(async (snapshot) => {
  const doc = snapshot.docs[0];
  if (doc) await doc.ref.update({ createdAt: Timestamp.fromDate(nowPlan) });
});

await during(new Date(Math.min(Date.now(), at(0, "08:45").getTime())), "invitation for Jonas", async () => {
  await createInvitation(PRODUCT, tenantId, priya, { email: `jonas.berg@${DOMAIN}`, role: "member" }, (token) => `http://localhost:3483/apps/planner/invite/${token}`);
});

const plan = (await service.loadWorkspace(priya, tenantId)).latestPlan;
console.log(`
Lumen Labs is ready (fictional demo data, emulators only).
  workspace:   ${tenantId} ("${tenant.name}")
  people:      ${PEOPLE.length} — sign in as ${person("priya").email} (owner); password: DEMO_PASSWORD in this script
  plan week:   ${dateKey(0)} (${TZ})
  plan v${plan?.version}:     ${plan?.stats.scheduledTasks} tasks placed, ${plan?.stats.lateTasks} late, ${plan?.stats.unscheduledTasks} not placed
`);
process.exit(0);
