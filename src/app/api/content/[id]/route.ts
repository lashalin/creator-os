import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { headers } from "next/headers";

// PATCH: update content (after chatbot revision)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { content, title } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (content !== undefined) {
      updateData.content = content;
      updateData.wordCount = content.replace(/\s/g, "").length;
    }
    if (title !== undefined) {
      updateData.title = title;
    }

    const [updated] = await db
      .update(contentItems)
      .set(updateData)
      .where(
        and(
          eq(contentItems.id, id),
          eq(contentItems.userId, session.user.id)
        )
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "内容不存在" }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("Update content error:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
  }
}

// DELETE: remove content item
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;

    const [deleted] = await db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.id, id),
          eq(contentItems.userId, session.user.id)
        )
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "内容不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete content error:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
