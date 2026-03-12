import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

interface ContentBlock {
  id: string;
  type: string;
  label: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const {
      blocks,
      instruction,
      topic,
      platform,
      contentType,
      qaAnswers,
      sourceMaterial,
    }: {
      blocks: ContentBlock[];
      instruction: string;
      topic: string;
      platform: string;
      contentType: string;
      qaAnswers?: Array<{ question: string; answer: string }>;
      sourceMaterial?: string;
    } = await req.json();

    if (!blocks?.length || !instruction?.trim()) {
      return NextResponse.json({ error: "请提供内容和修改意见" }, { status: 400 });
    }

    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const dna = profiles[0]?.dna;
    const dnaContext = dna
      ? `人设：${dna.persona}；风格：${dna.languageStyle}；差异点：${dna.differentiation}`
      : "专业内容创作者，自然真实风格";

    const qaContext =
      qaAnswers && qaAnswers.length > 0
        ? qaAnswers
            .filter((qa) => qa.answer?.trim())
            .map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`)
            .join("\n\n")
        : "";

    // Build current content representation
    const currentContent = blocks
      .map((b) => `【${b.label}】\n${b.content}`)
      .join("\n\n---\n\n");

    // Build blocks spec for output
    const blocksSpec = blocks
      .map((b) => `  {"id":"${b.id}","type":"${b.type}","label":"${b.label}","content":"此处填写修改后的内容"}`)
      .join(",\n");

    const prompt = `你是专业内容编辑，帮助创作者按照修改意见优化内容。

**创作者风格：** ${dnaContext}
**话题：** ${topic} | **平台：** ${platform} | **类型：** ${contentType === "script" ? "口播逐字稿" : "图文"}
${sourceMaterial ? `**原始素材：** ${sourceMaterial.slice(0, 500)}` : ""}
${qaContext ? `**访谈背景：**\n${qaContext}` : ""}

**当前内容：**
${currentContent}

**用户修改意见：**
${instruction}

**修改要求：**
1. 严格按照用户的修改意见进行调整，准确理解用户意图
2. 保持创作者DNA风格不变
3. 只修改需要改动的部分，其他内容尽量保留原意
4. 继续符合${platform}平台的规范要求
5. 修改后的内容要自然流畅，不留修改痕迹

**输出格式（严格JSON数组，不输出任何其他文字）：**
[
${blocksSpec}
]`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");

    const rawBlocks = JSON.parse(jsonMatch[0]);

    // Merge, preserving original block structure
    const revised = blocks.map((orig) => {
      const updated = rawBlocks.find((b: { id: string; content?: string }) => b.id === orig.id);
      return {
        id: orig.id,
        type: orig.type,
        label: orig.label,
        content: updated?.content || orig.content,
      };
    });

    return NextResponse.json({ blocks: revised });
  } catch (error) {
    console.error("Revise content error:", error);
    return NextResponse.json({ error: "修改失败，请重试" }, { status: 500 });
  }
}
