import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db.pg";
import { users } from "../../drizzle/schema.pg";
import { eq, or } from "drizzle-orm";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  // Temporary debug endpoint to diagnose auth failures on Azure
  debugAuth: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) {
        return { error: "No DB - NEON_DATABASE_URL not set", dbAvailable: false };
      }
      try {
        const result = await db
          .select({ id: users.id, email: users.email, username: users.username, hasHash: users.passwordHash })
          .from(users)
          .where(or(eq(users.username, input.username), eq(users.email, input.username)))
          .limit(1)
          .execute();
        return {
          dbAvailable: true,
          found: result.length > 0,
          userId: result[0]?.id ?? null,
          hasPasswordHash: Boolean(result[0]?.hasHash),
          nodeVersion: process.version,
          env: process.env.NODE_ENV,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? (err.stack ?? '') : '';
        return {
          dbAvailable: true,
          error: msg,
          stack: stack.split('\n').slice(0, 5).join(' | '),
        };
      }
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
