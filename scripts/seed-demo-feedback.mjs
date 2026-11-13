#!/usr/bin/env node
/**
 * Seeds a FICTIONAL company, "Lumio" (a collaborative whiteboard), into LOCAL Firebase
 * emulators for demos and screenshots of Feedback: a five-person product team, ten named
 * customers with profile photos and forty more voters, four boards, two dozen ideas with
 * votes, threads, team notes, owners, releases and a changelog.
 *
 * It refuses to run unless FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are set
 * and FIREBASE_PROJECT_ID starts with "demo-" (see scripts/demo-portal-seed-kit.mjs). Real credentials
 * are dropped first, and the demo project's emulator data is wiped on every run.
 *
 * It drives the real data layer (src/lib/feedback/*, src/lib/fleet/platform/*), so every
 * record and activity entry is written exactly as the product writes it; afterwards the
 * history is spread over Aug–Nov 2026. People, companies and emails (on the reserved
 * `.example` domain) are made up; the portraits in scripts/demo-photos/feedback are
 * generated, not of real people.
 *
 * Usage (emulators started with `--project demo-saasassin-feedback`, the id below, because
 * the browser Auth SDK signs in against the default project; e.g. Auth 9285, Firestore 8285):
 *   FIREBASE_PROJECT_ID=demo-saasassin-feedback \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8285 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9285 \
 *   node scripts/seed-demo-feedback.mjs
 *
 * Then run `next dev` with the same variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID and
 * NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (src/lib/firebase/emulators.ts) and sign in as
 * nadia@lumio.example with DEMO_PASSWORD below (emulator-only).
 */
import { createTimeline, demoPhoto, prepareDemoSeed, wipeEmulators } from "./demo-portal-seed-kit.mjs";

const gate = prepareDemoSeed("seed-demo-feedback");

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "lumio-emulator-only";
const PRODUCT = "feedback";

const { getAdminAuth } = await import("@/lib/firebase/admin");
const feedback = await import("@/lib/feedback/data");
const tenants = await import("@/lib/fleet/platform/tenants");
const profiles = await import("@/lib/fleet/platform/profiles");
const team = await import("@/lib/fleet/platform/team");
const { Timestamp } = await import("firebase-admin/firestore");

const auth = getAdminAuth();
if (!auth) gate.refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------- people

/** [key, name, email, job title, role] — the Lumio product team. */
const TEAM = [
  ["nadia", "Nadia Haddad", "nadia@lumio.example", "Head of Product", "owner"],
  ["tom", "Tom Becker", "tom@lumio.example", "Product Manager", "admin"],
  ["yuki", "Yuki Tanaka", "yuki@lumio.example", "Support Lead", "member"],
  ["daniel", "Daniel Osei", "daniel@lumio.example", "Engineering Manager", "member"],
  ["clara", "Clara Jensen", "clara@lumio.example", "Product Designer", "viewer"],
];

/** [key, name, email, company, segment] — customers who post and vote (with portraits). */
const CUSTOMERS = [
  ["marco", "Marco Bianchi", "marco@studiobianchi.example", "Studio Bianchi", "Pro"],
  ["leila", "Leila Farouk", "leila.farouk@northbeam.example", "Northbeam Health", "Enterprise"],
  ["jake", "Jake Morrison", "jake@tinyrocket.example", "Tiny Rocket", "Starter"],
  ["sofia", "Sofia Alvarez", "sofia@alvarez-co.example", "Alvarez & Co", "Pro"],
  ["mei", "Mei Lin", "mei.lin@kitewing.example", "Kitewing", "Enterprise"],
  ["arjun", "Arjun Mehta", "arjun@paperplane.example", "Paperplane Labs", "Pro"],
  ["hannah", "Hannah Weiss", "hweiss@brightside.example", "Brightside Schools", "Education"],
  ["segun", "Segun Adeyemi", "segun@korapay.example", "Kora Pay", "Enterprise"],
  ["chloe", "Chloé Martin", "chloe@atelierlune.example", "Atelier Lune", "Starter"],
  ["kwame", "Kwame Mensah", "kwame.mensah@mail.example", "", ""],
];

