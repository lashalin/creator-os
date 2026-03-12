import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { topic, material } = await req.json();
    if (!topic && !material) {
      return NextResponse.json({ error: "请提供话题或素材" }, { status: 400 });
    }

    const inputContent = material
      ? `用户提供的原始素材：\n${material.slice(0, 2000)}`
      : `用户想写的话题：${topic}`;

    const prompt = `你是一位资深内容策略顾问，擅长评估内容选题潜力。

${inputContent}

请深度评估这个选题/素材，输出 JSON：
{
  "refinedTitle": "提炼后的选题标题（更有吸引力，15字以内）",
  "coreAngle": "最佳切入角度描述（30字以内）",
  "evaluation": {
    "viralScore": 85,
    "differentiationScore": 72,
    "commercialScore": 68,
    "summary": "一句话总评（30字以内）",
    "strengths": ["优势1", "优势2"],
    "suggestions": ["改进建议1", "改进建议2"]
  },
  "recommendedPlatforms": ["小红书", "公众号"],
  "contentType": "graphic"
}

只输出 JSON，不要其他文字。`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("Evaluate topic error:", error);
    return NextResponse.json({ error: "评估失败，请重试" }, { status: 500 });
  }
}
