import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { keyword } = await req.json();
    if (!keyword) {
      return NextResponse.json({ error: "请输入关键词" }, { status: 400 });
    }

    const prompt = `你是一位深谙各大内容平台（小红书、公众号、抖音、B站、X/Twitter）爆款规律的内容策划专家。

用户想围绕关键词「${keyword}」进行创作，请模拟分析该关键词在各平台的热门内容趋势，生成 6 个选题建议。

每个选题应该：
1. 基于该关键词的真实创作方向和受众痛点
2. 标题具有吸引力，符合平台风格
3. 角度独特，避免同质化

输出 JSON 数组格式：
[
  {
    "title": "选题标题（参考平台爆款风格）",
    "angle": "独特切入角度（30字以内）",
    "viralScore": 82,
    "matchScore": 75,
    "competitionLevel": "中",
    "platforms": ["小红书", "公众号"],
    "insight": "为什么这个选题会火（20字以内）"
  }
]

只输出 JSON 数组，不要有其他文字。`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON");

    const topics = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ topics });
  } catch (error) {
    console.error("Hot topics error:", error);
    return NextResponse.json({ error: "分析失败，请重试" }, { status: 500 });
  }
}
