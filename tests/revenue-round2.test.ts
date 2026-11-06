import { describe, expect, it } from "vitest";

import { applySpeakerLink, contactEngagement, engagedContactsForDeal, suggestSpeakerLinks } from "../src/lib/revenue/contacts";
import { computeRiskSignals, currentStageSince } from "../src/lib/revenue/deals";
import { buildForecast, checkForecastChange, DEFAULT_STAGE_PROBABILITIES, effectiveCategory, NO_CLOSE_DATE, normalizeStageProbabilities, type ForecastDeal } from "../src/lib/revenue/forecast";
import { retentionDueAt, retentionQueue } from "../src/lib/revenue/retention";
import { contactSchema, forecastChangeSchema, speakerLinkSchema, webhookSchema } from "../src/lib/revenue/schemas";
import { buildDealTimeline, dealStageStats, stageDurations } from "../src/lib/revenue/timeline";
import { classifyDelivery, isPrivateAddress, signatureHeader, validateWebhookUrl, verifySignature } from "../src/lib/revenue/webhooks";

const speakers = (entries: Array<[string, number]>) => ({ speakers: entries.map(([speaker, talkSeconds]) => ({ speaker, talkSeconds, talkRatio: 0, turns: 1, words: 1, questions: 0, longestMonologueSeconds: 0 })) });

describe("speaker links", () => {
  it("replaces one speaker's link without touching others, and removes on null", () => {
    let links = applySpeakerLink([], "Ben", { kind: "contact", contactId: "c1" });
    links = applySpeakerLink(links, "Ana", { kind: "member", email: "ana@x.test" });
    links = applySpeakerLink(links, "Ben", { kind: "contact", contactId: "c2" });
    expect(links).toEqual([
      { speaker: "Ana", kind: "member", email: "ana@x.test" },
      { speaker: "Ben", kind: "contact", contactId: "c2" },
    ]);
    expect(applySpeakerLink(links, "Ben", null)).toEqual([{ speaker: "Ana", kind: "member", email: "ana@x.test" }]);
  });

  it("suggests only unambiguous exact name matches and skips linked speakers", () => {
    const contacts = [
      { id: "c1", accountId: "a", name: "Ben Buyer", email: "" },
      { id: "c2", accountId: "a", name: "Sam Lee", email: "" },
      { id: "c3", accountId: "a", name: "sam  lee", email: "" },
    ];
    const members = [{ email: "ana@x.test", name: "Ana Rep" }];
    expect(suggestSpeakerLinks(["ben buyer", "Ana Rep", "Sam Lee", "Unknown"], contacts, members)).toEqual([
      { speaker: "ben buyer", kind: "contact", contactId: "c1" },
      { speaker: "Ana Rep", kind: "member", email: "ana@x.test" },
    ]);
    expect(suggestSpeakerLinks(["Ben Buyer"], contacts, members, [{ speaker: "Ben Buyer", kind: "contact", contactId: "c9" }])).toEqual([]);
  });

  it("validates link payloads", () => {
    expect(speakerLinkSchema.safeParse({ speaker: "Ben", link: { kind: "contact", contactId: "c1" } }).success).toBe(true);
    expect(speakerLinkSchema.safeParse({ speaker: "Ben", link: null }).success).toBe(true);
    expect(speakerLinkSchema.safeParse({ speaker: "Ben", link: { kind: "member", email: "nope" } }).success).toBe(false);
    expect(contactSchema.parse({ accountId: "a", name: "Ben Buyer" })).toMatchObject({ title: "", email: "" });
    expect(contactSchema.safeParse({ accountId: "a", name: "Ben", email: "bad" }).success).toBe(false);
  });
});

