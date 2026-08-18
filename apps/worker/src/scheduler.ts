import {
  dueSchedules,
  expireStaleApprovals,
  markScheduleRun,
  triggerWorkflow,
} from "@mkcc/db";
import type { WorkerContext } from "./index.js";

export async function runSchedulerLoop(ctx: WorkerContext): Promise<void> {
  const { handle, env, shutdown } = ctx;
  while (!shutdown.requested) {
    try {
      const now = Date.now();
      const due = await dueSchedules(handle, now);
      for (const schedule of due) {
        try {
          const { taskId } = await triggerWorkflow(handle, schedule.workflowId, "schedule");
          console.log(
            `[scheduler] workflow=${schedule.workflowId} schedule=${schedule.id} -> task=${taskId}`,
          );
        } catch (error) {
          console.error(`[scheduler] trigger failed for schedule ${schedule.id}:`, error);
        }
        await markScheduleRun(handle, schedule.id, now);
      }
      const expired = await expireStaleApprovals(handle);
      if (expired > 0) {
        console.log(`[scheduler] expired ${expired} stale approvals`);
      }
    } catch (error) {
      console.error("[scheduler] loop error:", error);
    }
    await new Promise((r) => setTimeout(r, env.SCHEDULER_POLL_MS));
  }
}
