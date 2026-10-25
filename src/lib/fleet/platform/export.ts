export type FleetExportFile = {
  path: string;
  schema: string;
  records: number;
};

/** The shared open export envelope; each product versions its own file schemas. */
export function buildExportManifest(product: string, tenantId: string, files: FleetExportFile[]) {
  return {
    schema: "net.saasassin.workspace-export",
    version: "1.0.0",
    product,
    tenantId,
    exportedAt: new Date().toISOString(),
    files,
  };
}

/** Converts Firestore Timestamps (and nested values) into JSON-safe ISO strings. */
export function toPortable(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  if (Array.isArray(value)) return value.map(toPortable);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toPortable(entry)]));
  }
  return value;
}
