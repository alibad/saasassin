"use client";

import { useState, type ChangeEvent } from "react";
import { CircleAlert, FileUp, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ImportedCourse, ImportReport } from "@/lib/creator/import";

import { apiJson, panelClass } from "./client";

const SAMPLE = `Product Title,Category Title,Post Title,Post Body,Video URL,Drip Days,Position
Pottery 101,Getting started,Welcome,"<p>Hello and welcome.</p>",https://youtu.be/dQw4w9WgXcQ,0,1
Pottery 101,Getting started,Your tools,"Clay, a wheel and patience.",,0,2
Pottery 101,Glazing,Glaze basics,"Mix, dip, fire.",,7,1`;

export function ImportPanel({ tenantId, canImport, onImported }: { tenantId: string; canImport: boolean; onImported: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ courses: ImportedCourse[]; report: ImportReport } | null>(null);
  const [pending, setPending] = useState<"" | "preview" | "commit">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("That file is larger than 2 MB.");
      return;
    }
    setText(await file.text());
    setPreview(null);
    setDone("");
  }

  async function run(dryRun: boolean) {
    setPending(dryRun ? "preview" : "commit");
    setError("");
    setDone("");
    try {
      if (dryRun) {
        setPreview(await apiJson(`/api/creator/tenants/${tenantId}/imports`, { method: "POST", body: JSON.stringify({ text, dryRun: true }) }));
      } else {
        const result = await apiJson<{ created: Array<{ title: string }> }>(`/api/creator/tenants/${tenantId}/imports`, { method: "POST", body: JSON.stringify({ text, dryRun: false }) });
        setDone(`Imported ${result.created.length} course${result.created.length === 1 ? "" : "s"} as drafts: ${result.created.map((course) => course.title).join(", ")}.`);
        setPreview(null);
        setText("");
        onImported();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      setPending("");
    }
  }

  if (!canImport) {
    return <p className="text-sm text-neutral-600">Only owners, admins and members can import courses.</p>;
  }

  const report = preview?.report;
  return (
    <Card className={panelClass}>
      <CardHeader>
        <CardTitle>Migrate from Kajabi</CardTitle>
        <CardDescription>
          Paste or upload a Kajabi-style export — a CSV with Product, Category and Post columns, or JSON shaped as products → categories → posts. You get a full preview and mapping report first; nothing is created until you confirm, and every course arrives as a draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="import-file" className="inline-flex cursor-pointer items-center gap-2 border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-medium">
            <FileUp className="size-4" aria-hidden="true" /> Upload .csv or .json
          </Label>
          <input id="import-file" type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={readFile} />
          <Button size="sm" variant="ghost" onClick={() => { setText(SAMPLE); setPreview(null); }}>Use a sample export</Button>
        </div>
        <Textarea aria-label="Export contents" rows={8} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} placeholder="Product Title,Category Title,Post Title,Post Body,Video URL,Drip Days,Position" className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={!text.trim() || pending !== ""}>{pending === "preview" ? "Reading…" : "Preview import"}</Button>
          {preview && (
            <Button onClick={() => run(false)} disabled={pending !== "" || report!.errors.length > 0 || report!.courses === 0}>
              <Upload aria-hidden="true" /> {pending === "commit" ? "Importing…" : `Import ${report!.courses} course${report!.courses === 1 ? "" : "s"} as drafts`}
            </Button>
          )}
        </div>
        {error && <Alert variant="destructive"><CircleAlert /><AlertTitle>Import failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {done && <p className="text-sm text-emerald-700" role="status">{done}</p>}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Format: {report.format.toUpperCase()}</Badge>
              <Badge>{report.courses} courses</Badge>
              <Badge variant="secondary">{report.modules} modules</Badge>
              <Badge variant="secondary">{report.lessons} lessons</Badge>
              <Badge variant={report.warnings.length ? "outline" : "secondary"}>{report.warnings.length} warnings</Badge>
              <Badge variant={report.errors.length ? "destructive" : "secondary"}>{report.errors.length} errors</Badge>
            </div>
            {report.errors.length > 0 && (
              <Alert variant="destructive"><CircleAlert /><AlertTitle>Fix these before importing</AlertTitle><AlertDescription><ul className="list-disc pl-4">{report.errors.map((entry, i) => <li key={i}>{entry}</li>)}</ul></AlertDescription></Alert>
            )}
            {Object.keys(report.columnMapping).length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Source field</TableHead><TableHead>Maps to</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {Object.entries(report.columnMapping).map(([source, target]) => <TableRow key={source}><TableCell className="font-mono text-xs">{source}</TableCell><TableCell>{target}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            )}
            {report.warnings.length > 0 && (
              <details className="border-2 border-neutral-300 bg-white p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Warnings ({report.warnings.length})</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">{report.warnings.map((entry, i) => <li key={i}>{entry}</li>)}</ul>
              </details>
            )}
            <div className="space-y-2">
              {preview.courses.map((course, ci) => (
                <div key={ci} className="border-2 border-neutral-900 bg-white p-3">
                  <p className="font-semibold">{course.title}</p>
                  {course.modules.map((courseModule) => (
                    <div key={courseModule.id} className="mt-2 text-sm">
                      <p className="font-medium">{courseModule.title}</p>
                      <ol className="list-decimal pl-6 text-neutral-700">
                        {courseModule.lessons.map((lesson) => (
                          <li key={lesson.id}>{lesson.title}{lesson.videoUrl ? " · video" : ""}{lesson.dripDays ? ` · day ${lesson.dripDays}` : ""}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