describe("contact engagement", () => {
  const calls = [
    { id: "k1", dealId: "d1", occurredAt: "2026-10-01T10:00:00Z", speakerLinks: [{ speaker: "Ben", kind: "contact" as const, contactId: "c1" }], analysis: speakers([["Ana", 30], ["Ben", 30]]) },
    { id: "k2", dealId: "d1", occurredAt: "2026-10-05T10:00:00Z", speakerLinks: [{ speaker: "Benjamin", kind: "contact" as const, contactId: "c1" }, { speaker: "Ana", kind: "member" as const, email: "a@x" }], analysis: speakers([["Ana", 10], ["Benjamin", 30]]) },
    { id: "k3", dealId: "d2", occurredAt: "2026-10-03T10:00:00Z", speakerLinks: [{ speaker: "Cara", kind: "contact" as const, contactId: "c2" }, { speaker: "Silent", kind: "contact" as const, contactId: "c3" }], analysis: speakers([["Cara", 20]]) },
  ];

  it("sums linked talk time across calls and ignores members and silent links", () => {
    const engagement = contactEngagement(calls);
    expect(engagement.get("c1")).toEqual({ contactId: "c1", calls: 2, talkSeconds: 60, talkShare: 0.6, lastCallId: "k2", lastCallAt: "2026-10-05T10:00:00Z", dealIds: ["d1"] });
    expect(engagement.get("c2")).toMatchObject({ calls: 1, talkSeconds: 20, talkShare: 1 });
    expect(engagement.has("c3")).toBe(false);
  });

  it("feeds the single-threaded rule only when exactly one contact spoke", () => {
    const engaged = engagedContactsForDeal("d1", calls).map((entry) => ({ ...entry, name: "Ben" }));
    expect(engaged).toEqual([{ contactId: "c1", lastCallId: "k2", talkSeconds: 60, name: "Ben" }]);
    const deal = { stage: "demo" as const, closeDate: null, createdAt: "2026-10-01T00:00:00Z" };
    const riskCalls = [{ id: "k2", occurredAt: "2026-10-05T10:00:00Z", nextStepCount: 1, competitorHits: [] }];
    const now = new Date("2026-10-06T00:00:00Z");
    expect(computeRiskSignals(deal, riskCalls, now, undefined, { engagedContacts: engaged }).map((risk) => risk.code)).toEqual(["single_threaded"]);
    expect(computeRiskSignals(deal, riskCalls, now, undefined, { engagedContacts: [...engaged, { contactId: "c2", name: "Cara", lastCallId: "k2" }] })).toEqual([]);
    expect(computeRiskSignals(deal, riskCalls, now, undefined, { engagedContacts: [] })).toEqual([]);
    expect(computeRiskSignals(deal, [], now, undefined, { engagedContacts: engaged }).map((risk) => risk.code)).toEqual(["no_calls"]);
  });
});

describe("stalled deals", () => {
  const history = [
    { from: null, to: "prospecting" as const, at: "2026-08-01T00:00:00Z", by: "a" },
    { from: "prospecting" as const, to: "demo" as const, at: "2026-08-11T00:00:00Z", by: "a" },
    { from: "demo" as const, to: "proposal" as const, at: "2026-08-21T12:00:00Z", by: "a" },
    { from: "proposal" as const, to: "demo" as const, at: "2026-08-31T00:00:00Z", by: "a" },
  ];
  const now = new Date("2026-10-15T00:00:00Z");

  it("finds when the deal entered its current stage", () => {
    expect(currentStageSince({ stage: "demo", stageHistory: history, createdAt: "2026-08-01T00:00:00Z" })).toBe("2026-08-31T00:00:00Z");
    expect(currentStageSince({ stage: "demo", stageHistory: [], createdAt: "2026-08-01T00:00:00Z" })).toBe("2026-08-01T00:00:00Z");
  });

  it("totals time per stage across revisits and flags stalled deals", () => {
    expect(stageDurations(history, now)).toEqual([
      { stage: "prospecting", days: 10, visits: 1, current: false },
      { stage: "demo", days: 55.5, visits: 2, current: true },
      { stage: "proposal", days: 9.5, visits: 1, current: false },
    ]);
    const stats = dealStageStats({ stage: "demo", stageHistory: history, createdAt: "2026-08-01T00:00:00Z" }, now, 30);
    expect(stats).toMatchObject({ daysInCurrentStage: 45, stalled: true, ageDays: 75 });
    expect(dealStageStats({ stage: "closed_won", stageHistory: history, createdAt: "2026-08-01T00:00:00Z" }, now, 30).stalled).toBe(false);
    const signals = computeRiskSignals({ stage: "demo", closeDate: null, createdAt: null }, [{ id: "c", occurredAt: "2026-10-14T00:00:00Z", nextStepCount: 1, competitorHits: [] }], now, { staleAfterDays: 14, stalledAfterDays: 30 }, { stageEnteredAt: "2026-08-31T00:00:00Z" });
    expect(signals).toEqual([{ code: "stalled_in_stage", severity: "medium", message: "In Demo for 45 days (threshold 30)." }]);
    expect(computeRiskSignals({ stage: "demo", closeDate: null, createdAt: null }, [], now, { staleAfterDays: 14, stalledAfterDays: 20 }, { stageEnteredAt: "2026-08-31T00:00:00Z" })[0].severity).toBe("high");
  });
});

