import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { background, topics, avoidContent, expressionStyle, targetAudience, referenceCreators, platforms, goals, pastContent, dna } = body;

    // Upsert profile
    const existing = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(creatorProfiles)
        .set({
          background,
          topics,
          avoidContent,
          expressionStyle,
          targetAudience,
          referenceCreators,
          platforms,
          goals,
          pastContent,
          dna,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.userId, session.user.id));
    } else {
      await db.insert(creatorProfiles).values({
        userId: session.user.id,
        background,
        topics,
        avoidContent,
        expressionStyle,
        targetAudience,
        referenceCreators,
        platforms,
        goals,
        pastContent,
        dna,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save profile error:", error);
    return NextResponse.json({ error: "保存失败，请重试" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const profile = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    return NextResponse.json({ profile: profile[0] || null });
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
