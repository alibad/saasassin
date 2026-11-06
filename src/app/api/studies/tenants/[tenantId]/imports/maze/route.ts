import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { importMazeStudy, SLUG } from "@/lib/studies/data";
import { MAZE_MAX_BYTES } from "@/lib/studies/maze";

/** Preview (commit: false) or import (commit: true) a Maze results CSV as a closed, read-only study. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const text = await request.text();
    if (text.length > MAZE_MAX_BYTES + 10_000) return Response.json({ error: "The file is larger than 5 MB." }, { status: 413 });
    const result = await importMazeStudy(user, tenantId, JSON.parse(text));
    return Response.json(result, { status: result.committed ? 201 : 200 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Malformed request." }, { status: 400 });
    return fleetApiError(error);
  }
}
