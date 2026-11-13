#!/usr/bin/env node
/**
 * Seeds a FICTIONAL community, "Riverside Makers", into LOCAL Firebase emulators for demos and
 * product screenshots of Community.
 *
 * It never touches a real project: it refuses to run unless both emulator hosts are set and the
 * project id starts with "demo-" (see scripts/demo-seed-emulator-kit.mjs). It drives the real
 * server data layer (src/lib/community/data.ts and the shared team platform), so every join,
 * post, reply, reaction, RSVP, moderation step and audit event is written exactly as the product
 * writes it, then spreads the history over the last eleven weeks. Every person, email (on the
 * reserved `.example` domain) and post is made up. The profile photos in
 * scripts/demo-assets/riverside-faces are AI-generated (FLUX.2 klein, run locally) and depict no
 * real person. Only Community's emulator data and this seed's own accounts are replaced.
 *
 * Usage (with the Auth and Firestore emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin-brands \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8284 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9284 \
 *   node scripts/seed-demo-community.mjs
 *
 * Then run `next dev` with the emulator variables (src/lib/firebase/emulators.ts) and sign in as
 * marisol@riverside-makers.example with DEMO_PASSWORD below (valid on the emulator only).
 */
import { existsSync, readFileSync } from "node:fs";

import { gateEmulators, registerSourceLoader, timeline, wipeProduct } from "./demo-seed-emulator-kit.mjs";

const { projectId, refuse } = await gateEmulators("seed-demo-community");
registerSourceLoader();

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "riverside-emulator-only";
const DOMAIN = "riverside-makers.example";

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const data = await import("@/lib/community/data");
const { actionSchema, COMMUNITY_SLUG: P } = await import("@/lib/community/model");
const { createTenant } = await import("@/lib/fleet/platform/tenants");
const team = await import("@/lib/fleet/platform/team");
const profiles = await import("@/lib/fleet/platform/profiles");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");

// ---------------------------------------------------------------------------
// The fictional community
// ---------------------------------------------------------------------------

/** key, name, handle, headline, bio. Felix and Noah never uploaded a photo, so they show initials. */
const PEOPLE = [
  ["marisol", "Marisol Vega", "marisol", "Founder · furniture restorer", "Started Riverside Makers in a borrowed garage in 2019. Ask me about veneer repairs."],
  ["june", "June Park", "june", "Community manager", "I run the calendar, the newsletter and the tea rota."],
  ["priya", "Priya Nair", "priya", "Furniture maker", "Hand-cut joinery, mostly walnut and oak. Moderator."],
  ["tomas", "Tomás Ruiz", "tomas", "Woodturner", "Bowls, spoons and the occasional lamp."],
  ["kofi", "Kofi Mensah", "kofi", "Ceramicist", "Stoneware, wood-fired when the kiln behaves."],
  ["ingrid", "Ingrid Solberg", "ingrid", "Weaver", "Floor loom, natural dyes, too many sheep jokes."],
  ["sam", "Sam Whitford", "sam_w", "Hobby blacksmith", "Hooks, hinges and the odd knife."],
  ["leila", "Leila Haddad", "leila", "Leatherworker", "Bags and belts, hand-stitched."],
  ["oliver", "Oliver Grant", "oliver", "Retired joiner", "Forty years of sash windows. Happy to help with anything wooden."],
  ["mei", "Mei Tanaka", "mei", "Bookbinder", "Coptic stitch evangelist."],
  ["ade", "Ade Okonkwo", "ade", "Electronics tinkerer", "Arduino, guitar pedals, repairing what others throw away."],
  ["rachel", "Rachel Stein", "rachel", "Printmaker", "Linocuts and a very old Adana press."],
  ["ana-lima", "Ana Lima", "ana-lima", "Upholsterer", "Reviving chairs one spring at a time."],
  ["zara", "Zara Ali", "zara", "New to woodworking", "Just bought my first chisel set!"],
  ["felix", "Felix Brandt", "felix", "", ""],
  ["noah", "Noah Bennett", "noah", "Weekend woodworker", ""],
].map(([key, name, handle, headline, bio]) => ({
  key,
  name,
  handle,
  headline,
  bio,
  uid: `rm-${key}`,
  email: `${key}@${DOMAIN}`,
}));

