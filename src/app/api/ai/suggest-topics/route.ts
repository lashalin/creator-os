import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkAndIncrementUsage } from "@/lib/subscription";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { count = 8 } = await req.json();

    const usage = await checkAndIncrementUsage(session.user.id, "suggest_topics");
    if (!usage.allowed) {
      return NextResponse.json(
        { error: "LIMIT_REACHED", used: usage.used, limit: usage.limit },
        { status: 429 }
      );
    }

    // Get creator profile
    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const profile = profiles[0];
    const dna = profile?.dna;

    const prompt = `你是一位专业的内容选题策划师。请为以下创作者生成 ${count} 个高质量选题建议。

**创作者信息：**
- 主题方向：${Array.isArray(profile?.topics) ? profile.topics.join("、") : "通用内容"}
- 目标受众：${profile?.targetAudience || "普通大众"}
- 语言风格：${dna?.languageStyle || "自然亲切"}
- 核心差异：${dna?.differentiation || ""}
- 爆款规律：${dna?.viralPattern || ""}
- 主要平台：${Array.isArray(profile?.platforms) ? profile.platforms.join("、") : "小红书、公众号"}

请生成 ${count} 个选题，每个选题包含：
- 标题（吸引眼球，符合平台风格）
- 角度（独特切入点，30字以内）
- 爆款潜力分（1-100）
- 定位匹配度（1-100）
- 竞争激烈度（低/中/高）
- 适合平台（从小红书、公众号、X、Instagram、YouTube、抖音中选）

以 JSON 数组格式输出，示例格式：
[
  {
    "title": "选题标题",
    "angle": "独特角度描述",
    "viralScore": 85,
    "matchScore": 92,
    "competitionLevel": "中",
    "platforms": ["小红书", "Instagram"]
  }
]

只输出 JSON 数组，不要有其他文字。`;

    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response");
    }

    const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Could not parse JSON");

    const topics = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ topics });
  } catch (error) {
    console.error("Suggest topics error:", error);
    return NextResponse.json({ error: "生成失败，请重试" }, { status: 500 });
  }
}