const FIRST = ["Noah", "Emma", "Priya", "Oliver", "Fatima", "Lucas", "Ava", "Mateo", "Zoe", "Ibrahim", "Ines", "Ethan", "Yara", "Felix", "Maya", "Hugo", "Lena", "Omar", "Elif", "Sam"];
const LAST = ["Fischer", "Lindqvist", "Nair", "Grant", "Zahra", "Moreau", "Kowalski", "Reyes", "Park", "Haddad", "Silva", "Brooks", "Nakamura", "Novak", "Okoye", "Dubois", "Berg", "Rahman", "Costa", "Walsh"];
/** Forty quieter customers who vote (initials, no photo). */
const VOTERS = Array.from({ length: 40 }, (_, index) => {
  const name = `${FIRST[index % FIRST.length]} ${LAST[(index * 7 + 3 + Math.floor(index / FIRST.length) * 3) % LAST.length]}`;
  return [`v${String(index + 1).padStart(2, "0")}`, name, `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@customers.example`];
});

const people = new Map();
for (const [key, name, email, title, role] of TEAM) people.set(key, { uid: `lumio-team-${key}`, name, email, title, role });
// Customer uids sort before the quieter voters, so their faces lead each voter stack.
CUSTOMERS.forEach(([key, name, email, company, segment], index) => people.set(key, { uid: `lumio-c${String(index + 1).padStart(2, "0")}-${key}`, name, email, company, segment }));
for (const [key, name, email] of VOTERS) people.set(key, { uid: `lumio-v-${key}`, name, email });

