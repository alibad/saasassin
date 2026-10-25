import { canManage, type Folder, type ProjectSnapshot } from "./model";

export type Viewer = { uid: string; role: string };

/** Unrestricted folders are visible to every member; restricted ones only to listed members, owners and admins. */
export function canSeeFolder(folder: Pick<Folder, "restricted" | "memberUids"> | undefined, viewer: Viewer) {
  if (!folder || !folder.restricted) return true;
  return canManage(viewer.role) || folder.memberUids.includes(viewer.uid);
}

/**
 * Removes everything a viewer may not see: sources in restricted folders they are not listed on, highlights from
 * those sources, and the matching evidence links on insights (the count of hidden links is kept so nothing is
 * silently misrepresented). Applied to project reads, search and export alike.
 */
export function filterSnapshotForViewer<T extends ProjectSnapshot>(snapshot: T, viewer: Viewer): T & { hiddenSources: number } {
  const folders = new Map((snapshot.folders ?? []).map((folder) => [folder.id, folder]));
  const visibleFolders = (snapshot.folders ?? []).filter((folder) => canSeeFolder(folder, viewer));
  const sources = snapshot.sources.filter((source) => !source.folderId || canSeeFolder(folders.get(source.folderId), viewer));
  const visibleSourceIds = new Set(sources.map((source) => source.id));
  const highlights = snapshot.highlights.filter((highlight) => visibleSourceIds.has(highlight.sourceId));
  const visibleHighlightIds = new Set(highlights.map((highlight) => highlight.id));
  const allHighlightIds = new Set(snapshot.highlights.map((highlight) => highlight.id));
  const insights = snapshot.insights.map((insight) => {
    const highlightIds = insight.highlightIds.filter((id) => visibleHighlightIds.has(id));
    const restrictedEvidence = insight.highlightIds.filter((id) => allHighlightIds.has(id) && !visibleHighlightIds.has(id)).length;
    return restrictedEvidence > 0 ? { ...insight, highlightIds, restrictedEvidence } : insight;
  });
  return { ...snapshot, folders: visibleFolders, sources, highlights, insights, hiddenSources: snapshot.sources.length - sources.length };
}
