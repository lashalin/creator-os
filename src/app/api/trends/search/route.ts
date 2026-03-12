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

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

// ─── Google News RSS (works everywhere, no API key needed) ────────────────────

function getAfterDate(tr: TimeRange): string {
  const d = new Date();
  if (tr === "24h") d.setDate(d.getDate() - 1);
  else if (tr === "48h") d.setDate(d.getDate() - 2);
  else d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function parseRssItems(xml: string): ContentItem[] {
  const items: ContentItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null && items.length < 10) {
    const block = m[1];
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>|<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

    if (!titleMatch) continue;
    let title = stripHtml(titleMatch[1] ?? titleMatch[2] ?? "").trim();
    // Strip " - Source Name" suffix that Google appends
    title = title.replace(/\s*[-–]\s*[^-–]{2,40}$/, "").trim();
    if (title.length < 5) continue;

    const url = linkMatch?.[1]?.trim();
    let heat: string | undefined;
    if (pubMatch) {
      try {
        heat = new Date(pubMatch[1]).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
      } catch { /* ignore */ }
    }

    items.push({ title, url, heat });
  }

  return items;
}

async function googleNewsSearch(
  query: string,
  tr: TimeRange,
  lang: "zh-CN" | "en-US" = "zh-CN"
): Promise<ContentItem[]> {
  const after = getAfterDate(tr);
  const fullQuery = `${query} after:${after}`;
  const ceid = lang === "zh-CN" ? "CN:zh-Hans" : "US:en";
  const hl = lang === "zh-CN" ? "zh-CN" : "en-US";
  const gl = lang === "zh-CN" ? "CN" : "US";

  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(fullQuery)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml);
  } catch {
    return [];
  }
}

// ─── Tavily (best quality, requires API key) ──────────────────────────────────

async function tavilySearch(query: string, domains: string[], days: number): Promise<ContentItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 10, days, include_domains: domains }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results ?? []).map((r: { title: string; url: string; published_date?: string }) => ({
      title: stripHtml(r.title),
      url: r.url,
      heat: r.published_date
        ? new Date(r.published_date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
        : undefined,
    }));
  } catch {
    return [];
  }
}

// ─── vvhan public trending API (for XHS, cached) ─────────────────────────────

interface VvhanItem { title: string; hot?: string; url?: string }

