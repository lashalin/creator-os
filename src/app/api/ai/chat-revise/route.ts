import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const {
      currentContent,
      userMessage,
      chatHistory,
      topic,
      platform,
      contentType,
      locale,
    }: {
      currentContent: string;
      userMessage: string;
      chatHistory: ChatMessage[];
      topic: string;
      platform: string;
      contentType: string;
      locale?: string;
    } = await req.json();

    if (!currentContent?.trim() || !userMessage?.trim()) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // Get creator DNA for style consistency
    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const dna = profiles[0]?.dna;
    const isEn = locale === "en";

    const dnaStyle = dna
      ? isEn
        ? `Creator style: ${dna.languageStyle}, persona: ${dna.persona}`
        : `创作者风格：${dna.languageStyle}，人设：${dna.persona}`
      : isEn
      ? "Natural and authentic creator style"
      : "自然真实的创作者风格";

    // Build conversation history context
    const historyText =
      chatHistory && chatHistory.length > 0
        ? isEn
          ? "\nConversation history:\n" +
            chatHistory
              .map((m) => `${m.role === "user" ? "User" : "AI Assistant"}: ${m.content}`)
              .join("\n") +
            "\n"
          : "\n对话记录：\n" +
            chatHistory
              .map((m) => `${m.role === "user" ? "用户" : "AI助手"}：${m.content}`)
              .join("\n") +
            "\n"
        : "";

    const isScript = contentType === "script";

    const prompt = isEn
      ? `You are a professional AI content editor helping a creator revise their ${isScript ? "script" : `${platform} post`}.

${dnaStyle}
Topic: ${topic}
Platform: ${platform}
${historyText}
Current content:
---
${currentContent}
---

User's revision request: ${userMessage}

Please revise the content according to the user's request:
1. Accurately understand the user's intent and make precise edits
2. Maintain the creator's language style
3. Ensure the revised content still fits ${platform} platform norms
4. Make changes flow naturally without visible edit marks
5. If it's a script, maintain conversational tone and rhythm

Return ONLY the following JSON format, no other text:
{"updatedContent":"the complete revised content","message":"one sentence describing what was changed"}`
      : `你是专业内容编辑AI助手，正在帮助创作者修改${isScript ? "口播稿" : `${platform}图文`}内容。

${dnaStyle}
话题：${topic}
平台：${platform}
${historyText}
当前内容：
---
${currentContent}
---

用户的修改要求：${userMessage}

请根据用户要求修改内容，注意：
1. 准确理解用户意图，精准修改
2. 保持创作者的语言风格不变
3. 修改后内容仍符合${platform}平台规范
4. 改动自然流畅，不留修改痕迹
5. 如果是口播稿，保持口语化和节奏感

严格按照以下JSON格式返回，不要输出任何其他文字：
{"updatedContent":"修改后的完整内容","message":"一句话说明做了什么修改"}`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("AI response did not contain valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.updatedContent) {
      throw new Error("AI response missing updatedContent");
    }

    return NextResponse.json({
      updatedContent: parsed.updatedContent,
      assistantMessage: parsed.message || (isEn ? "Done! Content updated as requested." : "已根据你的要求修改"),
    });
  } catch (error) {
    console.error("Chat revise error:", error);
    return NextResponse.json({ error: "修改失败，请重试" }, { status: 500 });
  }
}
