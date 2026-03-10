import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { title, contentType, platform, content, topicId, status } = body;
    const wordCount = content ? content.replace(/\s/g, "").length : 0;

    const [inserted] = await db.insert(contentItems).values({
      userId: session.user.id,
      title,
      contentType,
      platform,
      content,
      topicId: topicId || null,
      status: status || "draft",
      wordCount,
    }).returning();

    return NextResponse.json({ item: inserted });
  } catch (error) {
    console.error("Save content error:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const items = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.userId, session.user.id))
      .orderBy(desc(contentItems.createdAt));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Get content error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
