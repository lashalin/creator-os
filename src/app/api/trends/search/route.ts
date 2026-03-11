import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface KeywordTrendResult {
  keyword: string;
  relatedTopics: string[];
  relatedQueries: string[];
  peakRegions?: string[];
}

// Search Google Trends for a specific keyword — related queries
async function searchGoogleTrend(keyword: string): Promise<KeywordTrendResult> {
  const encoded = encodeURIComponent(keyword);

  // Google Trends related queries via RSS (no API key)
  const url = `https://trends.google.com/trends/api/autocomplete/${encoded}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    next: { revalidate: 1800 },
  });

  const relatedTopics: string[] = [];
  const relatedQueries: string[] = [];

  if (res.ok) {
    const text = await res.text();
    // Google returns ")]}',\n" prefix + JSON
    const jsonText = text.replace(/^\)\]\}',\n/, "");
    try {
      const data = JSON.parse(jsonText);
      const suggestions: Array<{ title?: string; type?: string }> =
        data?.default?.topics ?? [];
      suggestions.slice(0, 10).forEach((s) => {
        if (s.title) relatedTopics.push(s.title);
      });
    } catch {
      // ignore parse errors
    }
  }

  // Supplement with Douyin search suggestions (vvhan)
  try {
    const douyinRes = await fetch(
      `https://api.vvhan.com/api/hotlist/search?keyword=${encoded}&type=douyin`,
      { next: { revalidate: 1800 } }
    );
    if (douyinRes.ok) {
      const d = await douyinRes.json();
      const list: Array<{ title?: string; word?: string }> = d?.data ?? [];
      list.slice(0, 10).forEach((item) => {
        const kw = item.word ?? item.title;
        if (kw) relatedQueries.push(kw);
      });
    }
  } catch {
    // ignore
  }

  return { keyword, relatedTopics, relatedQueries };
}

// Search Douyin for related hot keywords via vvhan or suggestion API
async function searchDouyinKeyword(keyword: string): Promise<string[]> {
  const encoded = encodeURIComponent(keyword);
  try {
    const res = await fetch(
      `https://www.douyin.com/aweme/v1/search/suggest/keywords/?keyword=${encoded}&count=10`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
          Referer: "https://www.douyin.com/",
        },
        next: { revalidate: 1800 },
      }
    );
    if (res.ok) {
      const data = await res.json();
      const words: Array<{ word?: string }> = data?.data?.words ?? [];
      return words.map((w) => w.word ?? "").filter(Boolean).slice(0, 10);
    }
  } catch {
    // ignore
  }
  return [];
}

// Search X/Twitter trends related to a keyword via trends24.in HTML
async function searchXKeyword(keyword: string): Promise<string[]> {
  const encoded = encodeURIComponent(keyword);
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36";

  try {
    // Use Twitter search to find related hashtags / trending terms
    const res = await fetch(
      `https://trends24.in/search/?q=${encoded}`,
      {
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
        next: { revalidate: 1800 },
      }
    );
    if (res.ok) {
      const html = await res.text();
      const results: string[] = [];
      const seen = new Set<string>();
      const re =
        /<a[^>]+href="https?:\/\/(?:twitter|x)\.com\/search\?q=[^"]*"[^>]*>([^<]{1,80})<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && results.length < 10) {
        const kw = m[1].trim();
        if (!kw || seen.has(kw)) continue;
        seen.add(kw);
        results.push(kw);
      }
      if (results.length > 0) return results;
    }
  } catch {
    // ignore
  }
  return [];
}

// ── Route handler ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const keyword = req.nextUrl.searchParams.get("q");
    if (!keyword || keyword.trim().length === 0) {
      return NextResponse.json({ error: "请输入关键词" }, { status: 400 });
    }

    const kw = keyword.trim();

    // Fetch from multiple sources in parallel
    const [googleResult, douyinKeywords, xKeywords] = await Promise.allSettled([
      searchGoogleTrend(kw),
      searchDouyinKeyword(kw),
      searchXKeyword(kw),
    ]);

    const googleTopics =
      googleResult.status === "fulfilled" ? googleResult.value.relatedTopics : [];
    const googleQueries =
      googleResult.status === "fulfilled" ? googleResult.value.relatedQueries : [];
    const douyinList =
      douyinKeywords.status === "fulfilled" ? douyinKeywords.value : [];
    const xList = xKeywords.status === "fulfilled" ? xKeywords.value : [];

    // Merge and deduplicate into a ranked list
    const seen = new Set<string>();
    const merged: Array<{ keyword: string; source: string }> = [];

    const add = (kw: string, source: string) => {
      const normalized = kw.trim();
      if (!normalized || seen.has(normalized.toLowerCase())) return;
      seen.add(normalized.toLowerCase());
      merged.push({ keyword: normalized, source });
    };

    douyinList.forEach((k) => add(k, "抖音"));
    xList.forEach((k) => add(k, "X"));
    googleTopics.forEach((k) => add(k, "Google"));
    googleQueries.forEach((k) => add(k, "Google"));

    return NextResponse.json({
      keyword: kw,
      results: merged.slice(0, 20),
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
