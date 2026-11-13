#!/usr/bin/env node
/**
 * Seeds a FICTIONAL school, "Saltmarsh Painting School", into LOCAL Firebase emulators for demos
 * and product screenshots of Creator.
 *
 * It never touches a real project: it refuses to run unless both emulator hosts are set and the
 * project id starts with "demo-" (see scripts/demo-seed-emulator-kit.mjs). It drives the real
 * server data layer (src/lib/creator/*, src/lib/fleet/platform/*), so every record, invitation
 * and audit event is written exactly as the product writes it, and then spreads the history over
 * the last ten weeks. Every person, email (on the reserved `.example` domain) and course is made
 * up. The profile photos in scripts/demo-assets/saltmarsh-faces are AI-generated (FLUX.2 klein,
 * run locally) and depict no real person; they are uploaded through the real photo path. Only
 * Creator's emulator data and this seed's own accounts are replaced on each run.
 *
 * Usage (with the Auth and Firestore emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin-brands \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8284 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9284 \
 *   node scripts/seed-demo-creator.mjs
 *
 * Then run `next dev` with the same three variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID and
 * NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (src/lib/firebase/emulators.ts), and sign in as
 * ines@saltmarsh-studio.example with DEMO_PASSWORD below (valid on the emulator only).
 */
import { existsSync, readFileSync } from "node:fs";

import { gateEmulators, registerSourceLoader, seededRandom, timeline, wipeProduct } from "./demo-seed-emulator-kit.mjs";

const { projectId, refuse } = await gateEmulators("seed-demo-creator");
registerSourceLoader();

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "saltmarsh-emulator-only";
const STUDIO = "saltmarsh-studio.example";

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const store = await import("@/lib/creator/store");
const { CREATOR_SLUG: P } = await import("@/lib/creator/model");
const { createTenant } = await import("@/lib/fleet/platform/tenants");
const team = await import("@/lib/fleet/platform/team");
const profiles = await import("@/lib/fleet/platform/profiles");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
const auth = getAdminAuth();
if (!db || !auth) refuse("The Admin SDK did not initialize in emulator mode.");
const random = seededRandom(20261113);

// ---------------------------------------------------------------------------
// The fictional school
// ---------------------------------------------------------------------------

const TEAM = [
  { key: "ines", name: "Inès Moreau", title: "Painter and founder", role: "owner" },
  { key: "theo", name: "Theo Brandt", title: "Studio manager", role: "admin" },
  { key: "amara", name: "Amara Okoye", title: "Course producer", role: "member" },
  { key: "lucas", name: "Lucas Meyer", title: "Bookkeeper", role: "viewer" },
].map((person) => ({ ...person, uid: `sm-${person.key}`, email: `${person.key}@${STUDIO}` }));

/** Learners. Leo, Oscar and Will never uploaded a photo (no file in demo-assets), so they show initials. */
const LEARNER_NAMES = [
  ["ana", "Ana Sousa"],
  ["ben", "Ben Whitaker"],
  ["chloe", "Chloé Martin"],
  ["daniel", "Daniel Kim"],
  ["elif", "Elif Yılmaz"],
  ["femi", "Femi Adeyemi"],
  ["grace", "Grace Liu"],
  ["hugo", "Hugo Lindqvist"],
  ["isla", "Isla Morgan"],
  ["jonah", "Jonah Reyes"],
  ["kaia", "Kaia Nakamura"],
  ["leo", "Leo Brennan"],
  ["maya", "Maya Patel"],
  ["noor", "Noor Haddad"],
  ["oscar", "Oscar Novak"],
  ["rosa", "Rosa Delgado"],
  ["sami", "Sami Virtanen"],
  ["tess", "Tess O'Connor"],
  ["uma", "Uma Iyer"],
  ["will", "Will Thornton"],
  ["yara", "Yara Costa"],
  ["zoe", "Zoë Fischer"],
];
const LEARNERS = LEARNER_NAMES.map(([key, name]) => ({
  key,
  name,
  uid: `sm-learner-${key}`,
  email: `${name.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}@learners.example`,
}));
const EVERYONE = [...TEAM, ...LEARNERS];
const person = (key) => {
  const found = EVERYONE.find((entry) => entry.key === key);
  if (!found) throw new Error(`Unknown person ${key}`);
  return { uid: found.uid, email: found.email, name: found.name, emailVerified: true };
};

