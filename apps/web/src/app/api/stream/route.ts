import { recentEvents, queueDepth, taskCountsByStatus } from "@mkcc/db";
import { errJson, requireUser } from "@/lib/api";
import { ensureDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (!auth) return errJson("unauthorized", "Not authenticated.", 401);

  const encoder = new TextEncoder();
  let lastSeen = Date.now() - 5_000;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      req.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("hello", { at: Date.now() });

      while (!closed) {
        try {
          const handle = await ensureDb();
          const events = await recentEvents(handle, lastSeen, 50);
          if (events.length > 0) {
            const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt);
            const newest = ordered[ordered.length - 1];
            if (newest) lastSeen = Math.max(lastSeen, newest.createdAt);
            for (const e of ordered) {
              send("task_event", {
                id: e.id,
                taskId: e.taskId,
                type: e.type,
                actor: e.actor,
                createdAt: e.createdAt,
              });
            }
          }
          const [counts, queue] = await Promise.all([
            taskCountsByStatus(handle),
            Promise.resolve(queueDepth(handle)),
          ]);
          send("snapshot", { counts, queue, at: Date.now() });
        } catch {
          /* transient; retry next tick */
        }
        await new Promise((r) => setTimeout(r, 2_000));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