describe("deal timeline", () => {
  it("merges stages, calls, next steps and comments newest first", () => {
    const entries = buildDealTimeline(
      [{ from: null, to: "discovery", at: "2026-10-01T09:00:00Z", by: "rep" }],
      [{ id: "k1", title: "Intro", occurredAt: "2026-10-02T10:00:00Z", repEmail: "rep", durationSeconds: 600, nextSteps: [{ text: "Send deck", start: 300, segmentIndex: 4 }] }],
      [
        { id: "m1", callId: "k1", at: 120, body: "Nice", authorEmail: "mgr", createdAt: "2026-10-03T08:00:00Z" },
        { id: "m2", callId: "other", at: 0, body: "Orphan", authorEmail: "mgr", createdAt: "2026-10-04T08:00:00Z" },
      ],
    );
    expect(entries.map((entry) => entry.kind)).toEqual(["comment", "call", "next_step", "stage"]);
    expect(entries[2]).toMatchObject({ kind: "next_step", callId: "k1", text: "Send deck", offset: 300 });
  });
});

describe("forecast", () => {
  const deals: ForecastDeal[] = [
    { id: "a", name: "A", stage: "proposal", amount: 100_000, closeDate: "2026-11-20", ownerEmail: "ana@x", forecast: { call: { category: "commit", by: "ana@x", at: "" } } },
    { id: "b", name: "B", stage: "demo", amount: 50_000, closeDate: "2026-11-02", ownerEmail: "ben@x", forecast: { call: { category: "commit", by: "ben@x", at: "" }, override: { category: "best_case", by: "mgr", at: "", reason: "r" } } },
    { id: "c", name: "C", stage: "discovery", amount: 20_000, closeDate: "2026-12-01", ownerEmail: "ana@x" },
    { id: "d", name: "D", stage: "negotiation", amount: 10_000, closeDate: null, ownerEmail: "ben@x", forecast: { call: { category: "omitted", by: "ben@x", at: "" } } },
    { id: "e", name: "E", stage: "closed_won", amount: 30_000, closeDate: "2026-11-10", ownerEmail: "ana@x" },
    { id: "f", name: "F", stage: "closed_lost", amount: 99_000, closeDate: "2026-11-10", ownerEmail: "ana@x" },
  ];

  it("uses the override, then the owner's call, then pipeline", () => {
    expect(deals.map(effectiveCategory)).toEqual(["commit", "best_case", "pipeline", "omitted", "pipeline", "pipeline"]);
  });

  it("weights open deals by stage probability and buckets by close month and owner", () => {
    const forecast = buildForecast(deals);
    expect(forecast.total).toEqual({ key: "total", deals: 3, pipeline: 170_000, weighted: 60_000 + 20_000 + 4_000, bestCase: 150_000, commit: 100_000, closedWon: 30_000 });
    expect(forecast.byMonth.map((bucket) => bucket.key)).toEqual(["2026-11", "2026-12"]);
    expect(forecast.byMonth[0]).toMatchObject({ deals: 2, commit: 100_000, bestCase: 150_000, closedWon: 30_000 });
    expect(forecast.byRep.map((bucket) => [bucket.key, bucket.weighted])).toEqual([["ana@x", 64_000], ["ben@x", 20_000]]);
    expect(buildForecast([{ ...deals[0], closeDate: null }]).byMonth[0].key).toBe(NO_CLOSE_DATE);
    expect(buildForecast(deals, { ...DEFAULT_STAGE_PROBABILITIES, proposal: 90 }).total.weighted).toBe(90_000 + 20_000 + 4_000);
  });

  it("validates probability edits", () => {
    expect(normalizeStageProbabilities({ demo: 55 }).demo).toBe(55);
    expect(() => normalizeStageProbabilities({ demo: 101 })).toThrow();
    expect(() => normalizeStageProbabilities({ demo: 2.5 })).toThrow();
    expect(() => normalizeStageProbabilities({ closed_won: 80 })).toThrow();
  });

  it("lets the owner call and coaches override, never reps overriding or calling others' deals", () => {
    const deal = { stage: "demo" as const, ownerEmail: "Ana@X" };
    expect(checkForecastChange(deal, { kind: "call" }, { email: "ana@x", coach: false }).allowed).toBe(true);
    expect(checkForecastChange(deal, { kind: "call" }, { email: "ben@x", coach: true })).toMatchObject({ allowed: false, status: 403 });
    expect(checkForecastChange(deal, { kind: "override" }, { email: "ana@x", coach: false })).toMatchObject({ allowed: false, status: 403 });
    expect(checkForecastChange(deal, { kind: "override" }, { email: "mgr@x", coach: true }).allowed).toBe(true);
    expect(checkForecastChange({ ...deal, stage: "closed_won" }, { kind: "call" }, { email: "ana@x", coach: false })).toMatchObject({ status: 409 });
    expect(forecastChangeSchema.safeParse({ kind: "override", category: "commit", reason: "" }).success).toBe(false);
  });
});

