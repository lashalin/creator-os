import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface ContentItem {
  title: string;
  heat?: string;
  url?: string;
}

export interface PlatformResult {
  platform: string;
  label: string;
  icon: string;
  items: ContentItem[];
  error?: string;
}

type TimeRange = "24h" | "48h" | "7d";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Days integer from timeRange */
function trToDays(tr: TimeRange) {
  return tr === "24h" ? 1 : tr === "48h" ? 2 : 7;
}

/** DuckDuckGo df parameter */
function trToDDG(tr: TimeRange) {
  return tr === "7d" ? "w" : "d"; // d = past day, w = past week
}

/** Strip HTML tags */
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ─── Primary: Tavily per-domain search ──────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}

async function tavilySearch(
  query: string,
  domains: string[],
  days: number
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const body = {
    api_key: apiKey,
    query,
    search_depth: "basic",
    max_results: 10,
    days,
    include_domains: domains,
  };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: days === 1 ? 300 : 900 },
  });

  if (!res.ok) return [];
  const data = await res.json();
  return (data?.results as TavilyResult[]) ?? [];
}

// ─── Fallback: DuckDuckGo HTML scraping (no API key needed) ─────────────────

async function ddgSearch(
  query: string,
  tr: TimeRange
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const df = trToDDG(tr);
  const encoded = encodeURIComponent(query);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encoded}&df=${df}&kl=cn-zh`,
      {
        headers: {
          "User-Agent": DESKTOP_UA,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://duckduckgo.com/",
        },
        signal: controller.signal,
        next: { revalidate: df === "d" ? 300 : 900 },
      }
    );
    clearTimeout(timer);
    if (!res.ok) return [];

    const html = await res.text();
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const seen = new Set<string>();

    // Parse <h2 class="result__title"> or <a class="result__a">
    const re =
      /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]{3,200}?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && results.length < 15) {
      const url = m[1];
      const title = stripHtml(m[2]);
      if (!title || title.length < 4 || seen.has(title)) continue;
      seen.add(title);
      results.push({ title, url, snippet: "" });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Per-platform search ─────────────────────────────────────────────────────

async function searchPlatform(
  keyword: string,
  tr: TimeRange,
  platform: "douyin" | "xiaohongshu" | "x"
): Promise<PlatformResult> {
  const days = trToDays(tr);

  const cfg: Record<
    "douyin" | "xiaohongshu" | "x",
    { label: string; icon: string; domains: string[]; queryPrefix: string }
  > = {
    douyin: {
      label: "抖音",
      icon: "🎵",
      domains: ["douyin.com"],
      queryPrefix: `${keyword} 抖音 热门视频`,
    },
    xiaohongshu: {
      label: "小红书",
      icon: "📕",
      domains: ["xiaohongshu.com", "xhslink.com"],
      queryPrefix: `${keyword} 小红书 热门笔记`,
    },
    x: {
      label: "X",
      icon: "𝕏",
      domains: ["x.com", "twitter.com"],
      queryPrefix: `${keyword}`,
    },
  };

  const { label, icon, domains, queryPrefix } = cfg[platform];

  // ── Try Tavily first ──
  try {
    const tavilyResults = await tavilySearch(queryPrefix, domains, days);
    if (tavilyResults.length > 0) {
      const items: ContentItem[] = tavilyResults
        .filter((r) => r.title && r.title.length > 2)
        .slice(0, 10)
        .map((r) => ({
          title: stripHtml(r.title),
          url: r.url,
          heat: r.published_date
            ? new Date(r.published_date).toLocaleDateString("zh-CN", {
                month: "numeric",
                day: "numeric",
              })
            : undefined,
        }));
      if (items.length > 0) {
        return { platform, label, icon, items };
      }
    }
  } catch {
    // fall through
  }

  // ── Fallback: DuckDuckGo with site: filter ──
  try {
    const siteQuery = `site:${domains[0]} ${keyword}`;
    const ddgResults = await ddgSearch(siteQuery, tr);
    if (ddgResults.length > 0) {
      const items: ContentItem[] = ddgResults
        .filter((r) => r.title.length > 2)
        .slice(0, 10)
        .map((r) => ({ title: r.title, url: r.url }));
      if (items.length > 0) {
        return { platform, label, icon, items };
      }
    }
  } catch {
    // fall through
  }

  // ── Last resort: broader DDG search mentioning the platform ──
  try {
    const broadQuery = `${keyword} site:${domains[0]}`;
    const ddgResults = await ddgSearch(broadQuery, "7d"); // no time limit
    if (ddgResults.length > 0) {
      const items: ContentItem[] = ddgResults.slice(0, 10).map((r) => ({
        title: r.title,
        url: r.url,
      }));
      return {
        platform,
        label,
        icon,
        items,
        error: "未找到时间范围内的内容，显示最近结果",
      };
    }
  } catch {
    // ignore
  }

  const noKeyMsg = !process.env.TAVILY_API_KEY
    ? "建议配置 TAVILY_API_KEY 获取更好的搜索结果"
    : undefined;

  return {
    platform,
    label,
    icon,
    items: [],
    error: noKeyMsg ?? "暂时无法获取该平台数据",
  };
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const keyword = req.nextUrl.searchParams.get("q");
    if (!keyword?.trim()) {
      return NextResponse.json({ error: "请输入关键词" }, { status: 400 });
    }

    const rawRange = req.nextUrl.searchParams.get("timerange") ?? "24h";
    const timeRange: TimeRange = ["24h", "48h", "7d"].includes(rawRange)
      ? (rawRange as TimeRange)
      : "24h";

    const kw = keyword.trim();

    const [douyinResult, xhsResult, xResult] = await Promise.all([
      searchPlatform(kw, timeRange, "douyin"),
      searchPlatform(kw, timeRange, "xiaohongshu"),
      searchPlatform(kw, timeRange, "x"),
    ]);

    const hasTavily = !!process.env.TAVILY_API_KEY;

    return NextResponse.json({
      keyword: kw,
      timeRange,
      hasTavily,
      platforms: [douyinResult, xhsResult, xResult],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[trends/search] error:", error);
    return NextResponse.json(
      { error: "搜索失败，请稍后重试" },
      { status: 500 }
    );
  }
}
