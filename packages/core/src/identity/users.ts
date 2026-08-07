import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { users } from "../db/schema/index.js";

export const emailSchema = z.string().trim().toLowerCase().email();

/**
 * Create-on-first-sight without an UPDATE grant: ON CONFLICT DO UPDATE
 * would require UPDATE(email), which factory_app deliberately lacks —
 * so insert-do-nothing, then select.
 */
export async function upsertUserByEmail(db: Db, rawEmail: string) {
  const email = emailSchema.parse(rawEmail);
  await db
    .insert(users)
    .values({ email })
    .onConflictDoNothing({ target: users.email });
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new Error("failed to upsert user");
  return user;
}
