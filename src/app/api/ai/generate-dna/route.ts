import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { background, topics, avoidContent, expressionStyle, targetAudience, referenceCreators, platforms, goals, pastContent } = body;

    const pastContentSummary = pastContent && pastContent.length > 0
      ? pastContent.map((c: { text: string; isViral: boolean; label: string }) =>
          `[${c.isViral ? "爆款" : "普通"}${c.label ? " - " + c.label : ""}]\n${c.text.slice(0, 300)}`
        ).join("\n\n---\n\n")
      : "暂无历史内容";

    const prompt = `你是一位专业的内容创作顾问，帮助个人创作者建立专属的"创作者 DNA"档案。

请根据以下信息，生成一份结构化的创作者 DNA：

**创作者信息：**
- 背景/自我介绍：${background || "未填写"}
- 主要创作主题：${Array.isArray(topics) ? topics.join("、") : topics || "未填写"}
- 不想创作的内容：${avoidContent || "未填写"}
- 表达风格：${expressionStyle || "未填写"}
- 目标受众：${targetAudience || "未填写"}
- 参考的创作者：${referenceCreators || "未填写"}
- 主要平台：${Array.isArray(platforms) ? platforms.join("、") : platforms || "未填写"}
- 创作目标：${goals || "未填写"}

**历史内容样本：**
${pastContentSummary}

请以 JSON 格式输出创作者 DNA，包含以下字段：
{
  "tags": ["3-5个关键词标签，描述该创作者的核心特征"],
  "differentiation": "一句话描述该创作者与众不同的核心差异点（30字以内）",
  "persona": "创作者人设描述，包括身份、风格、价值观（50字以内）",
  "languageStyle": "语言风格描述，如：幽默接地气、专业深度、温暖鼓励等（30字以内）",
  "viralPattern": "基于历史内容总结的爆款规律，如果没有历史内容则根据方向推测（50字以内）",
  "platformPriority": ["按优先级排列的平台列表，最多5个"]
}

只输出 JSON，不要有其他文字。`;

    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    // Extract JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from response");
    }

    const dna = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ dna });
  } catch (error) {
    console.error("Generate DNA error:", error);
    return NextResponse.json(
      { error: "生成失败，请重试" },
      { status: 500 }
    );
  }
}