describe("webhooks", () => {
  it("signs with HMAC-SHA256 and verifies within the replay window", () => {
    const header = signatureHeader("whsec_test", 1_700_000_000, '{"a":1}');
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_test", header, '{"a":1}', 1_700_000_100)).toBe(true);
    expect(verifySignature("whsec_test", header, '{"a":2}', 1_700_000_100)).toBe(false);
    expect(verifySignature("whsec_test", header, '{"a":1}', 1_700_001_000)).toBe(false);
    expect(verifySignature("whsec_test", "garbage", '{"a":1}', 1_700_000_000)).toBe(false);
  });

  it("accepts only public HTTPS endpoints", () => {
    expect(validateWebhookUrl("https://hooks.example.com/x")).toMatchObject({ ok: true, hostname: "hooks.example.com" });
    for (const url of ["http://hooks.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x", "https://192.168.1.4", "https://10.0.0.1", "https://169.254.169.254/latest", "https://intranet/x", "https://svc.internal/x", "https://u:p@hooks.example.com", "https://hooks.example.com:8443/x", "not a url"]) {
      expect(validateWebhookUrl(url).ok, url).toBe(false);
    }
    expect(webhookSchema.safeParse({ url: "https://hooks.example.com", events: [] }).success).toBe(false);
  });

  it("recognises private resolved addresses", () => {
    for (const address of ["10.1.2.3", "172.20.0.1", "192.168.0.9", "127.0.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111", "172.32.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });

  it("only counts 2xx as delivered", () => {
    expect(classifyDelivery({ httpStatus: 204 })).toEqual({ status: "delivered", httpStatus: 204, error: null });
    expect(classifyDelivery({ httpStatus: 302 })).toMatchObject({ status: "failed", httpStatus: 302 });
    expect(classifyDelivery({ httpStatus: 500 })).toEqual({ status: "failed", httpStatus: 500, error: "Endpoint responded 500." });
    expect(classifyDelivery({ error: "Timed out after 5s." })).toEqual({ status: "failed", httpStatus: null, error: "Timed out after 5s." });
  });
});

describe("retention queue", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const calls = [
    { id: "old", occurredAt: "2026-09-01T12:00:00Z" },
    { id: "edge", occurredAt: "2026-10-07T13:00:00Z" },
    { id: "soon", occurredAt: "2026-10-15T12:00:00Z" },
    { id: "fresh", occurredAt: "2026-11-05T12:00:00Z" },
  ];

  it("lists due calls with due dates and calls due in the next two weeks", () => {
    const queue = retentionQueue(calls, now, 30);
    expect(queue.due.map((call) => [call.id, call.daysOverdue])).toEqual([["old", 36]]);
    expect(queue.due[0].dueAt).toBe(retentionDueAt("2026-09-01T12:00:00Z", 30));
    expect(queue.upcoming.map((call) => call.id)).toEqual(["edge", "soon"]);
    expect(retentionQueue(calls, now, null)).toEqual({ retentionDays: null, due: [], upcoming: [] });
  });
});
