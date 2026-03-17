import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { topic, angle, locale } = await req.json();
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
    const isEn = locale === "en";

    const prompt = isEn
      ? `You are a content coach who uses first-principles thinking to uncover a creator's deepest insights.

The creator wants to create content about "${topic}"${angle ? ` (angle: ${angle})` : ""}.
Creator background: ${dna?.persona || "content creator"}, style: ${dna?.languageStyle || "authentic"}

Design 6 progressive questions using first principles to:
1. Uncover the creator's genuine thoughts and unique perspective
2. Find personal experiences and concrete examples that support their view
3. Identify unconventional angles that give the content a soul

Question layers:
- Layer 1 "Essence": Ask about the root cause or fundamental truth of this topic
- Layer 2 "Experience": Uncover a personal experience or turning point
- Layer 3 "Thesis": Find the one core argument the creator most wants to make
- Layer 4 "Counter-intuitive": Challenge conventional wisdom, find your different take
- Layer 5 "Evidence": Find a specific story/case/data point to support the argument
- Layer 6 "Value": What's the one thing readers should walk away with?

Output a JSON array (exactly 6 questions):
[
  {
    "id": "q1",
    "layer": "Essence",
    "question": "Question (conversational, like a friend chatting, under 20 words)",
    "hint": "Answer prompt (under 10 words)"
  }
]

Output JSON array only, no other text.`
      : `你是一位用「第一性原理」挖掘创作者深层思考的内容教练。

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

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON");

    const questions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("Generate questions error:", error);
    return NextResponse.json({ error: "生成问题失败，请重试" }, { status: 500 });
  }
}
