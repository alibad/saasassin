#!/usr/bin/env node
/**
 * Seeds a FICTIONAL design studio, "Fernhill Studio" (5 people), and a believable shared mailbox
 * into LOCAL Firebase emulators for demos, screenshots and recordings of Mail.
 *
 * Same fence as scripts/seed-demo-performance.mjs (see scripts/demo-seed-kit.mjs): it refuses to
 * run unless FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are both set and
 * FIREBASE_PROJECT_ID starts with "demo-", drops real credentials, and WIPES the demo project's
 * emulator data first.
 *
 * Mail goes in the way a person's would: raw RFC 822 messages through Mail's own importer
 * (src/lib/mail/store.ts → importRawMessages), then triage, splits, filters, snippets and drafts
 * through src/lib/mail/service.ts, so every record and audit event is real. Message dates are
 * relative to the moment you run it. Every person, company, address (reserved `.example`
 * domains) and message is made up; the portraits in scripts/demo-people/ were generated locally
 * and show no real person. People outside the studio have no account, so they show initials.
 *
 * Usage (with the Auth and Firestore emulators running):
 *   FIREBASE_PROJECT_ID=demo-saasassin-mail \
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8283 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9283 \
 *   node scripts/seed-demo-mail.mjs
 *
 * Then run `next dev` with the same three variables plus NEXT_PUBLIC_FIREBASE_PROJECT_ID (same
 * demo- id) and NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST (see src/lib/firebase/emulators.ts), open
 * /apps/mail/sign-in and sign in as elena.vasquez@fernhill.example with DEMO_PASSWORD below.
 */
import { assertEmulatorsReachable, guardEmulators, portrait, registerSourceLoader, wipeEmulators } from "./demo-seed-kit.mjs";

const env = guardEmulators("seed-demo-mail");
await assertEmulatorsReachable(env);
registerSourceLoader();

/** Emulator-only password for every seeded account. Never valid anywhere else. */
export const DEMO_PASSWORD = "fernhill-emulator-only";
const DOMAIN = "fernhill.example";
const PRODUCT = "mail";

const { getAdminAuth, getAdminDb } = await import("@/lib/firebase/admin");
const service = await import("@/lib/mail/service");
const store = await import("@/lib/mail/store");
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

const TEAM = [
  { key: "elena", name: "Elena Vasquez", title: "Founder & Creative Director", role: "owner" },
  { key: "tom", name: "Tom Fischer", title: "Account Director", role: "admin" },
  { key: "aisha", name: "Aisha Rahman", title: "Project Manager", role: "member" },
  { key: "marcus", name: "Marcus Lee", title: "Senior Designer", role: "member" },
  { key: "noor", name: "Noor Haddad", title: "Studio Operations", role: "viewer" },
].map((person) => ({ ...person, email: `${person.name.split(" ")[0].toLowerCase()}.${person.name.split(" ")[1].toLowerCase()}@${DOMAIN}`, uid: "" }));

const member = (key) => TEAM.find((person) => person.key === key);
const actor = (key) => ({ uid: member(key).uid, email: member(key).email, name: member(key).name, emailVerified: true });

// People outside the studio: clients and vendors with no account here (initials only).
const EXTERNAL = {
  hana: { name: "Hana Okoye", email: "hana@brightwatercoffee.example" },
  felix: { name: "Felix Brandt", email: "felix.brandt@brightwatercoffee.example" },
  priya: { name: "Priya Shah", email: "priya.shah@northgatehealth.example" },
  owen: { name: "Owen Gallagher", email: "owen@paperlane.example" },
  lena: { name: "Lena Morales", email: "lena@kiln-and-co.example" },
  sam: { name: "Sam Whitaker", email: "sam@harbourfilms.example" },
  brief: { name: "The Design Brief", email: "weekly@thedesignbrief.example" },
  type: { name: "Typeset Weekly", email: "hello@typesetweekly.example" },
  billing: { name: "Cloudframe Billing", email: "billing@cloudframe.example" },
  venue: { name: "Lakeside Lodge", email: "bookings@lakesidelodge.example" },
};