let ids = 0;
const id = (prefix) => `${prefix}_seed${(ids += 1).toString(36).padStart(3, "0")}`;
const quiz = (passPercent, questions) => ({
  passPercent,
  questions: questions.map(([prompt, options, correctIndex]) => ({ id: id("q"), prompt, options, correctIndex })),
});
const lesson = (title, body, extra = {}) => ({ id: id("les"), title, body, videoUrl: "", dripDays: 0, quiz: null, ...extra });

const WATERCOLOUR = {
  title: "Watercolour Basics",
  subtitle: "Loose, luminous paintings from your first week, even if you've never held a brush.",
  description: [
    "Watercolour has a reputation for being unforgiving. It isn't: it just rewards a few habits nobody tells you about.",
    "",
    "Over six lessons you'll learn to control water, mix clean colour and build a painting in layers, finishing with a small landscape you'll want to frame.",
    "",
    "**You'll need:** a round brush (size 8 or 10), three tubes of paint (a warm yellow, a cool red and a blue), and 300 gsm cold-press paper.",
  ].join("\n"),
  pricing: { type: "free" },
  modules: [
    {
      id: id("mod"),
      title: "Getting started",
      lessons: [
        lesson("Welcome and supplies", "# Welcome!\nThis course is short on theory and long on painting. Each lesson ends with a small exercise; do it before you move on.\n\n## What to buy\n- One round brush, size 8 or 10\n- Three colours: a warm yellow, a cool red, a blue\n- Cold-press paper, 300 gsm\n- Two jars of water: one to rinse, one to stay clean\n\nThat's it. Skip the 48-colour set for now; three colours teach you more."),
        lesson("Your first wash", "# The flat wash\nTilt your board slightly. Load the brush until it's heavy, then pull a line across the top of the paper. Let the bead of paint gather at the bottom of the stroke and pick it up with the next one.\n\n- Keep the brush loaded: a dry brush leaves streaks\n- Work quickly but don't scrub\n- Let it dry completely before you judge it\n\n**Exercise:** paint three flat washes, one per colour."),
        lesson("Mixing colours", "# Three colours, every colour\nMost muddy paintings come from mixing too many pigments. With a warm yellow, a cool red and a blue you can reach greens, oranges and violets that stay bright.\n\nMix on the palette, test on scrap paper, and remember the colour dries lighter than it looks wet.", {
          quiz: quiz(70, [
            ["Which two colours make the cleanest green with this palette?", ["Warm yellow and blue", "Cool red and blue", "Warm yellow and cool red"], 0],
            ["Why does watercolour look different once it dries?", ["It dries lighter", "It dries darker", "It doesn't change"], 0],
            ["What usually makes a mix muddy?", ["Too many pigments", "Too much water", "Thick paper"], 0],
          ]),
        }),
      ],
    },
    {
      id: id("mod"),
      title: "Light and shadow",
      lessons: [
        lesson("Painting skies", "# Wet-in-wet skies\nWet the sky area with clean water first, then drop colour in and let it spread. The paper does the blending for you.\n\nLeave gaps of white paper for clouds: you can't add white back later.", { dripDays: 7 }),
        lesson("Layering glazes", "# Glazing\nA glaze is a thin transparent layer over dry paint. Each layer deepens the shadow without hiding what's underneath.\n\n1. Let the first layer dry completely\n2. Mix a thin wash of your shadow colour\n3. Paint once, confidently, and leave it", { dripDays: 10 }),
        lesson("Your final piece", "# Put it together\nPaint a small landscape: a wet-in-wet sky, a flat wash for the ground, and two glazes for the shadows. Share it in the discussion below; we'd love to see it.", {
          dripDays: 14,
          quiz: quiz(70, [
            ["When should you add a glaze?", ["When the layer below is completely dry", "While the paper is still wet", "Before the first wash"], 0],
            ["How do you keep white in a watercolour?", ["Leave the paper unpainted", "Paint white on top", "Use more water"], 0],
          ]),
        }),
      ],
    },
  ],
};

