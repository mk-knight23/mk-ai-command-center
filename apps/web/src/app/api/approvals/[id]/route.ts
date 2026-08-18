import { decideApproval } from "@mkcc/db";
import { approvalDecisionSchema } from "@mkcc/shared";
import { errJson, okJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);
  const { id } = await ctx.params;

  let input;
  try {
    input = approvalDecisionSchema.parse(await req.json());
  } catch {
    return errJson("invalid_input", "Decision must be approved or rejected.");
  }

  const handle = await ensureDb();
  const result = await decideApproval(handle, id, input.decision, auth.user.email, input.note);
  if (result.outcome === "error") {
    const messages: Record<string, string> = {
      not_found: "Approval not found.",
      not_pending: "Approval already decided.",
      expired: "Approval expired. Re-request approval for this task.",
      task_state_changed: "Task state changed after approval; re-validate before executing.",
    };
    return errJson(result.code, messages[result.code] ?? "Approval decision failed.", 409);
  }
  return okJson(result);
}