const who = (key) => member(key) ?? EXTERNAL[key];
const address = (key) => `${who(key).name} <${who(key).email}>`;

// ---------------------------------------------------------------------------
// The mailbox: conversations, oldest first within each thread.
// `ago` is hours before now; `unread` leaves the thread unread for Elena.
// ---------------------------------------------------------------------------

const NOW = Date.now();
const hoursAgo = (hours) => new Date(NOW - hours * 3_600_000);
let counter = 0;
const messageId = (key) => `<${key}.${(counter += 1)}.${NOW.toString(36)}@${who(key).email.split("@")[1]}>`;

const CONVERSATIONS = [
  {
    key: "brightwater-kickoff",
    subject: "Brightwater rebrand: notes from Tuesday's workshop",
    labels: ["Brightwater"],
    star: true,
    messages: [
      { from: "hana", to: ["elena"], cc: ["felix"], ago: 30, body: "Hi Elena,\n\nThank you again for Tuesday. The whole team left the workshop buzzing. Felix pulled together our notes; the short version is that we want the new identity to feel like the roastery, not the cafés: warm, a little industrial, and honest about where the beans come from.\n\nCould you share a rough timeline for the first round of concepts? Our board meets on the 3rd and I'd love to show direction by then.\n\nWarmly,\nHana" },
      { from: "elena", to: ["hana"], cc: ["felix", "aisha"], ago: 26, body: "Hi Hana,\n\nIt was a great session. Thank you for opening the roastery to us.\n\nAisha will send the full plan tomorrow, but you'll have three concept territories by the 28th, which leaves a week before your board meeting.\n\nBest,\nElena" },
      { from: "aisha", to: ["hana"], cc: ["elena", "felix"], ago: 4, unread: true, body: "Hi Hana and Felix,\n\nAs promised, here's the plan for the first round:\n\n  • Nov 20: moodboards for three territories (Roastery, Origin, Ritual)\n  • Nov 25: logo sketches and type pairings\n  • Nov 28: concept presentation, 90 minutes, at your office\n\nI've put a hold in your calendars for the 28th. Let me know if Thursday afternoon works for the wider team.\n\nThanks,\nAisha" },
    ],
  },
  {
    key: "northgate-feedback",
    subject: "Northgate homepage: feedback on round two",
    labels: ["Northgate"],
    messages: [
      { from: "priya", to: ["elena"], cc: ["tom"], ago: 2.2, unread: true, body: "Hi Elena,\n\nWe reviewed round two with our clinical team this morning. Overall: big step forward. Three things:\n\n1. The appointment button needs to be visible without scrolling on mobile.\n2. Can we soften the photography? A couple of the images feel clinical in the wrong way.\n3. Legal asked us to move the accessibility statement into the footer.\n\nHappy to jump on a call Thursday if that's easier.\n\nPriya" },
    ],
  },
  {
    key: "staging",
    by: "marcus",
    subject: "Harbour Films site is on staging",
    labels: ["Harbour Films"],
    messages: [
      { from: "marcus", to: ["elena"], cc: ["aisha"], ago: 1.1, unread: true, body: "Elena,\n\nThe Harbour Films build is up on staging. Password is in the project notes.\n\nStill to do: the reel page loads slowly on 4G, and Sam wants the credits to scroll like film titles, which I love. I'll have both done by Friday.\n\nCould you give the case-study pages a once-over before I send the link to Sam?\n\nM" },
    ],
  },
  {
    key: "pipeline",
    subject: "Q1 pipeline: three proposals out",
    messages: [
      { from: "tom", to: ["elena"], ago: 6, body: "Quick update before Monday's review:\n\n  • Kiln & Co. packaging, £38k. Lena said yes in principle, contract next week.\n  • Northgate Health phase two, £52k. Waiting on their budget sign-off.\n  • Paperlane annual report, £21k. Owen is comparing us with one other studio.\n\nIf Kiln lands we should talk about a freelance illustrator for January.\n\nTom" },
      { from: "elena", to: ["tom"], ago: 5.5, body: "Great work. Yes to the illustrator conversation. Can you ask Marcus who he'd trust?\n\nE" },
      { from: "tom", to: ["elena"], ago: 0.6, unread: true, body: "Marcus suggested two people. I'll set up intros once Kiln signs." },
    ],
  },
  {
    key: "kiln",
    by: "tom",
    subject: "Re: Kiln & Co. packaging proposal",
    labels: ["Kiln & Co."],
    messages: [
      { from: "lena", to: ["tom"], cc: ["elena"], ago: 20, body: "Hi Tom,\n\nWe've read the proposal twice and we're in. Two small questions before we sign: can the sample run be split across two printers, and is there room to add a gift-box variant later without re-quoting the whole thing?\n\nLena" },
    ],
  },
  {
    key: "invite-brightwater",
    subject: "Invitation: Brightwater concept presentation @ Fri 28 Nov 14:00",
    calendar: true,
    messages: [
      { from: "aisha", to: ["elena", "marcus", "tom"], ago: 3.5, body: "Brightwater concept presentation\nFriday 28 November, 14:00 to 15:30\nBrightwater Roastery, Dock Street\n\nAgenda: territories, logo sketches, type, next steps." },
    ],
  },
  {
    key: "invoice",
    by: "tom",
    subject: "Invoice INV-2026-1142 for November",
    messages: [
      { from: "billing", to: ["elena"], ago: 9, body: "Hello,\n\nYour invoice INV-2026-1142 for €184.00 (Studio plan, 8 seats) is ready. Payment will be taken from the card on file on 1 December.\n\nCloudframe Billing" },
    ],
  },
  {
    key: "paperlane",
    subject: "Annual report: a question about timing",
    messages: [
      { from: "owen", to: ["tom"], cc: ["elena"], ago: 28, body: "Hi Tom,\n\nWe're down to two studios and honestly leaning your way. One question: could you start in the second week of January rather than February? Our printer slot moved.\n\nOwen" },
      { from: "tom", to: ["owen"], cc: ["elena"], ago: 27, body: "Hi Owen,\n\nGood news, January works. Marcus and Aisha can start on the 12th. I'll send a revised timeline today.\n\nTom" },
    ],
  },
  {
    key: "offsite",
    subject: "Studio offsite: rooms are booked",
    messages: [
      { from: "noor", to: ["elena", "tom", "aisha", "marcus"], ago: 22, body: "Hi all,\n\nRooms at the lake house are confirmed for 4–5 December. Trains leave at 08:42; I'll send tickets on Monday. Tell me about any dietary needs by Friday.\n\nNoor" },
      { from: "venue", to: ["noor"], cc: ["elena"], ago: 21, body: "Dear Noor,\n\nThis confirms five rooms for 4–5 December, breakfast and one group dinner included. We look forward to welcoming Fernhill Studio.\n\nLakeside Lodge" },
    ],
  },
  {
    key: "moodboard",
    by: "aisha",
    subject: "Brightwater moodboards: first pass",
    labels: ["Brightwater"],
    messages: [
      { from: "marcus", to: ["elena", "aisha"], ago: 7, body: "First pass at the three territories. Roastery is the strongest. The Origin one is drifting toward travel brochure; I'll pull it back.\n\nComments welcome before tomorrow's crit." },
    ],
  },
  {
    key: "brief",
    subject: "This week: the return of the grid",
    newsletter: "thedesignbrief",
    messages: [{ from: "brief", to: ["elena"], ago: 12, body: "The return of the grid · Five studios on pricing in 2027 · Interview: designing for slow reading\n\nRead online: https://thedesignbrief.example/issues/212" }],
  },
  {
    key: "typeset",
    subject: "New releases: three humanist sans families",
    newsletter: "typesetweekly",
    messages: [{ from: "type", to: ["elena"], ago: 34, body: "Three new humanist sans families, a guide to optical sizes, and a free specimen PDF for subscribers." }],
  },
  {
    key: "northgate-proposal",
    subject: "Northgate phase two: proposal",
    labels: ["Northgate"],
    followUp: true,
    messages: [{ from: "elena", to: ["priya"], cc: ["tom"], ago: 100, body: "Hi Priya,\n\nAttached is our proposal for phase two: patient portal, design system and accessibility audit. Happy to walk your board through it.\n\nBest,\nElena" }],
  },
  {
    key: "harbour-credits",
    by: "marcus",
    subject: "Credits sequence idea",
    labels: ["Harbour Films"],
    archived: true,
    messages: [{ from: "sam", to: ["marcus"], cc: ["elena"], ago: 50, body: "What if the credits on the about page scrolled like the end of a film? Too much?" }],
  },
];