const person = (key) => {
  const found = PEOPLE.find((entry) => entry.key === key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return { uid: found.uid, email: found.email, name: found.name, emailVerified: true };
};

let tenantId = "";
const run = (key, action) => data.runAction(tenantId, person(key), actionSchema.parse(action));
const inDays = (days, hour, minute = 0) => {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Riverside Makers (fictional) into emulators for ${projectId}…`);
await wipeProduct(db, auth, P, PEOPLE.map((entry) => entry.uid));
const { at, remapTree } = timeline(Timestamp);

let photos = 0;
for (const entry of PEOPLE) {
  await auth.createUser({ uid: entry.uid, email: entry.email, password: DEMO_PASSWORD, displayName: entry.name, emailVerified: true });
  await profiles.syncProfileFromSession(P, person(entry.key));
  const photo = new URL(`./demo-assets/riverside-faces/${entry.key}.webp`, import.meta.url);
  if (existsSync(photo)) {
    await profiles.setUploadedPhoto(P, person(entry.key), new Uint8Array(readFileSync(photo)));
    photos += 1;
  }
}
console.log(`  ✓ ${PEOPLE.length} emulator accounts, ${photos} with a profile photo`);

const marisol = person("marisol");
await at(78, 78, "community created by Marisol Vega", async () => {
  tenantId = (await createTenant(P, marisol, "Riverside Makers")).id;
});

const spaces = {};
await at(78, 77, "spaces opened", async () => {
  const create = async (key, name, description, kind, visibility = "members", memberUids = []) => {
    spaces[key] = (await run("marisol", { type: "space.create", space: { name, description, kind, visibility, memberUids } })).id;
  };
  await create("announcements", "Announcements", "News from the workshop and the team.", "announcements");
  await create("intros", "Introductions", "New here? Tell us what you make.", "discussion");
  await create("show", "Show & tell", "Finished something? Half-finished? Show us.", "discussion");
  await create("help", "Help & advice", "Stuck on a joint, a glaze or a stitch? Ask away.", "discussion");
  await create("events", "Workshop nights", "Open benches, demos and firing days.", "events");
  await create("founders", "Founding members", "For the people who keep the lights on.", "discussion", "private", ["rm-marisol", "rm-priya", "rm-oliver", "rm-ingrid"]);
});

await at(77, 30, "members join with the invite link", async () => {
  const workspace = await data.getWorkspace(tenantId, marisol);
  const code = workspace.invite?.code;
  if (!code) refuse("The community has no invite code.");
  for (const entry of PEOPLE.slice(1)) await data.joinWithInvite(tenantId, code, person(entry.key));
});

await at(76, 74, "June becomes an admin, Priya a moderator", async () => {
  await run("marisol", { type: "member.role", uid: "rm-june", role: "admin" });
  await run("marisol", { type: "member.role", uid: "rm-priya", role: "moderator" });
});

await at(76, 28, "profiles and handles", async () => {
  for (const entry of PEOPLE) {
    if (entry.handle) await run(entry.key, { type: "profile.handle", handle: entry.handle });
    await run(entry.key, { type: "profile.update", displayName: entry.name, headline: entry.headline, bio: entry.bio });
  }
});

const posts = {};
const post = async (key, author, space, title, body, event = null) => {
  posts[key] = (await run(author, { type: "post.create", spaceId: spaces[space], title, body, event })).id;
};
const reply = (author, postKey, body) => run(author, { type: "comment.create", postId: posts[postKey], body });
const react = async (postKey, reaction, keys) => {
  for (const key of keys) await run(key, { type: "reaction.toggle", postId: posts[postKey], reaction });
};

await at(75, 60, "welcome and introductions", async () => {
  await post("welcome", "marisol", "announcements", "Welcome to Riverside Makers 👋", "This is our home between workshop nights. Introduce yourself in Introductions, show your work in Show & tell, and ask anything in Help & advice.\n\nHouse rules are simple: be generous with what you know, and kind about what others don't know yet.");
  await run("marisol", { type: "post.moderate", postId: posts.welcome, operation: "pin" });
  await post("intro-oliver", "oliver", "intros", "Forty years of sash windows, now retired", "Hello all. Joiner by trade, retired last spring and already missing the smell of sawdust. Happy to help anyone with hand tools.");
  await reply("tomas", "intro-oliver", "Welcome Oliver! I might take you up on that, my dovetails are a crime scene.");
  await post("intro-mei", "mei", "intros", "Hi from a bookbinder", "I make notebooks with exposed spines. Would love to try leather covers, @leila I've seen your bags 😍");
  await reply("leila", "intro-mei", "Let's swap! I'll teach you saddle stitch if you show me Coptic.");
  await react("welcome", "like", ["june", "priya", "tomas", "kofi", "ingrid", "sam", "oliver", "mei", "ade"]);
  await react("intro-oliver", "celebrate", ["marisol", "priya", "june", "sam"]);
});

await at(50, 20, "show & tell and help threads", async () => {
  await post("bowl", "tomas", "show", "First bowl off the lathe!", "Sycamore, about 20cm across. @priya your sharpening tip saved me: I'd been taking way too much off the bevel.");
  await reply("priya", "bowl", "That grain! Lovely clean finish on the inside too.");
  await reply("oliver", "bowl", "Lovely form. Next one, try leaving the foot a touch wider.");
  await react("bowl", "celebrate", ["priya", "marisol", "kofi", "mei", "june", "ade", "rachel", "ana-lima"]);
  await react("bowl", "like", ["oliver", "sam", "ingrid"]);
  await post("glaze", "kofi", "help", "Crawling glaze on my last firing", "Half of my bowls came out with bare patches where the glaze pulled back. Dusty bisque? Applied too thick? Photos in the thread.");
  await reply("ingrid", "glaze", "Had the same thing. Wiping the bisque with a damp sponge first fixed it for me.");
  await reply("marisol", "glaze", "Also check the kiln shelf isn't shedding. @june can we add this to the firing day checklist?");
  await reply("june", "glaze", "Added! I'll bring it up at the next firing day.");
  await react("glaze", "insightful", ["ingrid", "marisol", "tomas", "rachel"]);
  await post("hinge", "sam", "show", "Forged strap hinges for a garden gate", "Three evenings, a lot of scale, and only one burnt glove. Mild steel finished with beeswax.");
  await react("hinge", "celebrate", ["oliver", "tomas", "marisol", "ade", "priya"]);
  await reply("oliver", "hinge", "Proper job. The taper on those straps is spot on.");
});

await at(19, 15, "a lease update for founding members, and a spam post that gets reported", async () => {
  await post("founders-note", "marisol", "founders", "Lease renewal: thank you", "We signed another two years on the unit. Thank you for keeping your memberships going through the winter.");
  await reply("oliver", "founders-note", "Brilliant news, well done Marisol.");
  await post("spam", "felix", "show", "Cheap tools!!! Best prices", "Visit my shop for 80% off all tools, link in bio. Limited offer!!!");
  await run("priya", { type: "post.report", postId: posts.spam, reason: "Spam: advertising an unrelated shop" });
  await run("oliver", { type: "post.report", postId: posts.spam, reason: "Looks like an ad" });
});

await at(14, 2, "recent conversations", async () => {
  await post("loom", "ingrid", "show", "Scarf woven with walnut-dyed wool", "The walnut hulls from @tomas's tree gave the most beautiful brown. Twill, 2/2, about 180cm long.");
  await reply("tomas", "loom", "So glad those hulls found a use! It's gorgeous.");
  await react("loom", "celebrate", ["tomas", "marisol", "mei", "leila", "june", "zara"]);
  await post("chisels", "zara", "help", "Which chisel should I sharpen first?", "I just bought my first set of six. Is there one size I should learn on? Every video says something different 😅");
  await reply("oliver", "chisels", "Start with the 12mm. It's the one you'll reach for most, and it's forgiving to sharpen.");
  await reply("priya", "chisels", "Agree with Oliver. And bring them to workshop night, @zara, we'll sharpen together.");
  await reply("zara", "chisels", "Thank you both! See you Thursday.");
  await react("chisels", "like", ["priya", "oliver", "marisol"]);
  await post("press", "rachel", "show", "New linocut: the river at dawn", "Four colours, reduction cut, edition of 12. The Adana is still going strong at 70.");
  await react("press", "celebrate", ["marisol", "mei", "june", "kofi"]);
  await reply("marisol", "press", "We need one of these for the workshop wall. Can I buy number 1?");
});

await at(12, 4, "events planned and RSVPs", async () => {
  await post("open-night", "june", "events", "Open workshop night", "Benches, tools and tea. Bring a project or just come and see what everyone's working on. Beginners very welcome.", { startsAt: inDays(4, 18, 30), endsAt: inDays(4, 21, 30), location: "Unit 4, Riverside Yard" });
  await post("spoons", "tomas", "events", "Spoon carving morning", "We'll carve a cooking spoon from green birch with axes and knives. All tools provided; 8 places.", { startsAt: inDays(9, 10, 0), endsAt: inDays(9, 13, 0), location: "Unit 4, Riverside Yard" });
  await post("firing", "kofi", "events", "Kiln firing day", "Bisque and glaze firing. Bring pieces by noon; they'll be ready to collect Sunday.", { startsAt: inDays(16, 12, 0), endsAt: inDays(16, 18, 0), location: "Kiln shed" });
  for (const key of ["marisol", "priya", "tomas", "zara", "oliver", "kofi", "mei", "ade", "sam", "rachel", "leila"]) await run(key, { type: "rsvp.set", postId: posts["open-night"], status: "going" });
  for (const key of ["ingrid", "noah"]) await run(key, { type: "rsvp.set", postId: posts["open-night"], status: "maybe" });
  for (const key of ["zara", "mei", "ana-lima", "june", "oliver"]) await run(key, { type: "rsvp.set", postId: posts.spoons, status: "going" });
  for (const key of ["kofi", "ingrid", "rachel"]) await run(key, { type: "rsvp.set", postId: posts.firing, status: "going" });
});

await at(3, 2.9, "Marisol catches up on her inbox", () => run("marisol", { type: "notifications.read" }));

await at(2, 0.05, "the last day", async () => {
  await reply("mei", "welcome", "Can't believe I only found this place last month. Thank you @marisol!");
  await reply("ade", "bowl", "@tomas would you do a demo at the next open night? I'd love to see the lathe in action.");
  await reply("tomas", "bowl", "Happy to! @marisol can we book the lathe corner?");
  await reply("leila", "press", "@marisol I'll make a leather portfolio for the print if it's going on the wall 🙌");
  await post("thanks", "zara", "intros", "Hello from a very new woodworker", "Joined last week after walking past the open door. Everyone has been so welcoming. Currently making a very wonky box.");
  await react("thanks", "celebrate", ["marisol", "priya", "oliver", "june", "tomas", "ingrid"]);
  await reply("marisol", "thanks", "Wonky boxes are the best kind. Welcome, Zara!");
});

await at(60, 55, "membership plan and course", async () => {
  const plan = await run("marisol", { type: "plan.create", name: "Founding member", description: "Supports the workshop lease and opens the Founding members space.", priceLabel: "$8 / month", spaceIds: [spaces.founders] });
  for (const key of ["priya", "oliver", "ingrid"]) await run("marisol", { type: "entitlement.grant", planId: plan.id, uid: `rm-${key}`, reason: "Founding member since 2019" });
  const course = await run("marisol", { type: "course.create", spaceId: spaces.help, title: "Joinery basics", description: "Four short lessons, from marking out to your first dovetail." });
  const lessons = [
    ["Marking out", "A sharp pencil, a marking gauge and a square. Mark from one reference face only."],
    ["Sawing to a line", "Let the saw do the work. Start on the waste side and watch the line, not the saw."],
    ["Chopping with a chisel", "Chop straight down, then pare to the line in thin shavings."],
    ["Your first dovetail", "Tails first. Transfer them to the pins with a knife, not a pencil."],
  ];
  for (const [title, body] of lessons) await run("marisol", { type: "lesson.add", courseId: course.id, title, body });
});

await at(1, 0.5, "the spring weaving teacher invited as a moderator (no account yet)", () =>
  team.createInvitation(P, tenantId, marisol, { email: `harper@${DOMAIN}`, role: "moderator" }, (token) => `http://localhost/apps/community/invite/${token}`));

const counter = await remapTree(db.collection("products").doc(P));
console.log(`  ✓ history spread over the last eleven weeks (${counter.count} documents)`);

console.log(`
Riverside Makers is ready (fictional demo data, emulators only).
  community: ${tenantId}
  sign in:   marisol@${DOMAIN} (owner), priya@${DOMAIN} (moderator) or zara@${DOMAIN} (member)
             password: DEMO_PASSWORD in this script
`);
process.exit(0);
