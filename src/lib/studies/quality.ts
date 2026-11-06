import type { Block, ResponseRecord, ScaleAnswer, StudySettings, TextAnswer } from "./model";

/**
 * Session quality (pure). Flags are suggestions computed on read from the stored response;
 * only a researcher's decision (exclude / keep, with a reason) is stored. Results and exports
 * leave out excluded sessions unless the reader asks to see everything.
 */

export const QUALITY_FLAG_CODES = ["speeder", "straight_lining", "empty_open_text"] as const;
export type QualityFlagCode = (typeof QUALITY_FLAG_CODES)[number];
export type QualityFlag = { code: QualityFlagCode; reason: string };

export const QUALITY_FLAG_LABELS: Record<QualityFlagCode, string> = {
  speeder: "Speeder",
  straight_lining: "Straight-lining",
  empty_open_text: "Empty open text",
};

export type QualityDecision = {
  decision: "excluded" | "kept";
  reason: string;
  decidedBy: { uid: string; email: string };
  decidedAt: string | null;
};

/** With no researcher-set threshold, a session is a speeder when it took under a third of the median. */
export const AUTO_SPEEDER_RATIO = 1 / 3;
/** The automatic threshold needs enough completed sessions for the median to mean something. */
export const AUTO_SPEEDER_MIN_SAMPLE = 5;
/** Straight-lining needs at least this many rating scales answered with one identical value. */
export const STRAIGHT_LINE_MIN_SCALES = 3;

export type SpeederThreshold = { ms: number; source: "setting" | "auto"; medianMs: number | null } | null;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function speederThreshold(settings: Pick<StudySettings, "minDurationSeconds">, responses: ResponseRecord[]): SpeederThreshold {
  const durations = responses
    .filter((response) => response.status === "completed" && typeof response.durationMs === "number")
    .map((response) => response.durationMs as number);
  const medianMs = median(durations);
  if (settings.minDurationSeconds) return { ms: settings.minDurationSeconds * 1000, source: "setting", medianMs };
  if (durations.length < AUTO_SPEEDER_MIN_SAMPLE || medianMs === null) return null;
  return { ms: Math.round(medianMs * AUTO_SPEEDER_RATIO), source: "auto", medianMs };
}

const LOW_EFFORT = new Set(["asdf", "asdfg", "asdfgh", "qwerty", "xxx", "idk", "na", "n/a", "none", "nothing", "test"]);

/** Empty, under three letters/digits, one repeated character, or a known keyboard-mash answer. */
export function isLowEffortText(text: string | undefined | null): boolean {
  const trimmed = (text ?? "").trim().toLowerCase();
  const compact = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
  if (compact.length < 3) return true;
  if (/^(.)\1+$/u.test(compact)) return true;
  return LOW_EFFORT.has(trimmed) || LOW_EFFORT.has(compact);
}

function formatSeconds(ms: number) {
  return ms >= 60000 ? `${(ms / 60000).toFixed(1)} min` : `${Math.round(ms / 1000)} s`;
}

/** Flags for one completed session against the blocks of the version it answered. */
export function assessResponse(blocks: Block[], response: ResponseRecord, threshold: SpeederThreshold): QualityFlag[] {
  if (response.status !== "completed") return [];
  const flags: QualityFlag[] = [];
  const onPath = blocks.filter((block) => response.path.includes(block.id));

  if (threshold && typeof response.durationMs === "number" && response.durationMs < threshold.ms) {
    const basis = threshold.source === "setting" ? "the study's minimum" : `a third of the ${formatSeconds(threshold.medianMs ?? 0)} median`;
    flags.push({
      code: "speeder",
      reason: `Finished in ${formatSeconds(response.durationMs)}, under the ${formatSeconds(threshold.ms)} threshold (${basis}).`,
    });
  }

  const ratings = onPath
    .filter((block) => block.type === "opinion_scale")
    .map((block) => (response.answers[block.id] as ScaleAnswer | undefined)?.value)
    .filter((value): value is number => typeof value === "number");
  if (ratings.length >= STRAIGHT_LINE_MIN_SCALES && ratings.every((value) => value === ratings[0])) {
    flags.push({ code: "straight_lining", reason: `Gave the same rating (${ratings[0]}) on all ${ratings.length} opinion scales.` });
  }

  const openText = onPath.filter((block) => block.type === "open_text");
  if (openText.length) {
    const lowEffort = openText.filter((block) => isLowEffortText((response.answers[block.id] as TextAnswer | undefined)?.text));
    if (lowEffort.length === openText.length) {
      flags.push({
        code: "empty_open_text",
        reason:
          openText.length === 1
            ? "Left the open-text question empty or answered it with no real content."
            : `Left all ${openText.length} open-text questions empty or without real content.`,
      });
    }
  }
  return flags;
}

export function isExcluded(response: Pick<ResponseRecord, "quality">) {
  return response.quality?.decision === "excluded";
}

export type SessionQuality = {
  responseId: string;
  flags: QualityFlag[];
  decision: QualityDecision["decision"] | null;
  reason: string;
  decidedBy: string | null;
  decidedAt: string | null;
  excluded: boolean;
};

/** Assesses every response against its own frozen version. */
export function assessSessions(
  versions: { version: number; blocks: Block[] }[],
  settings: Pick<StudySettings, "minDurationSeconds">,
  responses: ResponseRecord[],
  currentVersion: number,
) {
  const threshold = speederThreshold(settings, responses.filter((response) => response.version === currentVersion));
  const blocksFor = new Map(versions.map((version) => [version.version, version.blocks]));
  const sessions = new Map<string, SessionQuality>();
  for (const response of responses) {
    const flags = assessResponse(blocksFor.get(response.version) ?? [], response, threshold);
    sessions.set(response.id, {
      responseId: response.id,
      flags,
      decision: response.quality?.decision ?? null,
      reason: response.quality?.reason ?? "",
      decidedBy: response.quality?.decidedBy?.email ?? null,
      decidedAt: response.quality?.decidedAt ?? null,
      excluded: isExcluded(response),
    });
  }
  return { threshold, sessions };
}