function rawMessage(conversation, message, index, ids) {
  const from = who(message.from);
  const headers = [
    `From: ${address(message.from)}`,
    `To: ${message.to.map(address).join(", ")}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.map(address).join(", ")}`] : []),
    `Subject: ${index === 0 ? conversation.subject : `Re: ${conversation.subject.replace(/^Re: /, "")}`}`,
    `Date: ${hoursAgo(message.ago).toUTCString()}`,
    `Message-ID: ${ids[index]}`,
    ...(index > 0 ? [`In-Reply-To: ${ids[index - 1]}`, `References: ${ids.slice(0, index).join(" ")}`] : []),
    ...(conversation.newsletter
      ? [`List-Id: <${conversation.newsletter}.example>`, `List-Unsubscribe: <https://${from.email.split("@")[1]}/unsubscribe>, <mailto:unsubscribe@${from.email.split("@")[1]}>`]
      : []),
    "MIME-Version: 1.0",
  ];
  if (conversation.calendar) {
    const boundary = `b-${NOW}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      message.body,
      `--${boundary}`,
      "Content-Type: text/calendar; charset=utf-8; method=REQUEST",
      "",
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:brightwater-presentation@fernhill.example\r\nSUMMARY:Brightwater concept presentation\r\nDTSTART:20261128T130000Z\r\nDTEND:20261128T143000Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  return [...headers, "Content-Type: text/plain; charset=utf-8", "", message.body, ""].join("\r\n");
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

await wipeEmulators(env);
console.log("Seeding Fernhill Studio into the Mail emulator (fictional)…");

for (const person of TEAM) {
  const user = await auth.createUser({ email: person.email, password: DEMO_PASSWORD, displayName: person.name, emailVerified: true });
  person.uid = user.uid;
  await updateAccountProfile(PRODUCT, actor(person.key), { name: person.name, title: person.title });
  await setUploadedPhoto(PRODUCT, actor(person.key), await portrait(person.key));
}
console.log(`  ✓ ${TEAM.length} people with profile photos`);

const elena = actor("elena");
const tenant = await createTenant(PRODUCT, elena, "Fernhill Studio");
const tenantId = tenant.id;
for (const person of TEAM.filter((entry) => entry.role !== "owner")) {
  await grantMembership(PRODUCT, tenantId, elena, { uid: person.uid, email: person.email, name: person.name }, person.role);
}
console.log("  ✓ team");

const context = await store.mailMember(tenantId, elena);

// Splits, a filter and snippets first, so imported mail is sorted the way it would be.
await service.loadMailbox(context); // seeds the default Calendar and News splits
await service.createSplit(context, { name: "Receipts", kind: "label", value: "Invoices" });
await service.createFilter(context, {
  name: "Invoices",
  match: "any",
  conditions: [{ field: "subject", value: "invoice" }],
  actions: { label: "Invoices", archive: false, star: false, markRead: false, skipInbox: false },
  enabled: true,
});
await service.createTemplate(context, { name: "Thanks, on it", body: "Thanks for this. I'm on it and will come back to you by end of day tomorrow." });
await service.createTemplate(context, { name: "Intro call", body: "Lovely to hear from you. Would a 30-minute call next week work? Here are a few times that suit us:\n\n• \n• \n• " });
await service.createTemplate(context, { name: "Invoice received", body: "Thank you, invoice received. It's with our operations team and will be paid within 14 days." });
console.log("  ✓ splits, filter and snippets");

const raws = [];
for (const conversation of CONVERSATIONS) {
  const ids = conversation.messages.map((message) => messageId(message.from));
  conversation.messages.forEach((message, index) => raws.push(rawMessage(conversation, message, index, ids)));
}
const imported = await store.importRawMessages(context, "fernhill-studio.mbox", raws);
console.log(`  ✓ imported ${raws.length} messages`, imported?.run ? `(${imported.run.imported} new)` : "");

// Triage: read what Elena has read, star, label, archive, set a follow-up.
const threads = await store.listThreads(tenantId);
const threadFor = (conversation) => threads.find((thread) => thread.subject.replace(/^Re: /, "") === conversation.subject.replace(/^Re: /, ""));
for (const conversation of CONVERSATIONS) {
  const thread = threadFor(conversation);
  if (!thread) {
    console.warn(`  ! no thread for ${conversation.subject}`);
    continue;
  }
  const stillUnread = conversation.messages.some((message) => message.unread);
  if (!stillUnread && thread.unread) await service.actOnThread(context, thread.id, { type: "read", value: true });
  const teammate = conversation.by ? await store.mailMember(tenantId, actor(conversation.by)) : context;
  if (conversation.star) await service.actOnThread(context, thread.id, { type: "star", value: true });
  for (const label of conversation.labels ?? []) await service.actOnThread(teammate, thread.id, { type: "label", label, value: true });
  if (conversation.archived) await service.actOnThread(teammate, thread.id, { type: "archive" });
  if (conversation.followUp) {
    // Asked for a follow-up when the proposal went out; nobody has replied since.
    await service.actOnThread(context, thread.id, { type: "remind", at: hoursAgo(28).toISOString() }, hoursAgo(99));
  }
}
const kiln = threadFor(CONVERSATIONS.find((conversation) => conversation.key === "kiln"));
if (kiln) await service.actOnThread(await store.mailMember(tenantId, actor("tom")), kiln.id, { type: "snooze", until: new Date(NOW + 40 * 3_600_000).toISOString() });
console.log("  ✓ triage");

const northgate = threadFor(CONVERSATIONS.find((conversation) => conversation.key === "northgate-feedback"));
await service.saveDraft(context, {
  threadId: northgate?.id ?? null,
  to: address("priya"),
  cc: address("tom"),
  subject: "Re: Northgate homepage: feedback on round two",
  body: "Hi Priya,\n\nThank you, all three make sense. Marcus will move the appointment button above the fold and we'll reshoot two of the images with warmer light. Thursday at 10 works for a call.\n\nElena",
});
const { draft: scheduled } = await service.saveDraft(context, {
  threadId: null,
  to: address("hana"),
  cc: "",
  subject: "Moodboards for Thursday",
  body: "Hi Hana,\n\nAhead of Thursday, here's a first look at the three territories. No need to reply; we'll walk you through them in person.\n\nElena",
});
await service.scheduleDraft(context, scheduled.id, new Date(NOW + 14 * 3_600_000).toISOString());
console.log("  ✓ drafts");

await createInvitation(PRODUCT, tenantId, elena, { email: `jade.moreau@${DOMAIN}`, role: "member" }, (token) => `http://localhost:3483/apps/mail/invite/${token}`);

// Spread the activity log over the past few days of office hours, keeping its order.
const events = await db.collection("products").doc(PRODUCT).collection("tenants").doc(tenantId).collection("auditEvents").orderBy("occurredAt").get();
const span = 72 * 3_600_000;
events.docs.forEach((doc, index) => {
  const when = NOW - span + Math.round((span - 10 * 60_000) * (index / Math.max(1, events.size - 1)));
  void doc.ref.update({ occurredAt: Timestamp.fromMillis(when) });
});
await new Promise((resolve) => setTimeout(resolve, 1500));

const mailbox = await service.loadMailbox(context);
console.log(`
Fernhill Studio is ready (fictional demo data, emulators only).
  mailbox:   ${tenantId} ("${tenant.name}")
  people:    ${TEAM.length} — sign in as ${member("elena").email} (owner); password: DEMO_PASSWORD in this script
  threads:   ${mailbox.threads.length} (${mailbox.threads.filter((thread) => thread.unread).length} unread), ${mailbox.drafts.length} drafts
`);
process.exit(0);