const who = (key) => {
  const found = people.get(key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return { uid: found.uid, email: found.email, name: found.name, emailVerified: true };
};

let seed = 20261113;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// ---------------------------------------------------------------------------- ideas

/**
 * key, board, title, details, author, named voters, total votes, tags.
 * Status changes, owners, comments and notes are applied in later phases.
 */
const IDEAS = [
  ["offline", "requests", "Offline mode for the desktop app", "Our clinicians run workshops in hospital rooms with patchy Wi-Fi, and we lose edits when the connection drops mid-session. Even read-only access offline, with changes syncing when we're back online, would help a lot.", "leila", ["mei", "jake", "marco", "hannah", "segun", "arjun", "sofia"], 42, ["desktop", "collaboration"]],
  ["pdf", "requests", "Export a board to PDF with selected frames", "I send boards to clients who don't use Lumio. Exporting only the frames I choose, one per page, would save me an hour of screenshots every week.", "marco", ["sofia", "hannah", "chloe", "arjun", "kwame"], 31, ["export"]],
  ["darkmode", "requests", "Dark mode", "Long evening workshops are rough on the eyes with a bright white canvas. A proper dark theme, including sticky colours that still read well, please.", "chloe", ["jake", "kwame", "mei", "marco", "arjun"], 38, ["accessibility", "desktop"]],
  ["jira", "integrations", "Two-way Jira sync for sticky notes", "We plan sprints on a Lumio board, then retype every sticky into Jira. Turning a sticky into a Jira issue, and showing its status on the board, would close that gap.", "arjun", ["segun", "mei", "leila", "sofia"], 28, ["integrations"]],
  ["tables", "requests", "Markdown tables in text blocks", "Pasting a table from our docs turns into a mess of pipes. Markdown tables that render inside text blocks would make our planning boards much cleaner.", "hannah", ["marco", "mei", "arjun"], 19, ["export"]],
  ["slack", "integrations", "Notify mentioned people in Slack", "When someone @mentions me in a comment I only find out the next time I open the board. A Slack DM with a link to the comment would keep conversations moving.", "sofia", ["arjun", "jake", "segun", "leila"], 22, ["integrations", "collaboration"]],
  ["presenter", "requests", "Presenter mode that follows the speaker", "In remote workshops half the room gets lost on a big board. Let participants follow the facilitator's view, with a way to break away and come back.", "mei", ["hannah", "leila", "sofia"], 17, ["collaboration"]],
  ["timer", "requests", "Timer and dot voting for workshops", "We run retros and design sprints on Lumio. A shared timer and dot voting on stickies would mean one less tool open during sessions.", "hannah", ["chloe", "jake", "mei", "sofia", "marco"], 25, ["collaboration"]],
  ["scim", "advisory", "SCIM provisioning with Okta", "Our IT team needs accounts created and removed automatically from Okta. Manual offboarding is a blocker for rolling Lumio out to the whole hospital group.", "leila", ["segun", "mei"], 9, ["enterprise"]],
  ["auditlog", "advisory", "Audit log export for workspace admins", "Our compliance team asks who shared which board externally and when. A CSV or API export of admin events would answer that without a support ticket.", "segun", ["leila", "mei"], 7, ["enterprise"]],
  ["pencil", "requests", "Pressure sensitivity for Apple Pencil", "Sketching on the iPad feels flat because every line has the same weight. Pressure-sensitive strokes would make Lumio usable for quick wireframes.", "kwame", ["chloe", "jake"], 16, ["mobile"]],
  ["grid", "requests", "Snap stickies to a grid", "Aligning thirty stickies by hand takes forever. An optional grid to snap to would keep affinity maps tidy.", "jake", ["kwame"], 12, ["desktop"]],
  ["retro", "requests", "Template gallery for retros", "A few ready-made retro and kickoff templates would help new teams get started without building a board from scratch.", "chloe", ["hannah", "sofia", "jake"], 20, ["collaboration"]],
  ["align", "requests", "Keyboard shortcut to align selected objects", "Selecting objects and aligning them from the menu breaks my flow. Shortcuts for align left, centre and distribute would be perfect.", "jake", ["marco", "arjun"], 14, ["desktop"]],
  ["undo", "requests", "Undo history panel", "Sometimes I want to go back ten steps, or see who changed what. A history panel with named steps would make experimenting less scary.", "marco", ["sofia"], 11, ["desktop"]],
  ["slow", "bugs", "Large boards load slowly", "Boards with 3,000+ objects take 20 seconds or more to open and stutter when zooming. Our research synthesis boards are getting hard to use.", "mei", ["leila", "arjun", "hannah"], 18, ["desktop"]],
  ["cursor", "bugs", "Cursor jumps when two people edit the same sticky", "If a teammate and I type in the same sticky at once, my cursor jumps to the end and text gets interleaved.", "arjun", ["marco", "sofia"], 13, ["collaboration"]],
  ["blurry", "bugs", "Text looks blurry when zoomed out on Windows", "On Windows with 125% scaling, text on stickies is blurry below 50% zoom. Mac looks fine.", "segun", [], 6, ["desktop"]],
  ["drive", "integrations", "Google Drive previews in embeds", "Embedding a Drive file shows only a link. Showing a live preview of docs and slides on the board would save a lot of tab switching.", "hannah", ["sofia"], 8, ["integrations"]],
  ["figma", "integrations", "Figma frames as live embeds", "Our designers present Figma frames during workshops. Embeds that stay in sync with the Figma file would beat pasting screenshots that go stale.", "chloe", ["marco", "mei", "arjun"], 24, ["integrations"]],
  ["pdfdupe", "requests", "Export frames as PDF pages", "Please let me export each frame as its own PDF page so I can share with clients.", "kwame", [], 6, ["export"]],
  ["spam", "requests", "Cheap followers and likes, fast delivery", "Visit our site for the best prices on followers.", "v39", [], 1, []],
];

/** Posted in the last week, so the inbox has fresh arrivals. */
const RECENT = [
  ["sharelink", "requests", "Read-only share link without sign-in", "Clients and stakeholders shouldn't need an account just to look at a board. A view-only link, ideally with an expiry date, would cover most of our sharing.", "sofia", ["marco", "chloe", "hannah", "arjun", "jake"], 27, ["collaboration"]],
  ["comments-resolve", "requests", "Resolve comment threads", "Once feedback on a frame is handled, the comment bubbles stay forever. Resolving a thread should hide it, with a filter to see resolved ones.", "arjun", ["mei"], 5, ["collaboration"]],
  ["ipad-crash", "bugs", "App closes when pasting images on iPad", "Pasting an image from Photos into a board closes the app on iPadOS 19. Happens every time on two devices.", "kwame", ["chloe"], 3, ["mobile"]],
];

// ---------------------------------------------------------------------------- seed

console.log(`Seeding Lumio (fictional) into emulators for ${gate.projectId}…`);
await wipeEmulators(gate);
const { at, remapTree } = createTimeline(Timestamp);

for (const person of people.values()) {
  await auth.createUser({ uid: person.uid, email: person.email, password: DEMO_PASSWORD, displayName: person.name, emailVerified: true });
}
console.log(`  ✓ ${people.size} emulator accounts`);

// Profiles: names, job titles and portraits (as if each person signed in once and set them).
let photos = 0;
for (const [key, person] of people) {
  const user = who(key);
  await profiles.syncProfileFromSession(PRODUCT, user);
  if (person.title) await profiles.updateAccountProfile(PRODUCT, user, { title: person.title });
  const photo = demoPhoto("feedback", key);
  if (photo) {
    await profiles.setUploadedPhoto(PRODUCT, user, photo);
    photos += 1;
  }
}
console.log(`  ✓ profiles (${photos} with photos)`);

const nadia = who("nadia");
const tom = who("tom");
let tenantId = "";
const boards = {};
const tags = {};
const initiatives = {};
const posts = {};

await at("2026-08-17T09:10:00Z", "2026-08-18T15:00:00Z", "workspace, team, boards and tags", async () => {
  ({ id: tenantId } = await tenants.createTenant(PRODUCT, nadia, "Lumio"));
  for (const [, , email, , role] of TEAM) {
    if (role === "owner") continue;
    await tenants.addTenantMember(PRODUCT, tenantId, nadia, { email, role });
  }
  for (const [key, name, description, isPublic] of [
    ["requests", "Feature requests", "Ideas to make Lumio better for you and your team. Vote for the ones you want most.", true],
    ["integrations", "Integrations", "Tools you'd like Lumio to connect with.", true],
    ["bugs", "Bug reports", "Something not working the way it should? Tell us what happened.", true],
    ["advisory", "Customer advisory board", "Requests from our enterprise advisory group. Private to the team.", true],
  ]) {
    boards[key] = await feedback.createBoard(tenantId, nadia, { name, description, isPublic });
  }
  for (const [key, name, color, isPublic] of [
    ["desktop", "Desktop", "#0E9384", true],
    ["collaboration", "Collaboration", "#7A5AF8", true],
    ["integrations", "Integrations", "#2E90FA", true],
    ["export", "Export", "#F79009", true],
    ["mobile", "Mobile", "#EE46BC", true],
    ["accessibility", "Accessibility", "#12B76A", true],
    ["enterprise", "Enterprise", "#475467", false],
  ]) {
    tags[key] = (await feedback.createTag(tenantId, nadia, { name, color, isPublic })).id;
  }
  for (const [key, name, description, kind, targetDate, isPublic] of [
    ["autumn", "Autumn release", "Dark mode and the most-voted editing fixes.", "release", "2026-11-05", true],
    ["winter", "Winter release", "Offline editing, PDF export and Jira sync.", "release", "2026-12-10", true],
    ["workshops", "Better workshops", "Everything a facilitator needs in one place.", "initiative", null, true],
    ["enterprise", "Enterprise readiness", "Provisioning, audit and admin controls for large rollouts.", "initiative", null, false],
  ]) {
    initiatives[key] = (await feedback.createInitiative(tenantId, tom, { name, description, kind, targetDate, isPublic })).id;
  }
});

async function postIdea([key, board, title, description, author]) {
  const slug = { requests: "feature-requests", integrations: "integrations", bugs: "bug-reports", advisory: "customer-advisory-board" }[board];
  posts[key] = (await feedback.createPost(tenantId, slug, who(author), { title, description })).id;
}

const quiet = VOTERS.map(([key]) => key);
/** Rows of [post key, author, named voters, total votes]: the named people vote, then quieter customers. */
async function vote(list) {
  for (const [key, author, named, total] of list) {
    const voters = new Set([author]);
    for (const name of named) voters.add(name);
    const shuffled = [...quiet].sort(() => random() - 0.5);
    for (const name of shuffled) {
      if (voters.size >= total) break;
      voters.add(name);
    }
    for (const name of voters) {
      if (name === author) continue;
      await feedback.toggleVoteForUser(tenantId, posts[key], who(name));
    }
  }
}

await at("2026-08-24T08:30:00Z", "2026-10-09T16:00:00Z", "customers posted ideas", async () => {
  for (const idea of IDEAS) await postIdea(idea);
});

await at("2026-08-25T09:00:00Z", "2026-10-02T16:00:00Z", "votes", async () => {
  await vote(IDEAS.map(([key, , , , author, named, total]) => [key, author, named, total]));
});

const comment = (key, person, text) => feedback.addComment(tenantId, posts[key], who(person), text);
const note = (key, person, text) => feedback.addInternalNote(tenantId, who(person), posts[key], text);

await at("2026-09-01T09:00:00Z", "2026-10-02T16:00:00Z", "conversations and team notes", async () => {
  await comment("offline", "mei", "Same for us on flights. Read-only would already be a big win.");
  await comment("offline", "jake", "I sketch on the train every morning and lose half of it in tunnels. +1");
  await note("offline", "yuki", "Northbeam and Kitewing both raised this in their quarterly reviews. Kitewing called it a renewal blocker.");
  await comment("offline", "tom", "Thanks, all. We're exploring this now. If you'd like to try an early build, reply here and we'll reach out.");
  await comment("offline", "hannah", "Yes please! Our school sites have very unreliable Wi-Fi.");
  await note("offline", "daniel", "Spike done: sync works well for boards under 2k objects. Larger boards need chunked snapshots first, so this depends on the large-board performance work.");
  await comment("pdf", "sofia", "A presenter-notes page per frame would make this perfect for client decks.");
  await comment("pdf", "hannah", "Please keep links clickable in the exported PDF.");
  await note("pdf", "tom", "Agency segment asks for this weekly. Three trials cited it in exit surveys.");
  await comment("darkmode", "kwame", "Yes! Bonus points if exports stay light.");
  await comment("jira", "segun", "We'd use this every sprint review. Status sync back to the sticky is the key part for us.");
  await note("jira", "daniel", "Jira Cloud only to start. Server/Data Center has a different auth model.");
  await comment("slack", "arjun", "Microsoft Teams too, please, for our enterprise customers.");
  await comment("timer", "chloe", "Dot voting with a limit per person would be ideal for retros.");
  await comment("slow", "leila", "Same on our synthesis boards. Zooming out is the worst part.");
  await note("slow", "daniel", "Profiled: rendering every sticky shadow at low zoom. Switching to cached tiles below 40%.");
  await comment("figma", "marco", "Even a read-only embed that refreshes on open would do.");
  await comment("pencil", "chloe", "Palm rejection would be great too while you're in there.");
  await comment("scim", "segun", "Same requirement from our security team. Azure AD as well, if possible.");
  await note("scim", "nadia", "Needed for the Northbeam group rollout (1,200 seats). Pairs with audit log export.");
  await comment("retro", "sofia", "A 'start, stop, continue' template would be my first pick.");
});

const move = (key, to, by, text) => feedback.changeStatus(tenantId, who(by), posts[key], to, text);

await at("2026-09-22T09:00:00Z", "2026-10-06T15:00:00Z", "first round of triage", async () => {
  await move("darkmode", "planned", "nadia", "On the roadmap. We're redesigning the sticky palette so every colour reads well in both modes.");
  await move("offline", "planned", "nadia", "Planned for the winter release. We'll start with offline editing for boards you've opened recently, and sync your changes when you reconnect.");
  await move("jira", "planned", "tom", "Planned. We'll start with turning a sticky into a Jira issue, then show its status on the board.");
  await move("timer", "planned", "tom", "Planned as part of our workshop tools.");
  await move("scim", "planned", "nadia", "Planned with our enterprise readiness work.");
  await move("darkmode", "started", "nadia", "Design is done and the palette is in testing. Shipping in the next few weeks.");
  await move("pdf", "started", "tom", "In progress. Frame selection is in review; A4 and Letter page sizes first.");
  await move("darkmode", "completed", "nadia", "Shipped! Turn it on in Settings → Appearance, or let Lumio follow your system. Thanks to everyone who voted.");
});

await at("2026-10-07T10:00:00Z", null, "changelog: dark mode", async () => {
  await feedback.createChangelogEntry(tenantId, nadia, {
    title: "Dark mode is here",
    body: "Lumio now follows your system appearance, or you can choose light or dark in Settings → Appearance. Every board, menu and export preview was tuned for both, including a new sticky palette that keeps contrast in the dark.",
    postIds: [posts.darkmode],
  });
});

await at("2026-10-12T09:00:00Z", "2026-10-30T16:00:00Z", "owners, releases, tags, customer details, a merge and a spam post", async () => {
  for (const [key, , , , , , , tagKeys] of IDEAS) {
    if (tagKeys.length) await feedback.setPostTags(tenantId, tom, posts[key], tagKeys.map((tag) => tags[tag]));
  }
  for (const [key, owner] of [["offline", "daniel"], ["pdf", "tom"], ["jira", "daniel"], ["slow", "daniel"], ["timer", "tom"], ["presenter", "tom"], ["scim", "nadia"], ["retro", "tom"], ["slack", "yuki"]]) {
    await feedback.assignPost(tenantId, tom, posts[key], people.get(owner).uid);
  }
  for (const [key, initiative] of [["darkmode", "autumn"], ["tables", "autumn"], ["align", "autumn"], ["cursor", "autumn"], ["offline", "winter"], ["pdf", "winter"], ["jira", "winter"], ["timer", "workshops"], ["presenter", "workshops"], ["retro", "workshops"], ["scim", "enterprise"], ["auditlog", "enterprise"]]) {
    await feedback.setPostInitiative(tenantId, tom, posts[key], initiatives[initiative]);
  }
  for (const [key, , , company, segment] of CUSTOMERS) {
    if (company) await feedback.upsertProfile(tenantId, tom, people.get(key).uid, { company, segment });
  }
  await feedback.mergePosts(tenantId, tom, posts.pdfdupe, posts.pdf, "");
  await feedback.moderate(tenantId, tom, { kind: "post", id: posts.spam, hidden: true, reason: "Spam: advertising" });
  await move("presenter", "started", "tom", "In progress. Follow mode is working internally; we're polishing how you break away and rejoin.");
  await move("retro", "started", "tom", "We're building the first six templates now.");
  await move("slow", "started", "daniel", "We found the main cause and a fix is in progress. Expect much faster zooming on big boards.");
  await move("drive", "declined", "nadia", "Not right now. Google only allows previews for files in shared drives, so embeds would break for most of you. We'll revisit if that changes.");
});

await at("2026-11-02T09:00:00Z", "2026-11-05T15:00:00Z", "second round: shipped work", async () => {
  await move("tables", "completed", "tom", "Shipped. Paste a Markdown table into any text block and it renders as a table.");
  await move("align", "completed", "tom", "Shipped: ⌥A / ⌥C / ⌥D to align left, centre and distribute.");
  await move("cursor", "started", "daniel", "Reproduced. Fixing in our sync layer.");
  await move("cursor", "completed", "daniel", "Fixed in 4.18. Simultaneous typing in one sticky now merges cleanly.");
});

await at("2026-11-06T10:30:00Z", null, "changelog: November", async () => {
  await feedback.createChangelogEntry(tenantId, tom, {
    title: "Tables, alignment shortcuts and smoother co-editing",
    body: "Three of your most-voted small things, shipped together. Markdown tables render inside text blocks, new shortcuts align and distribute selected objects, and typing in the same sticky as a teammate no longer moves your cursor.",
    postIds: [posts.tables, posts.align, posts.cursor],
  });
});

await at("2026-11-09T08:40:00Z", "2026-11-12T16:30:00Z", "fresh ideas this week", async () => {
  for (const idea of RECENT) await postIdea(idea);
  await vote(RECENT.map(([key, , , , author, named, total]) => [key, author, named, total]));
  for (const [key, , , , , , , tagKeys] of RECENT) await feedback.setPostTags(tenantId, tom, posts[key], tagKeys.map((tag) => tags[tag]));
  await comment("sharelink", "marco", "Expiring links would be perfect for client reviews.");
  await comment("sharelink", "hannah", "Parents and governors at our schools would use this a lot.");
  await note("sharelink", "yuki", "Fourth support ticket this month asking for this. Often from trial accounts.");
  await comment("ipad-crash", "chloe", "Same here on an iPad Air. Dragging the image in works as a workaround.");
  await note("ipad-crash", "yuki", "Reproduced on iPadOS 19.1. Sent to Daniel's team with a crash log.");
  await comment("offline", "segun", "Any rough timing on this? Our field team is asking.");
});

await at("2026-11-12T14:00:00Z", "2026-11-12T14:20:00Z", "invitation and webhook", async () => {
  await team.createInvitation(PRODUCT, tenantId, nadia, { email: "sam.ortiz@lumio.example", role: "member" }, (token) => `http://localhost/apps/feedback/invite/${token}`);
  await feedback.createWebhook(tenantId, tom, { url: "https://hooks.lumio.example/feedback", events: ["post.created", "status.changed"] });
  // The advisory group posted through a link while the board was open; it's private to the team now.
  await feedback.updateBoard(tenantId, nadia, boards.advisory.id, { isPublic: false });
});

const counter = await remapTree(tenants.tenantRef(PRODUCT, tenantId));
console.log(`  ✓ history spread over Aug–Nov 2026 (${counter.count} documents)`);

console.log(`
Lumio is ready (fictional demo data, emulators only).
  workspace:   ${tenantId}
  public portal: /apps/feedback/b/${tenantId}
  sign in as:  nadia@lumio.example (owner) · password: DEMO_PASSWORD in this script
  people:      ${TEAM.length} team members, ${CUSTOMERS.length + VOTERS.length} customers
  ideas:       ${IDEAS.length + RECENT.length}
`);
process.exit(0);