const PAINTING_LIGHT = {
  title: "Painting Light: Skies & Water",
  subtitle: "Reflections, sunsets and moving water in nine guided paintings.",
  description: "For painters who've finished the basics. We'll paint the hardest subjects in watercolour, light on water and the sky at dusk, one step at a time.",
  pricing: { type: "paid", amountCents: 8900, currency: "USD" },
  modules: [
    { id: id("mod"), title: "Reading the light", lessons: [lesson("Warm light, cool shadows", "Light and shadow are colour temperature, not just value."), lesson("Value studies in three tones", "Before colour, three tones: light, middle, dark."), lesson("Painting backlit clouds", "Edges glow when the light is behind them.")] },
    { id: id("mod"), title: "Water", lessons: [lesson("Still reflections", "Reflections are slightly darker than what they reflect."), lesson("Moving water", "Broken reflections, painted with the side of the brush."), lesson("Waves and foam", "Save your whites with masking fluid or careful edges.")] },
    { id: id("mod"), title: "Dusk", lessons: [lesson("A sunset sky", "Graded washes from warm to cool."), lesson("Silhouettes", "Dark shapes against a glowing sky."), lesson("Harbour at dusk", "Everything together, in one painting.")] },
  ],
};

const BOTANICAL = {
  title: "Botanical Sketchbook",
  subtitle: "Draw and paint the plants on your windowsill, one page a day.",
  description: "A gentle course in observation. Five short sessions on leaves, stems, petals and colour notes, built for busy weeks.",
  pricing: { type: "free" },
  modules: [
    { id: id("mod"), title: "Looking closely", lessons: [lesson("Contour drawing a leaf", "Draw slowly, without lifting your pencil."), lesson("Stems, joints and veins", "Plants are built from simple repeated shapes.")] },
    { id: id("mod"), title: "Adding colour", lessons: [lesson("Colour notes in the field", "Swatch the colours you see before you paint them."), lesson("Petals in two layers", "A light first layer, a darker second."), lesson("A finished page", "Composition for a sketchbook spread.", { quiz: quiz(60, [["What should you swatch before painting a petal?", ["The colours you see", "Every colour you own", "Only greens"], 0]]) })] },
  ],
};

const PLEIN_AIR = {
  title: "Plein Air Weekends",
  subtitle: "Pack light and paint outdoors in under an hour.",
  description: "A short course for painting on location.",
  pricing: { type: "free" },
  modules: [{ id: id("mod"), title: "Getting outside", lessons: [lesson("The minimal kit", "Everything fits in a small bag."), lesson("Choosing a view", "Find a simple shape and a clear light.")] }],
};

const COMMENTS = [
  ["chloe", "Your first wash", "My first attempt was very streaky, the second one is so much better. Loading the brush more really is the trick!"],
  ["daniel", "Your first wash", "Is it normal for the paper to buckle a bit? I'm on 300 gsm."],
  ["ines", "Your first wash", "Totally normal, Daniel. Tape the edges down to a board before you start and it'll dry flat."],
  ["grace", "Mixing colours", "I didn't believe three colours would be enough. My greens have never looked this fresh."],
  ["elif", "Mixing colours", "Tip for others: mix more than you think you need. Re-mixing the same colour halfway through is hard."],
  ["kaia", "Painting skies", "Wet-in-wet feels like magic. I lost my white clouds the first time though 😅"],
  ["ana", "Painting skies", "Same! Lifting some paint with a dry tissue saved mine."],
  ["isla", "Welcome and supplies", "Can I use a synthetic brush or does it need to be sable?"],
  ["amara", "Welcome and supplies", "Synthetic is perfect for this course, Isla. Look for one that comes to a sharp point when wet."],
  ["jonah", "Layering glazes", "Waiting for each layer to dry is the hardest part of this whole course."],
  ["ben", "Your first wash", "Buy my course on oil painting at the link in my profile!!"],
  ["noor", "Contour drawing a leaf", "Drawing without lifting the pencil made me look so much harder at the leaf. Loved this."],
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`Seeding Saltmarsh Painting School (fictional) into emulators for ${projectId}…`);
await wipeProduct(db, auth, P, EVERYONE.map((entry) => entry.uid));
const { at, remapTree, daysAgo } = timeline(Timestamp);

for (const entry of EVERYONE) {
  await auth.createUser({ uid: entry.uid, email: entry.email, password: DEMO_PASSWORD, displayName: entry.name, emailVerified: true });
  const user = person(entry.key);
  await profiles.syncProfileFromSession(P, user);
  // Most people uploaded a photo; a few never did, so they show initials.
  const photo = new URL(`./demo-assets/saltmarsh-faces/${entry.key}.webp`, import.meta.url);
  if (existsSync(photo)) await profiles.setUploadedPhoto(P, user, new Uint8Array(readFileSync(photo)));
  if (entry.title) await profiles.updateAccountProfile(P, user, { name: entry.name, title: entry.title });
}
console.log(`  ✓ ${EVERYONE.length} emulator accounts with profile photos`);