async function fetchVvhan(endpoint: string): Promise<VvhanItem[]> {
  try {
    const res = await fetch(`https://api.vvhan.com/api/hotlist/${endpoint}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return data?.success ? (data.data ?? []) : [];
  } catch {
    return [];
  }
}

function matchVvhan(items: VvhanItem[], keyword: string): { matched: VvhanItem[]; exact: boolean } {
  const exact = items.filter(i => i.title?.includes(keyword));
  if (exact.length >= 2) return { matched: exact, exact: true };
  const chars = keyword.replace(/\s/g, "").split("");
  const partial = items.filter(i => chars.some(c => i.title?.includes(c)));
  if (partial.length >= 2) return { matched: partial, exact: false };
  return { matched: items.slice(0, 10), exact: false };
}

// ─── Platform searches ────────────────────────────────────────────────────────

async function searchDouyin(keyword: string, tr: TimeRange): Promise<PlatformResult> {
  // 1. Tavily (best, needs key)
  if (process.env.TAVILY_API_KEY) {
    const days = tr === "24h" ? 1 : tr === "48h" ? 2 : 7;
    const items = await tavilySearch(`${keyword} 抖音 热门`, ["douyin.com"], days);
    if (items.length > 0) {
      return { platform: "douyin", label: "抖音", icon: "🎵", items: items.slice(0, 10) };
    }
  }

  // 2. Google News RSS — works without proxy
  const newsItems = await googleNewsSearch(`${keyword} 抖音`, tr, "zh-CN");
  if (newsItems.length > 0) {
    return {
      platform: "douyin",
      label: "抖音",
      icon: "🎵",
      items: newsItems,
    };
  }

  // 3. iesdouyin official billboard (filter by keyword)
  try {
    const res = await fetch(
      "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/?count=50",
      {
        headers: {
          "User-Agent": UA,
          Referer: "https://www.douyin.com/",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const list: Array<{ word_word: string; hot_value?: number }> = data?.word_list ?? [];
      if (list.length > 0) {
        const kw = keyword.replace(/\s/g, "");
        const chars = kw.split("");
        const matched = list.filter(i => chars.some(c => i.word_word?.includes(c)));
        const display = matched.length >= 2 ? matched : list;
        return {
          platform: "douyin",
          label: "抖音",
          icon: "🎵",
          items: display.slice(0, 10).map(i => ({
            title: i.word_word,
            heat: i.hot_value ? `${(i.hot_value / 10000).toFixed(1)}万` : undefined,
          })),
          error: matched.length >= 2 ? undefined : `未找到"${keyword}"精确匹配，显示抖音当前热门`,
        };
      }
    }
  } catch { /* fall through */ }

  return { platform: "douyin", label: "抖音", icon: "🎵", items: [], error: "暂时无法获取抖音数据" };
}

async function searchXhs(keyword: string, tr: TimeRange): Promise<PlatformResult> {
  // 1. Tavily
  if (process.env.TAVILY_API_KEY) {
    const days = tr === "24h" ? 1 : tr === "48h" ? 2 : 7;
    const items = await tavilySearch(`${keyword} 小红书`, ["xiaohongshu.com", "xhslink.com"], days);
    if (items.length > 0) {
      return { platform: "xiaohongshu", label: "小红书", icon: "📕", items: items.slice(0, 10) };
    }
  }

  // 2. vvhan xhsHot (works via Next.js cache)
  const vvItems = await fetchVvhan("xhsHot");
  if (vvItems.length > 0) {
    const { matched, exact } = matchVvhan(vvItems, keyword);
    return {
      platform: "xiaohongshu",
      label: "小红书",
      icon: "📕",
      items: matched.slice(0, 10).map(i => ({ title: i.title, heat: i.hot, url: i.url })),
      error: exact ? undefined : `未找到"${keyword}"精确匹配，显示小红书当前热门`,
    };
  }

  // 3. Google News RSS fallback
  const newsItems = await googleNewsSearch(`${keyword} 小红书`, tr, "zh-CN");
  if (newsItems.length > 0) {
    return {
      platform: "xiaohongshu",
      label: "小红书",
      icon: "📕",
      items: newsItems,
      error: "数据来源：Google 新闻（含小红书相关报道）",
    };
  }

  return { platform: "xiaohongshu", label: "小红书", icon: "📕", items: [], error: "暂时无法获取小红书数据" };
}

async function searchX(keyword: string, tr: TimeRange): Promise<PlatformResult> {
  // 1. Tavily
  if (process.env.TAVILY_API_KEY) {
    const days = tr === "24h" ? 1 : tr === "48h" ? 2 : 7;
    const items = await tavilySearch(keyword, ["x.com", "twitter.com"], days);
    if (items.length > 0) {
      return { platform: "x", label: "X", icon: "𝕏", items: items.slice(0, 10) };
    }
  }

  // 2. Google News RSS — search for X/Twitter content (English)
  const newsItemsEn = await googleNewsSearch(`${keyword} twitter`, tr, "en-US");
  if (newsItemsEn.length > 0) {
    return {
      platform: "x",
      label: "X",
      icon: "𝕏",
      items: newsItemsEn,
    };
  }

  // 3. Google News RSS — Chinese query as fallback
  const newsItemsZh = await googleNewsSearch(`${keyword} 推特 OR Twitter`, tr, "zh-CN");
  if (newsItemsZh.length > 0) {
    return {
      platform: "x",
      label: "X",
      icon: "𝕏",
      items: newsItemsZh,
    };
  }

  return { platform: "x", label: "X", icon: "𝕏", items: [], error: "X 数据暂时不可用" };
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
      searchDouyin(kw, timeRange),
      searchXhs(kw, timeRange),
      searchX(kw, timeRange),
    ]);

    return NextResponse.json({
      keyword: kw,
      timeRange,
      hasTavily: !!process.env.TAVILY_API_KEY,
      platforms: [douyinResult, xhsResult, xResult],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[trends/search] error:", error);
    return NextResponse.json({ error: "搜索失败，请稍后重试" }, { status: 500 });
  }
}
