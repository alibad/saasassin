import { fleetApiError } from "@/lib/fleet/platform/http";
import { providerStatuses } from "@/lib/mail/provider";
import { listDrafts, listImportRuns, listSplits, listTemplates, listThreads, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    const [threads, splits, drafts, templates, imports] = await Promise.all([
      listThreads(context.tenantId),
      listSplits(context),
      listDrafts(context.tenantId),
      listTemplates(context.tenantId),
      listImportRuns(context.tenantId),
    ]);
    return Response.json({ role: context.role, threads, splits, drafts, templates, imports, providers: providerStatuses() });
  } catch (error) {
    return fleetApiError(error);
  }
}
