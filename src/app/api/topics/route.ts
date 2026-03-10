import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { savedTopics } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { title, angle, viralScore, matchScore, competitionLevel, platforms, source } = body;

    const [inserted] = await db.insert(savedTopics).values({
      userId: session.user.id,
      title,
      angle,
      viralScore,
      matchScore,
      competitionLevel,
      platforms,
      source: source || "ai",
    }).returning();

    return NextResponse.json({ topic: inserted });
  } catch (error) {
    console.error("Save topic error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const topics = await db
      .select()
      .from(savedTopics)
      .where(eq(savedTopics.userId, session.user.id))
      .orderBy(desc(savedTopics.createdAt));

    return NextResponse.json({ topics });
  } catch (error) {
    console.error("Get topics error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
