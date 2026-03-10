import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkAndIncrementUsage } from "@/lib/subscription";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const PLATFORM_STYLES: Record<string, string> = {
  小红书: "小红书风格：标题含emoji，正文分段，多用「✨」「💡」「|」符号，亲切活泼，结尾加话题标签",
  公众号: "公众号风格：标题引人深思，有小标题和金句，语气专业但不枯燥，适合深度长文",
  X: "X/Twitter风格：简洁有力，中文140字以内，直击要点，结尾可提问引发互动",
  Instagram: "Instagram风格：有画面感，简洁，结尾加相关话题标签，语气阳光积极",
  YouTube: "YouTube脚本：开头3秒抓眼球，结构清晰，适合口播，每段10-30秒，结尾有CTA",
  抖音: "抖音口播：开头直接抛核心，节奏快，每句短而有力，适合竖屏短视频",
};

const BLOCK_DEFINITIONS = [
  { id: "headline", label: "🎯 爆款标题", type: "headline" },
  { id: "intro", label: "🪝 开篇钩子", type: "intro" },
  { id: "core", label: "💡 核心观点", type: "core" },
  { id: "story", label: "📖 故事案例", type: "story" },
  { id: "solution", label: "🔧 方法干货", type: "solution" },
  { id: "cta", label: "📣 结尾行动", type: "cta" },
];

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { topic, angle, platform, contentType, qaAnswers, regenerateBlock } = await req.json();

    if (!topic || !platform) {
      return NextResponse.json({ error: "请提供话题和平台" }, { status: 400 });
    }

    // Only check/increment usage for full generation, not single block regeneration
    if (!regenerateBlock) {
      const usage = await checkAndIncrementUsage(session.user.id, "generate_content");
      if (!usage.allowed) {
        return NextResponse.json(
          { error: "LIMIT_REACHED", used: usage.used, limit: usage.limit },
          { status: 429 }
        );
      }
    }

    // Get creator DNA
    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const profile = profiles[0];
    const dna = profile?.dna;

    const platformStyle = PLATFORM_STYLES[platform] || `${platform}平台风格：适配该平台的内容规范`;
    const typeLabel = contentType === "script" ? "口播逐字稿" : "图文内容";

    // Format Q&A answers
    const qaContext = qaAnswers && qaAnswers.length > 0
      ? qaAnswers
          .filter((qa: { question: string; answer: string }) => qa.answer?.trim())
          .map((qa: { question: string; answer: string }) => `Q: ${qa.question}\nA: ${qa.answer}`)
          .join("\n\n")
      : "暂无用户访谈内容";

    const dnaContext = dna
      ? `人设：${dna.persona}；风格：${dna.languageStyle}；差异点：${dna.differentiation}；爆款规律：${dna.viralPattern}`
      : "专业内容创作者，自然真实风格";

    if (regenerateBlock) {
      // Single block regeneration
      const blockDef = BLOCK_DEFINITIONS.find((b) => b.id === regenerateBlock);
      if (!blockDef) {
        return NextResponse.json({ error: "无效的内容块" }, { status: 400 });
      }

      const blockPrompts: Record<string, string> = {
        headline: `生成3个不同风格的爆款标题选项，用「|」分隔，每个30字以内，要有吸引力和点击欲`,
        intro: `写一段开篇钩子（150字以内），让读者第一句话就想继续读下去`,
        core: `提炼2-3个核心观点（每条1-2句），要有独特视角，不是大众共识`,
        story: `写一个真实有画面感的故事/案例（200字以内），支撑上述核心观点`,
        solution: `列出3-5条实用方法或干货建议，每条30字以内，要可操作落地`,
        cta: `写一段结尾召唤行动（80字以内），引导读者互动或分享，自然不生硬`,
      };

      const prompt = `你是专业内容创作者，风格参考创作者DNA：${dnaContext}

话题：${topic}${angle ? `（角度：${angle}）` : ""}
平台：${platform}（${platformStyle}）
类型：${typeLabel}

用户核心想法（来自访谈）：
${qaContext}

任务：重新生成「${blockDef.label}」板块内容。
${blockPrompts[regenerateBlock] || "生成该板块内容"}

要求：
- 融入用户访谈中的真实观点和故事
- 符合创作者DNA风格，像他/她亲自写的
- 符合${platform}平台规范
- 直接输出内容，不加标签或解释`;

      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const result = await model.generateContent(prompt);
      const content = result.response.text().trim();

      return NextResponse.json({
        block: { ...blockDef, content },
      });
    }

    // Full content generation
    const prompt = `你是专业内容创作者，帮助创作者把想法变成有灵魂的内容。

**创作者 DNA：**
${dnaContext}

**创作任务：**
- 话题：${topic}${angle ? `（角度：${angle}）` : ""}
- 平台：${platform}
- 类型：${typeLabel}

**平台风格要求：**
${platformStyle}

**用户深度访谈（第一手观点，必须融入内容）：**
${qaContext}

**任务：**
生成6个内容模块，每个模块独立可编辑，整体结构完整：

输出严格遵循以下 JSON 格式（6个块）：
[
  {
    "id": "headline",
    "type": "headline",
    "label": "🎯 爆款标题",
    "content": "给出3个标题选项，用换行分隔，每个30字以内"
  },
  {
    "id": "intro",
    "type": "intro",
    "label": "🪝 开篇钩子",
    "content": "150字以内开篇，让读者第一句就想继续"
  },
  {
    "id": "core",
    "type": "core",
    "label": "💡 核心观点",
    "content": "2-3个核心论点，每条1-2句，要有独特视角"
  },
  {
    "id": "story",
    "type": "story",
    "label": "📖 故事案例",
    "content": "基于用户访谈，200字以内真实故事或案例"
  },
  {
    "id": "solution",
    "type": "solution",
    "label": "🔧 方法干货",
    "content": "3-5条可操作建议，每条30字以内"
  },
  {
    "id": "cta",
    "type": "cta",
    "label": "📣 结尾行动",
    "content": "80字以内结尾CTA，引导互动，自然不生硬"
  }
]

关键要求：
1. 必须将用户访谈中的真实观点、经历、案例融入内容
2. 严格按照创作者DNA风格，像他/她亲自写的
3. 内容有灵魂，不是模板化的通用内容
4. 只输出 JSON 数组，不要其他文字`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");

    const blocks = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("Generate modular content error:", error);
    return NextResponse.json({ error: "生成失败，请重试" }, { status: 500 });
  }
}
