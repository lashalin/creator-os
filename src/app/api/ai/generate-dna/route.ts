import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

function toStr(val: unknown): string {
  if (!val) return "未填写";
  if (Array.isArray(val)) return val.join("、");
  return String(val);
}

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
- 背景/自我介绍：${toStr(background)}
- 主要创作主题：${toStr(topics)}
- 不想创作的内容：${toStr(avoidContent)}
- 表达风格：${toStr(expressionStyle)}
- 目标受众：${toStr(targetAudience)}
- 参考的创作者：${toStr(referenceCreators)}
- 主要平台：${toStr(platforms)}
- 创作目标：${toStr(goals)}

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

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse JSON from response");

    const dna = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ dna });
  } catch (error) {
    console.error("Generate DNA error:", error);
    return NextResponse.json({ error: "生成失败，请重试" }, { status: 500 });
  }
}
