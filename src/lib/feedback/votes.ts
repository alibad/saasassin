/**
 * Vote math. One vote per user per post, enforced by a deterministic document id,
 * so a retried or concurrent request can never create a second vote.
 */

export function voteDocId(postId: string, uid: string) {
  if (!postId || !uid || postId.includes("/") || uid.includes("/")) {
    throw new Error("Invalid vote key.");
  }
  return `${postId}__${uid}`;
}

export type ToggleOutcome = { op: "add" | "remove"; voted: boolean; voteCount: number };

export function toggleVote(hasVote: boolean, currentCount: number, canAdd: boolean): ToggleOutcome | { error: string } {
  if (hasVote) return { op: "remove", voted: false, voteCount: Math.max(0, currentCount - 1) };
  if (!canAdd) return { error: "This post is closed for new votes." };
  return { op: "add", voted: true, voteCount: currentCount + 1 };
}

export type Voter = { uid: string; name: string; email?: string; createdAt?: string | null };

export type VoteMergePlan = {
  /** Voters to add to the canonical post (they had not voted on it yet). */
  moves: Voter[];
  /** Voters who had voted on both; their duplicate vote is dropped, not double counted. */
  overlapping: string[];
  /** Every vote on the duplicate is removed. */
  removeFromDuplicate: string[];
  canonicalVoteCount: number;
};

/** Stored on a merged post so the merge can be reversed exactly. */
export type MergeRecord = {
  canonicalId: string;
  previousStatus: string;
  moved: Voter[];
  overlapping: Voter[];
  duplicateImportedVotes: number;
  at: string;
};

export type UnmergePlan = {
  /** Votes recreated on the restored post. */
  restoreToDuplicate: Voter[];
  /** Moved votes taken back off the canonical post. */
  removeFromCanonical: string[];
  /** Moved voters who removed their vote from the canonical post after the merge; their choice is respected. */
  droppedSinceMerge: string[];
};

export function planUnmerge(record: MergeRecord, duplicateId: string, canonicalVotes: { uid: string; movedFrom?: string | null }[]): UnmergePlan {
  const stillMoved = new Set(canonicalVotes.filter((vote) => vote.movedFrom === duplicateId).map((vote) => vote.uid));
  const restoreMoved = record.moved.filter((voter) => stillMoved.has(voter.uid));
  const restored = new Set<string>();
  const restoreToDuplicate: Voter[] = [];
  for (const voter of [...restoreMoved, ...record.overlapping]) {
    if (restored.has(voter.uid)) continue;
    restored.add(voter.uid);
    restoreToDuplicate.push(voter);
  }
  return {
    restoreToDuplicate,
    removeFromCanonical: restoreMoved.map((voter) => voter.uid),
    droppedSinceMerge: record.moved.filter((voter) => !stillMoved.has(voter.uid)).map((voter) => voter.uid),
  };
}

export function planVoteMerge(duplicateVoters: Voter[], canonicalVoters: Voter[]): VoteMergePlan {
  const canonical = new Set(canonicalVoters.map((voter) => voter.uid));
  const seen = new Set<string>();
  const moves: Voter[] = [];
  const overlapping: string[] = [];
  for (const voter of duplicateVoters) {
    if (seen.has(voter.uid)) continue;
    seen.add(voter.uid);
    if (canonical.has(voter.uid)) overlapping.push(voter.uid);
    else moves.push(voter);
  }
  return {
    moves,
    overlapping,
    removeFromDuplicate: [...seen],
    canonicalVoteCount: canonical.size + moves.length,
  };
}
