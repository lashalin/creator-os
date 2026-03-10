import { db } from "@/db";
import { subscriptions, usageLogs } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export const FREE_LIMITS = {
  generate_content: 3,   // 每天最多生成3篇内容
  suggest_topics: 5,     // 每天最多生成5次选题
  generate_dna: 2,       // DNA最多生成2次
};

export async function getUserSubscription(userId: string) {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  if (!subs[0]) {
    // Auto-create free subscription
    const [created] = await db.insert(subscriptions).values({ userId, plan: "free" }).returning();
    return created;
  }
  return subs[0];
}

export async function isPro(userId: string): Promise<boolean> {
  const sub = await getUserSubscription(userId);
  if (sub.plan !== "pro") return false;
  if (sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd) return false;
  return sub.status === "active";
}

export async function checkAndIncrementUsage(
  userId: string,
  type: keyof typeof FREE_LIMITS
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const pro = await isPro(userId);
  if (pro) return { allowed: true, used: 0, limit: Infinity };

  const today = new Date().toISOString().split("T")[0];
  const limit = FREE_LIMITS[type];

  const existing = await db
    .select()
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        eq(usageLogs.type, type),
        eq(usageLogs.usageDate, today)
      )
    )
    .limit(1);

  const used = existing[0]?.count ?? 0;

  if (used >= limit) {
    return { allowed: false, used, limit };
  }

  // Increment count
  if (existing[0]) {
    await db
      .update(usageLogs)
      .set({ count: sql`${usageLogs.count} + 1` })
      .where(eq(usageLogs.id, existing[0].id));
  } else {
    await db.insert(usageLogs).values({ userId, type, usageDate: today, count: 1 });
  }

  return { allowed: true, used: used + 1, limit };
}

export async function getUsageToday(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const logs = await db
    .select()
    .from(usageLogs)
    .where(and(eq(usageLogs.userId, userId), eq(usageLogs.usageDate, today)));

  const usage: Record<string, number> = {};
  for (const log of logs) {
    usage[log.type] = log.count;
  }
  return usage;
}