const ines = person("ines");
const school = await at(72, 72, "school created by Inès Moreau", () => createTenant(P, ines, "Saltmarsh Painting School"));
const tenantId = school.id;

await at(71, 66, "team invited and joined", async () => {
  for (const member of TEAM.filter((entry) => entry.role !== "owner")) {
    const created = await team.createInvitation(P, tenantId, ines, { email: member.email, role: member.role }, (token) => `http://localhost/apps/creator/invite/${token}`);
    const token = decodeURIComponent(created.inviteUrl.split("/invite/")[1]);
    await team.acceptInvitationByToken(P, person(member.key), token);
  }
});

const courseIds = {};
const slugs = {};
async function build(key, actorKey, input) {
  const course = await store.createCourse(tenantId, person(actorKey), input.title);
  await store.updateCourse(tenantId, person(actorKey), course.id, input);
  courseIds[key] = course.id;
  slugs[key] = course.slug;
}

await at(65, 58, "Watercolour Basics and Botanical Sketchbook built and published", async () => {
  await build("watercolour", "ines", WATERCOLOUR);
  await build("botanical", "amara", BOTANICAL);
  await store.transitionCourse(tenantId, ines, courseIds.watercolour, "published");
  await store.transitionCourse(tenantId, person("theo"), courseIds.botanical, "published");
});

await at(46, 40, "Painting Light built and published (paid)", async () => {
  await build("light", "ines", PAINTING_LIGHT);
  await store.transitionCourse(tenantId, ines, courseIds.light, "published");
});

/** Each learner, the courses they take, and how far they get (fraction of lessons). */
const JOURNEYS = [
  ["ana", "watercolour", 1, 57], ["ben", "watercolour", 0.34, 55], ["chloe", "watercolour", 1, 54], ["daniel", "watercolour", 0.67, 50],
  ["elif", "watercolour", 1, 48], ["femi", "watercolour", 0.5, 44], ["grace", "watercolour", 0.84, 41], ["hugo", "watercolour", 0.17, 37],
  ["isla", "watercolour", 0.67, 33], ["jonah", "watercolour", 1, 30], ["kaia", "watercolour", 0.5, 26], ["leo", "watercolour", 0.17, 21],
  ["maya", "watercolour", 0.34, 16], ["noor", "watercolour", 0.17, 12], ["oscar", "watercolour", 0, 8], ["rosa", "watercolour", 0.34, 5],
  ["sami", "watercolour", 0.17, 3], ["tess", "watercolour", 0, 1],
  ["noor", "botanical", 1, 52], ["grace", "botanical", 0.6, 47], ["uma", "botanical", 0.8, 39], ["will", "botanical", 0.4, 28],
  ["yara", "botanical", 0.2, 19], ["zoe", "botanical", 1, 15], ["isla", "botanical", 0.4, 9], ["chloe", "botanical", 0.2, 4],
];

await at(58, 1, `${JOURNEYS.length} enrollments`, async () => {
  for (const [key, course, , enrolledDaysAgo] of JOURNEYS) {
    const learner = person(key);
    const { id: enrollmentId } = await store.enroll(tenantId, slugs[course], learner);
    // The learner joined `enrolledDaysAgo` days ago: drip schedules count from here.
    const enrolledAt = daysAgo(enrolledDaysAgo);
    await db.doc(`products/${P}/tenants/${tenantId}/enrollments/${enrollmentId}`).update({ enrolledAt });
    await db.doc(`products/${P}/learners/${learner.uid}/enrollments/${tenantId}_${courseIds[course]}`).update({ enrolledAt });
  }
});

await at(40, 32, "Theo enrolls the spring workshop group in Painting Light", async () => {
  const emails = ["ana", "elif", "jonah", "chloe", "kaia"].map((key) => person(key).email);
  await store.bulkEnroll(tenantId, person("theo"), courseIds.light, emails, async (email) => {
    const account = await auth.getUserByEmail(email).catch(() => null);
    return account ? { uid: account.uid, email: account.email ?? email, name: account.displayName ?? "" } : null;
  });
  for (const [index, key] of ["ana", "elif", "jonah", "chloe", "kaia"].entries()) {
    const enrolledAt = daysAgo(38 - index);
    await db.doc(`products/${P}/tenants/${tenantId}/enrollments/${courseIds.light}_${person(key).uid}`).update({ enrolledAt });
  }
});

