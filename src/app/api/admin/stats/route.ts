import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { neon } from "@neondatabase/serverless";

const ADMIN_EMAILS = ["yyyjjinx@gmail.com"];

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !ADMIN_EMAILS.includes(session.user.email ?? "")) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // ── 用户统计 ─────────────────────────────────────────────
    const [totalUsers] = await sql`SELECT COUNT(*) as count FROM users`;
    const [completedOnboarding] = await sql`SELECT COUNT(*) as count FROM creator_profiles`;
    const [proUsers] = await sql`SELECT COUNT(*) as count FROM subscriptions WHERE plan='pro' AND status='active'`;

    // 最近 7 天每天新注册数
    const dailySignups = await sql`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;

    // 最近注册的 10 个用户
    const recentUsers = await sql`
      SELECT u.name, u.email, u.created_at,
             cp.id IS NOT NULL as has_profile,
             s.plan, s.status
      FROM users u
      LEFT JOIN creator_profiles cp ON cp.user_id = u.id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 10
    `;

    // ── 内容统计 ─────────────────────────────────────────────
    const [totalContent] = await sql`SELECT COUNT(*) as count FROM content_items`;
    const [totalTopics] = await sql`SELECT COUNT(*) as count FROM saved_topics`;

    // 最近 7 天每天生成内容数
    const dailyContent = await sql`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM content_items
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `;

    // 平台分布
    const platformStats = await sql`
      SELECT platform, COUNT(*) as count
      FROM content_items
      GROUP BY platform
      ORDER BY count DESC
    `;

    // ── 使用量统计 ────────────────────────────────────────────
    const [totalUsage] = await sql`SELECT COALESCE(SUM(count), 0) as total FROM usage_logs`;

    // 最近 7 天每天使用次数
    const dailyUsage = await sql`
      SELECT usage_date as day, SUM(count) as count
      FROM usage_logs
      WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY usage_date
      ORDER BY day ASC
    `;

    return NextResponse.json({
      users: {
        total: Number(totalUsers.count),
        completedOnboarding: Number(completedOnboarding.count),
        pro: Number(proUsers.count),
        dailySignups,
        recent: recentUsers,
      },
      content: {
        total: Number(totalContent.count),
        topics: Number(totalTopics.count),
        dailyContent,
        platforms: platformStats,
      },
      usage: {
        total: Number(totalUsage.total),
        daily: dailyUsage,
      },
    });
  } catch (error) {
    console.error("[admin/stats] error:", error);
    return NextResponse.json({ error: "获取数据失败" }, { status: 500 });
  }
}
