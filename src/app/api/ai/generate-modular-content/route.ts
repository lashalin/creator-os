import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { creatorProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { checkAndIncrementUsage } from "@/lib/subscription";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

// ── Platform-specific prompt builders ─────────────────────────────────────

function buildPlatformPrompt(
  platform: string,
  contentType: string,
  topic: string,
  angle: string,
  dnaContext: string,
  qaContext: string,
  sourceMaterial: string
): string {
  const materialSection = sourceMaterial
    ? `\n参考素材（深度融入内容，与访谈内容相互印证）：\n${sourceMaterial}\n`
    : "";

  const base = `创作者DNA风格：${dnaContext}
话题：${topic}${angle ? `（角度：${angle}）` : ""}

用户深度访谈内容（第一手真实观点，必须融入）：
${qaContext}
${materialSection}`;

  // ── 口播逐字稿（所有平台通用，700字，3-5分钟）─────────────────────────
  if (contentType === "script") {
    return `你是专业内容创作者，请创作口播逐字稿。

${base}
【口播逐字稿规范 — 严格执行】
总字数：700字左右（对应3-5分钟口播）

结构如下，直接输出内容，不要写结构名称：
① 开场钩子（60-80字）：前10秒让人停下来，用反常识/痛点/直接结论开头，不说"大家好"
② 主体第一段（250-300字）：展开第一个核心观点，有真实细节和故事感
③ 主体第二段（200-250字）：第二个核心点，可以用对比/数据/案例支撑
④ 结尾（80-100字）：情感升华 + 明确的行动呼吁

语言硬性要求：
- 纯口语化，像真人说话，每句不超过15字
- 多用"说实话"、"你发现没有"、"举个例子"、"我发现"等口语连接词
- 可加[停顿][语气加重]等提示词
- 禁止：广告腔、长句子、markdown标题格式、括号标注结构名称

直接输出稿子内容，不要任何前言、结构说明或解释。`;
  }

  // ── 小红书（图文，500-800字）────────────────────────────────────────────
  if (platform === "小红书") {
    return `你是专业小红书博主，请创作小红书图文内容。

${base}
【小红书创作规范 — 严格执行】

按以下格式输出（直接开始，不要写"标题选项："这样的说明）：

第一部分：给3个标题选项，每行一个，含emoji，≤30字，有钩子感和好奇心
（格式：每行直接写标题，3行标题之间空一行）

---

第二部分：正文（500-800字）
- 第一句直接给价值，不废话不寒暄
- 有emoji点缀关键点（每段1-2个）
- 3-4个干货要点，每点有具体内容和细节
- 口语化，像真实用户分享亲身经历，有"我"的视角
- 可以有真实的踩坑经历或惊喜发现

---

第三部分：话题标签（6-10个，热门+垂类混合）
格式：#标签1 #标签2 #标签3...

直接输出内容，不要任何前言或说明文字。`;
  }

  // ── 公众号（文章形式，1500-2000字）─────────────────────────────────────
  if (platform === "公众号") {
    return `你是专业公众号作者，请创作公众号深度文章。

${base}
【公众号文章规范 — 严格执行】

按以下结构直接输出文章（不要写"标题："这样的标注，直接开始正文）：

第一行：文章标题（30字以内，有吸引力，可含数字/反问/悬念）

空一行

开篇引言（150-200字）：用故事、真实场景或反常识开头，快速建立共鸣，让读者有"这说的就是我"的感觉

## 小标题一（8字以内，精炼有力）
[段落内容，350-500字，有论证、有案例、有细节，深入展开]

## 小标题二（8字以内）
[段落内容，350-500字，可加数据对比或具体方法]

## 小标题三（8字以内）
[段落内容，350-500字，可以是方法论或升华视角]

结语（100-150字）：金句式总结 + 引导读者留言或转发的互动问题

总字数：1500-2000字
语气：有深度有温度，像一位智识型朋友在认真分享，不说废话

直接输出完整文章，不要任何前言或说明。`;
  }

  // ── X / Twitter（推文串）────────────────────────────────────────────────
  if (platform === "X") {
    return `你是专业X/Twitter创作者，请创作推文串。

${base}
【X推文规范 — 严格执行】

输出3条推文组成的Thread，格式如下：

1/ [内容，≤140中文字，核心观点，有冲击力，直接出结论，不废话不铺垫]

2/ [内容，≤140中文字，展开论据，可用数据/对比/具体案例支撑第一条]

3/ [内容，≤140中文字，互动收尾，提出能引发思考的问题，或明确的行动号召]

语气：直接、有观点、可以犀利，像一个有独立见解的人在说话
每个字都要有价值，禁止废话套话和过渡句

直接输出3条推文，不要任何前言。`;
  }

  // ── Instagram ────────────────────────────────────────────────────────────
  if (platform === "Instagram") {
    return `你是Instagram内容创作者，请创作配图文案。

${base}
【Instagram文案规范】

正文（150-300字）：
- 开头：强烈的视觉感或情绪，直接抓住眼球
- 中间：真实故事 + 洞见，有画面感
- 结尾：一个能引发互动的问题

空一行后输出hashtags：
- 5-8个英文hashtag（相关性强的，不是随便堆砌）
- 2-3个中文标签

语气：真实、生活化、有温度

直接输出文案，不要前言说明。`;
  }

  // ── YouTube ──────────────────────────────────────────────────────────────
  if (platform === "YouTube") {
    return `你是YouTube内容创作者，请创作视频文本内容。

${base}
【YouTube内容规范】

按以下结构输出（直接写内容，不写"视频标题："这样的标注）：

第一行：视频标题（60字以内，SEO友好，有点击欲，包含核心关键词）

空一行

视频描述（200字左右）：
前两行最重要，简述视频能给观众带来什么价值
包含1-2个核心关键词
结尾加"记得点击订阅"等CTA

空一行

视频大纲（口播参考）：
0:00 开场（说明视频价值，30秒内）
[按内容分段列出时间轴和每段要点]
结尾 CTA（订阅/点赞/评论）

直接输出，不要前言说明。`;
  }

  // ── 抖音（短视频口播，300-400字，1分钟）────────────────────────────────
  if (platform === "抖音") {
    return `你是抖音创作者，请创作抖音短视频口播脚本。

${base}
【抖音口播规范 — 严格执行】
总字数：300-400字（对应1分钟左右短视频）

直接输出脚本，按以下节奏：
① 开头0-3秒（≤20字）：直接给结论或制造冲突，不说"大家好我是XX"
② 主体（用"第一""第二""第三"串联3个要点，每个要点2-3句话）
③ 结尾（1句话行动引导：关注/评论/收藏）

语言要求：
- 每句话不超过15字，节奏快
- 口语化，不说书面语
- 禁止："大家好"、"今天给大家"、"首先"等废话开头

直接输出脚本，不要任何前言和标注。`;
  }

  // ── 默认 ─────────────────────────────────────────────────────────────────
  return `你是专业内容创作者，请为${platform}平台创作内容。

${base}
要求：
- 适配${platform}平台的风格和受众习惯
- 内容有价值，融入创作者DNA风格
- 自然真实，有个人观点
- 总字数400-600字

直接输出内容，不要任何前言。`;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const {
      topic,
      angle,
      platform,
      contentType,
      qaAnswers,
      sourceMaterial,
    } = await req.json();

    if (!topic || !platform) {
      return NextResponse.json({ error: "请提供话题和平台" }, { status: 400 });
    }

    // Check usage limit
    const usage = await checkAndIncrementUsage(session.user.id, "generate_content");
    if (!usage.allowed) {
      return NextResponse.json(
        { error: "LIMIT_REACHED", used: usage.used, limit: usage.limit },
        { status: 429 }
      );
    }

    // Get creator DNA
    const profiles = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, session.user.id))
      .limit(1);

    const profile = profiles[0];
    const dna = profile?.dna;

    const dnaContext = dna
      ? `人设：${dna.persona}；语言风格：${dna.languageStyle}；差异点：${dna.differentiation}；爆款规律：${dna.viralPattern}；目标受众：${profile?.targetAudience || "普通大众"}`
      : "专业内容创作者，自然真实风格，注重干货和实用性";

    const qaContext =
      qaAnswers && qaAnswers.length > 0
        ? qaAnswers
            .filter((qa: { answer: string }) => qa.answer?.trim())
            .map(
              (qa: { question: string; answer: string }) =>
                `Q: ${qa.question}\nA: ${qa.answer}`
            )
            .join("\n\n")
        : "暂无访谈内容";

    const material = (sourceMaterial || "").trim();

    const prompt = buildPlatformPrompt(
      platform,
      contentType,
      topic,
      angle || "",
      dnaContext,
      qaContext,
      material
    );

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const content = result.response.text().trim();

    return NextResponse.json({ content });
  } catch (error) {
    console.error("Generate content error:", error);
    return NextResponse.json({ error: "生成失败，请重试" }, { status: 500 });
  }
}
