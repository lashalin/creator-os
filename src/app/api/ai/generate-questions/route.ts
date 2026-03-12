import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { topic, angle } = await req.json();
    if (!topic) {
      return NextResponse.json({ error: "请提供话题" }, { status: 400 });
    }

    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const profile = profiles[0];
    const dna = profile?.dna;

    const prompt = `你是一位用「第一性原理」挖掘创作者深层思考的内容教练。

创作者想围绕「${topic}」${angle ? `（角度：${angle}）` : ""}进行内容创作。
创作者背景：${dna?.persona || "内容创作者"}，风格：${dna?.languageStyle || "真实个性"}

请用第一性原理设计 6 个层层递进的问题，目标是：
1. 挖掘创作者真实想法和独特观点
2. 找到支撑观点的亲身经历和具体案例
3. 识别与众不同的视角，让内容有灵魂

问题层次设计：
- Layer 1「本质」：追问这个话题最底层的原因或本质
- Layer 2「经历」：挖掘创作者的亲身经历或转折点
- Layer 3「观点」：找到创作者最核心想表达的一个论点
- Layer 4「反直觉」：挑战大众认知，找到你的不同看法
- Layer 5「证据」：寻找具体故事/案例/数据支撑观点
- Layer 6「价值」：读者看完最想拿走什么？

输出 JSON 数组（严格 6 个问题）：
[
  {
    "id": "q1",
    "layer": "本质追问",
    "question": "问题（40字以内，口语化，像朋友在聊天）",
    "hint": "回答提示（15字以内）"
  }
]

只输出 JSON 数组，不要其他文字。`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (message.content[0] as { type: string; text: string }).text;

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON");

    const questions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Generate questions error:", error);
    return NextResponse.json({ error: "生成问题失败，请重试" }, { status: 500 });
  }
}
