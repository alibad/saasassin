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
