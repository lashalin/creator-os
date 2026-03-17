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

    const { topic, material, locale } = await req.json();
    if (!topic && !material) {
      return NextResponse.json({ error: "请提供话题或素材" }, { status: 400 });
    }

    const isEn = locale === "en";

    const inputContent = material
      ? (isEn ? `User's raw material:\n${material.slice(0, 2000)}` : `用户提供的原始素材：\n${material.slice(0, 2000)}`)
      : (isEn ? `User's topic idea: ${topic}` : `用户想写的话题：${topic}`);

    const prompt = isEn
      ? `You are a senior content strategy advisor specializing in evaluating content topic potential.

${inputContent}

Deeply evaluate this topic/material and output JSON:
{
  "refinedTitle": "Refined topic title (compelling, under 15 words)",
  "coreAngle": "Best angle description (under 30 words)",
  "evaluation": {
    "viralScore": 85,
    "differentiationScore": 72,
    "commercialScore": 68,
    "summary": "One-sentence overall assessment (under 30 words)",
    "strengths": ["Strength 1", "Strength 2"],
    "suggestions": ["Improvement 1", "Improvement 2"]
  },
  "recommendedPlatforms": ["X", "YouTube"],
  "contentType": "graphic"
}

Output JSON only, no other text.`
      : `你是一位资深内容策略顾问，擅长评估内容选题潜力。

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

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("Evaluate topic error:", error);
    return NextResponse.json({ error: "评估失败，请重试" }, { status: 500 });
  }
}
