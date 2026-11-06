/**
 * Contacts on accounts, their role in each deal, and transcript speaker links. Pure: per-contact
 * talk time and multi-threading are computed from stored calls at read time, and only from speakers
 * a person explicitly linked to a contact — never guessed from names.
 */

import type { CallAnalysis } from "./analysis";

export const DEAL_ROLES = ["champion", "decision_maker", "economic_buyer", "influencer", "blocker", "user"] as const;
export type DealRole = (typeof DEAL_ROLES)[number];

export const DEAL_ROLE_LABELS: Record<DealRole, string> = {
  champion: "Champion",
  decision_maker: "Decision maker",
  economic_buyer: "Economic buyer",
  influencer: "Influencer",
  blocker: "Blocker",
  user: "End user",
};

export type SpeakerTarget = { kind: "contact"; contactId: string } | { kind: "member"; email: string };
export type SpeakerLink = SpeakerTarget & { speaker: string };

export type ContactLike = { id: string; accountId: string; name: string; email: string };

/** Replaces (or removes, when link is null) the link for one speaker; other speakers are untouched. */
export function applySpeakerLink(links: SpeakerLink[], speaker: string, link: SpeakerTarget | null): SpeakerLink[] {
  const rest = links.filter((entry) => entry.speaker !== speaker);
  return link ? [...rest, { ...link, speaker } as SpeakerLink].sort((a, b) => a.speaker.localeCompare(b.speaker)) : rest;
}

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Suggestions only (the UI shows them; a person confirms): a speaker label equal to a contact's or
 * member's name or email. Ambiguous matches are not suggested.
 */
export function suggestSpeakerLinks(
  speakers: string[],
  contacts: ContactLike[],
  members: Array<{ email: string; name: string }>,
  existing: SpeakerLink[] = [],
): SpeakerLink[] {
  const linked = new Set(existing.map((entry) => entry.speaker));
  const suggestions: SpeakerLink[] = [];
  for (const speaker of speakers) {
    if (linked.has(speaker)) continue;
    const key = normalizeName(speaker);
    const memberMatches = members.filter((member) => normalizeName(member.name) === key || normalizeName(member.email) === key);
    const contactMatches = contacts.filter((contact) => normalizeName(contact.name) === key || (contact.email && normalizeName(contact.email) === key));
    if (memberMatches.length + contactMatches.length !== 1) continue;
    suggestions.push(
      memberMatches[0]
        ? { speaker, kind: "member", email: memberMatches[0].email }
        : { speaker, kind: "contact", contactId: contactMatches[0].id },
    );
  }
  return suggestions;
}

export type EngagementCall = {
  id: string;
  dealId: string;
  occurredAt: string;
  speakerLinks: SpeakerLink[];
  analysis: Pick<CallAnalysis, "speakers">;
};

export type ContactEngagement = {
  contactId: string;
  calls: number;
  talkSeconds: number;
  /** Share of all talk time across the calls this contact spoke on, 0–1. */
  talkShare: number;
  lastCallId: string | null;
  lastCallAt: string | null;
  dealIds: string[];
};

/** Per-contact talk time across every call where one of their linked speakers talked. */
export function contactEngagement(calls: EngagementCall[]): Map<string, ContactEngagement> {
  const result = new Map<string, ContactEngagement & { totalOnCalls: number }>();
  const ordered = [...calls].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const call of ordered) {
    const total = call.analysis.speakers.reduce((sum, speaker) => sum + speaker.talkSeconds, 0);
    const perContact = new Map<string, number>();
    for (const link of call.speakerLinks ?? []) {
      if (link.kind !== "contact") continue;
      const seconds = call.analysis.speakers.find((speaker) => speaker.speaker === link.speaker)?.talkSeconds ?? 0;
      perContact.set(link.contactId, (perContact.get(link.contactId) ?? 0) + seconds);
    }
    for (const [contactId, seconds] of perContact) {
      if (seconds <= 0) continue;
      const entry = result.get(contactId) ?? { contactId, calls: 0, talkSeconds: 0, talkShare: 0, lastCallId: null, lastCallAt: null, dealIds: [], totalOnCalls: 0 };
      entry.calls += 1;
      entry.talkSeconds += seconds;
      entry.totalOnCalls += total;
      entry.lastCallId = call.id;
      entry.lastCallAt = call.occurredAt;
      if (!entry.dealIds.includes(call.dealId)) entry.dealIds.push(call.dealId);
      result.set(contactId, entry);
    }
  }
  return new Map(
    [...result].map(([id, { totalOnCalls, ...entry }]) => [
      id,
      { ...entry, talkSeconds: Math.round(entry.talkSeconds * 100) / 100, talkShare: totalOnCalls > 0 ? Math.round((entry.talkSeconds / totalOnCalls) * 10000) / 10000 : 0 },
    ]),
  );
}

/** Contacts heard (linked speaker with talk time) on a deal's calls, most recent last. */
export function engagedContactsForDeal(dealId: string, calls: EngagementCall[]) {
  const engagement = contactEngagement(calls.filter((call) => call.dealId === dealId));
  return [...engagement.values()].map((entry) => ({ contactId: entry.contactId, lastCallId: entry.lastCallId!, talkSeconds: entry.talkSeconds }));
}
