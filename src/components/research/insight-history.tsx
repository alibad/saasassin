"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { diffVersions, type DiffPart, type InsightVersion } from "@/lib/research/versions";

import { api, errorMessage, formatDateTime } from "./api";
import styles from "./research.module.css";

function Diff({ parts }: { parts: DiffPart[] }) {
  if (parts.length === 0) return <span className={styles.hint}>(empty)</span>;
  return (
    <>
      {parts.map((part, index) =>
        part.type === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.type === "added" ? (
          <ins key={index} className="bg-green-500/15 no-underline decoration-green-700">{part.text}</ins>
        ) : (
          <del key={index} className="bg-red-500/10 text-red-700 dark:text-red-400">{part.text}</del>
        ),
      )}
    </>
  );
}

export function InsightHistoryDialog({ tenantId, projectId, insightId, onClose }: { tenantId: string; projectId: string; insightId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<InsightVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ versions: InsightVersion[] }>(`/api/research/tenants/${tenantId}/projects/${projectId}/insights/${insightId}/versions`)
      .then((response) => { if (active) setVersions(response.versions); })
      .catch((caught) => { if (active) setError(errorMessage(caught)); });
    return () => { active = false; };
  }, [tenantId, projectId, insightId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Every edit is kept as an immutable version. Each one is compared with the version before it.</DialogDescription>
        </DialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {versions === null && !error ? <Skeleton className="h-32 w-full" /> : null}
        {versions && versions.length === 0 ? <p className={styles.hint}>No versions recorded yet. The next edit starts the history.</p> : null}
        <div className="grid gap-3">
          {versions
            ?.map((version, index) => ({ version, diff: diffVersions(index > 0 ? versions[index - 1] : null, version) }))
            .reverse()
            .map(({ version, diff }) => (
              <section key={version.id} className={`${styles.panel} ${styles.panelPad} grid gap-2`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">v{version.version}</Badge>
                  <span className={styles.hint}>{version.editedBy} · {formatDateTime(version.editedAt)}</span>
                  {diff.evidenceAdded.length ? <Badge variant="outline">+{diff.evidenceAdded.length} evidence</Badge> : null}
                  {diff.evidenceRemoved.length ? <Badge variant="outline">−{diff.evidenceRemoved.length} evidence</Badge> : null}
                  {diff.themeChanged && version.version > 1 ? <Badge variant="outline">Theme changed</Badge> : null}
                </div>
                <p className="font-bold break-words"><Diff parts={diff.title} /></p>
                <p className="text-sm whitespace-pre-wrap break-words"><Diff parts={diff.body} /></p>
              </section>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
