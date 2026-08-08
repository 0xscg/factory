import { Queue, Worker, type ConnectionOptions } from "bullmq";

export const DEADLINE_QUEUE = "deadline-scan";

/**
 * Thin BullMQ wiring: a repeatable hourly job per deployment; the job
 * handler is injected (the app composes db, rules, mail, org targets).
 * All scan logic lives in scanAndNotify and is tested without Redis.
 */
export async function scheduleDeadlineScans(
  connection: ConnectionOptions,
  everyMs = 60 * 60 * 1000,
): Promise<Queue> {
  const queue = new Queue(DEADLINE_QUEUE, { connection });
  await queue.upsertJobScheduler(DEADLINE_QUEUE, { every: everyMs });
  return queue;
}

export function startDeadlineWorker(
  connection: ConnectionOptions,
  handler: () => Promise<void>,
): Worker {
  return new Worker(DEADLINE_QUEUE, handler, { connection });
}
