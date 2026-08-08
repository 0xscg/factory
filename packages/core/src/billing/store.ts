import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { stripeEvents } from "../db/schema/index.js";

import type { ProcessedEventStore } from "./webhooks.js";

/**
 * Durable idempotency ledger over the stripe_events system table.
 * markProcessed is insert-or-nothing on the event id, so two app
 * instances racing on the same delivery mark exactly one winner. See
 * ProcessedEventStore for the at-least-once contract.
 */
export class DbProcessedEventStore implements ProcessedEventStore {
  constructor(private readonly db: Db) {}

  async wasProcessed(eventId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: stripeEvents.id })
      .from(stripeEvents)
      .where(eq(stripeEvents.id, eventId));
    return rows.length > 0;
  }

  async markProcessed(eventId: string, eventType: string): Promise<boolean> {
    const inserted = await this.db
      .insert(stripeEvents)
      .values({ id: eventId, type: eventType })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    return inserted.length > 0;
  }
}
