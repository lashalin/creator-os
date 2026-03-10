import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkAndIncrementUsage } from "@/lib/subscription";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const PLATFORM_INSTRUCTIONS: Record<string, string> = {
  小红书: "小红书风格：标题带emoji，正文分段清晰，多用「|」「✨」「💡」等符号，结尾加话题标签 #xxx，语气亲切活泼，适合图文笔记",
  公众号: "公众号风格：标题引人深思，正文有小标题，段落间有间距，可以有金句，语气专业但不枯燥，适合长文阅读",
  X: "X/Twitter风格：简洁有力，控制在280字符内（中文约140字），可以是观点/洞见/故事开头，结尾可以提问引发互动",
  Instagram: "Instagram风格：视觉感强的描述，正文简洁但有画面感，结尾加相关话题标签，语气阳光积极",
  YouTube: "YouTube脚本风格：开头3秒吸引注意力（制造悬念/提问/惊喜），有清晰的内容结构，适合口播，每段10-30秒，结尾有CTA",
  抖音: "抖音口播风格：开头直接抛出核心内容，节奏快，用「第一」「第二」「第三」等数字串联，每句话短而有力，适合竖屏短视频",
};

const CONTENT_TYPE_INSTRUCTIONS: Record<string, string> = {
  graphic: "图文内容：生成适合图文发布的完整文案，包括标题、正文和结语",
  script: "口播逐字稿：生成适合真人出镜口播的逐字稿，要自然流畅，像说话而不是写文章，可以加上[停顿][重音]等口播标记",
};

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { title, angle, platform, contentType, additionalContext } = await req.json();

    // Check usage limits
    const usage = await checkAndIncrementUsage(session.user.id, "generate_content");
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

    const platformInstruction = PLATFORM_INSTRUCTIONS[platform] || `${platform}平台风格：适配该平台的内容规范`;
    const typeInstruction = CONTENT_TYPE_INSTRUCTIONS[contentType] || CONTENT_TYPE_INSTRUCTIONS.graphic;

    const prompt = `你是一位专业的内容创作者，帮助个人创作者生成高质量、个性化的内容。

**创作者 DNA：**
- 人设：${dna?.persona || "专业内容创作者"}
- 语言风格：${dna?.languageStyle || "自然亲切"}
- 核心差异：${dna?.differentiation || ""}
- 爆款规律：${dna?.viralPattern || ""}
- 目标受众：${profile?.targetAudience || "普通大众"}

**本次创作任务：**
- 选题标题：${title}
- 创作角度：${angle || "根据选题自由发挥"}
- 目标平台：${platform}
- 内容类型：${contentType === "graphic" ? "图文" : "口播逐字稿"}
${additionalContext ? `- 补充说明：${additionalContext}` : ""}

**平台规范：**
${platformInstruction}

**内容类型要求：**
${typeInstruction}

请严格按照创作者 DNA 的风格，生成完整的内容。内容要100%符合创作者的个人风格，读起来像是他/她亲自写的。

直接输出内容，不需要任何解释或前言。`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ content: text });
  } catch (error) {
    console.error("Generate content error:", error);
    return NextResponse.json({ error: "生成失败，请重试" }, { status: 500 });
  }
}