const COURSES = { watercolour: WATERCOLOUR, botanical: BOTANICAL, light: PAINTING_LIGHT };
await at(55, 1, "lessons completed and quizzes taken", async () => {
  const journeys = [...JOURNEYS, ["ana", "light", 0.67], ["elif", "light", 0.34], ["jonah", "light", 0.45], ["chloe", "light", 0.12], ["kaia", "light", 0.12]];
  for (const [key, course, share] of journeys) {
    const lessons = COURSES[course].modules.flatMap((courseModule) => courseModule.lessons);
    const done = Math.round(lessons.length * share);
    for (const entry of lessons.slice(0, done)) {
      if (entry.quiz) {
        // Most people pass; a few miss one answer and try again.
        const stumble = random() < 0.3;
        const answers = Object.fromEntries(entry.quiz.questions.map((question, index) => [question.id, stumble && index === 0 ? (question.correctIndex + 1) % question.options.length : question.correctIndex]));
        await store.submitQuiz(tenantId, slugs[course], person(key), entry.id, answers);
        if (stumble && random() < 0.6) {
          await store.submitQuiz(tenantId, slugs[course], person(key), entry.id, Object.fromEntries(entry.quiz.questions.map((question) => [question.id, question.correctIndex])));
        }
      }
      await store.setLessonProgress(tenantId, slugs[course], person(key), entry.id, true);
    }
  }
});

const commentIds = [];
await at(30, 0.05, "lesson discussions", async () => {
  const all = [...WATERCOLOUR.modules, ...BOTANICAL.modules].flatMap((courseModule) => courseModule.lessons);
  for (const [key, lessonTitle, body] of COMMENTS) {
    const target = all.find((entry) => entry.title === lessonTitle);
    const course = WATERCOLOUR.modules.some((courseModule) => courseModule.lessons.includes(target)) ? "watercolour" : "botanical";
    // Instructors reply from their own enrollment-free seat: the API lets learners comment, so the
    // team joins the course as learners do.
    if (TEAM.some((entry) => entry.key === key)) await store.enroll(tenantId, slugs[course], person(key)).catch(() => undefined);
    const comment = await store.addLessonComment(tenantId, slugs[course], person(key), target.id, body);
    commentIds.push([key, comment.id]);
  }
});

await at(45, 2, "email list sign-ups", async () => {
  const visitors = ["harper.quinn", "milo.grant", "sofia.reyes", "aiden.cho", "lena.vogel", "ravi.nair", "june.park", "omar.saleh", "ivy.chen", "felix.roth", "nina.berg", "theo.marsh"];
  for (const [index, visitor] of visitors.entries()) {
    await store.captureLead(tenantId, index % 3 === 0 ? slugs.watercolour : slugs.light, `${visitor}@visitors.example`);
  }
});

await at(9, 8, "Plein Air Weekends drafted", () => build("plein", "amara", PLEIN_AIR));

await at(2, 1.5, "a spam comment hidden by Amara", async () => {
  const spam = commentIds.find(([key]) => key === "ben");
  if (spam) await store.setCommentHidden(tenantId, person("amara"), spam[1], true);
});

await at(1, 0.5, "Hannah invited as an editor (no account yet)", () =>
  team.createInvitation(P, tenantId, ines, { email: `hannah@${STUDIO}`, role: "member" }, (token) => `http://localhost/apps/creator/invite/${token}`));

// Team seats used to post in discussions are not learners: remove their enrollments again.
for (const member of TEAM) {
  for (const course of ["watercolour", "botanical"]) {
    await db.doc(`products/${P}/tenants/${tenantId}/enrollments/${courseIds[course]}_${member.uid}`).delete();
    await db.doc(`products/${P}/learners/${member.uid}/enrollments/${tenantId}_${courseIds[course]}`).delete();
  }
}

const counter = await remapTree(db.collection("products").doc(P));
console.log(`  ✓ history spread over the last ten weeks (${counter.count} documents)`);

console.log(`
Saltmarsh Painting School is ready (fictional demo data, emulators only).
  school:    ${tenantId}
  catalog:   /apps/creator/s/${tenantId}
  sign in:   ines@${STUDIO} (owner) or ana@learners.example (a learner); password: DEMO_PASSWORD in this script
`);
process.exit(0);
