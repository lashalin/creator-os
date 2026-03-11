import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface TrendItem {
  keyword: string;
  heat?: string;
  tag?: string;
}

// ── Google Trends ────────────────────────────────────────
// Official daily trends JSON API. No key, updates daily, cached 1h.
async function fetchGoogleTrends(geo = "CN"): Promise<TrendItem[]> {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=zh-CN&geo=${geo}&ns=15`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Google Trends HTTP ${res.status}`);

  const text = await res.text();
  const jsonStr = text.replace(/^\)\]\}',\n/, "");
  const data = JSON.parse(jsonStr);
  const days: Array<{
    trendingSearches: Array<{
      title: { query: string };
      formattedTraffic?: string;
    }>;
  }> = data?.default?.trendingSearchesDays ?? [];

  if (!days.length) return [];
  return days[0].trendingSearches.slice(0, 20).map((s) => ({
    keyword: s.title.query,
    heat: s.formattedTraffic ?? "",
  }));
}

// ── 抖音热搜 ──────────────────────────────────────────────
// Official endpoint + vvhan fallback. No auth, cached 15 min.
async function fetchDouyinTrends(): Promise<TrendItem[]> {
  try {
    const res = await fetch(
      "https://www.douyin.com/aweme/v1/hot/search/list/?count=30&source=6&detail_list=1",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
          Referer: "https://www.douyin.com/",
        },
        next: { revalidate: 900 },
      }
    );
    if (res.ok) {
      const data = await res.json();
      const list: Array<{ word: string; hot_value?: number; label?: number }> =
        data?.data?.word_list ?? [];
      if (list.length > 0) {
        return list.slice(0, 20).map((item) => ({
          keyword: item.word,
          heat: item.hot_value
            ? `${(item.hot_value / 10000).toFixed(1)}万`
            : undefined,
          tag:
            item.label === 1 ? "新" : item.label === 2 ? "爆" : item.label === 3 ? "热" : undefined,
        }));
      }
    }
  } catch {
    // fall through
  }

  // Fallback: vvhan free API
  const res = await fetch("https://api.vvhan.com/api/hotlist/douyinHot", {
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error("Douyin fallback failed");
  const data = await res.json();
  const list: Array<{ title: string; desc?: string }> = data?.data ?? [];
  return list.slice(0, 20).map((item) => ({
    keyword: item.title,
    heat: item.desc,
  }));
}

// ── YouTube Trending ──────────────────────────────────────
// Uses youtubei.js which wraps YouTube's private InnerTube API.
// NO API KEY NEEDED. Completely free.
async function fetchYoutubeTrends(location = "CN"): Promise<TrendItem[]> {
  // Dynamic import to avoid bundling issues with ESM package
  const { Innertube } = await import("youtubei.js");

  const yt = await Innertube.create({
    location,
    lang: location === "US" ? "en" : "zh-CN",
    // No cache (filesystem not reliable in serverless)
    generate_session_locally: true,
  });

  const trending = await yt.getTrending();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feed = trending as any;
  const results: TrendItem[] = [];

  // Try multiple possible structures from different versions of youtubei.js
  const tryExtractFromItems = (items: unknown[]) => {
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = item as any;
      const title =
        v?.title?.text ??
        v?.title?.toString?.() ??
        v?.video_title?.text ??
        (typeof v?.title === "string" ? v.title : null);
      if (title && typeof title === "string" && title.length > 0) {
        const heat =
          v?.short_view_count?.text ??
          v?.view_count?.text ??
          v?.author?.name ??
          "";
        results.push({ keyword: title.trim(), heat });
      }
    }
  };

  // Approach 1: trending.videos (some versions)
  if (Array.isArray(feed.videos) && feed.videos.length > 0) {
    tryExtractFromItems(feed.videos);
  }

  // Approach 2: trending.tabs[0].content.videos or .results
  if (results.length === 0 && Array.isArray(feed.tabs)) {
    for (const tab of feed.tabs.slice(0, 1)) {
      const content = tab?.content ?? tab?.selected_tab?.content;
      if (!content) continue;

      const items =
        content.videos ??
        content.results ??
        content.items ??
        content.contents;
      if (Array.isArray(items)) {
        tryExtractFromItems(items);
      }

      // Drill into shelf renderers / sections
      if (results.length === 0 && Array.isArray(content.contents)) {
        for (const section of content.contents) {
          const sectionItems =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (section as any)?.contents ??
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (section as any)?.items;
          if (Array.isArray(sectionItems)) {
            tryExtractFromItems(sectionItems);
          }
        }
      }
      if (results.length > 0) break;
    }
  }

  return results.slice(0, 20);
}

// ── X / Twitter Trending ─────────────────────────────────
// Scrapes trends24.in (aggregates real X/Twitter trending data).
// Completely FREE — no API key, no account, no credentials required.
// Falls back to getdaytrends.com if trends24.in fails.

async function fetchXTrends(geo = "worldwide"): Promise<TrendItem[]> {
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  // ── Primary: trends24.in ────────────────────────────────
  try {
    const res = await fetch(`https://trends24.in/${geo}/`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      next: { revalidate: 900 },
    });
    if (res.ok) {
      const html = await res.text();
      const trends: TrendItem[] = [];
      const seen = new Set<string>();

      // trends24.in wraps each trend in: <a href="https://twitter.com/search?q=...">NAME</a>
      const re =
        /<a[^>]+href="https?:\/\/(?:twitter|x)\.com\/search\?q=[^"]*"[^>]*>([^<]{1,80})<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && trends.length < 25) {
        const kw = m[1].trim();
        if (!kw || seen.has(kw)) continue;
        seen.add(kw);
        trends.push({ keyword: kw });
      }

      // Also try class="trend-name" pattern as backup within same page
      if (trends.length === 0) {
        const re2 =
          /class="trend-name[^"]*"[^>]*>([^<]{1,80})<\//gi;
        while ((m = re2.exec(html)) !== null && trends.length < 25) {
          const kw = m[1].trim();
          if (!kw || seen.has(kw)) continue;
          seen.add(kw);
          trends.push({ keyword: kw });
        }
      }

      if (trends.length > 0) return trends;
    }
  } catch {
    // fall through to getdaytrends
  }

  // ── Fallback: getdaytrends.com ──────────────────────────
  const res2 = await fetch(`https://getdaytrends.com/${geo}/`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
    next: { revalidate: 900 },
  });
  if (!res2.ok) throw new Error(`getdaytrends HTTP ${res2.status}`);
  const html2 = await res2.text();

  const trends2: TrendItem[] = [];
  const seen2 = new Set<string>();
  // getdaytrends.com uses <a class="string"> for trend name, <td class="text-muted"> for count
  const re3 = /class="string"[^>]*>([^<]{1,80})<\/a>/gi;
  let m2: RegExpExecArray | null;
  while ((m2 = re3.exec(html2)) !== null && trends2.length < 25) {
    const kw = m2[1].trim();
    if (!kw || seen2.has(kw)) continue;
    seen2.add(kw);
    trends2.push({ keyword: kw });
  }
  if (trends2.length > 0) return trends2;

  throw new Error("X trends: all sources failed");
}

// ── Route handler ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const source = req.nextUrl.searchParams.get("source") ?? "google";
    const geo = req.nextUrl.searchParams.get("geo") ?? "CN";

    let trends: TrendItem[] = [];
    let warning: string | undefined;

    switch (source) {
      case "google":
        trends = await fetchGoogleTrends(geo);
        break;

      case "douyin":
        trends = await fetchDouyinTrends();
        break;

      case "youtube":
        trends = await fetchYoutubeTrends(geo);
        break;

      case "x":
        trends = await fetchXTrends();
        break;

      default:
        return NextResponse.json({ error: "无效来源" }, { status: 400 });
    }

    return NextResponse.json({
      source,
      trends,
      warning,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[trends/${req.nextUrl.searchParams.get("source")}] error:`, error);
    return NextResponse.json(
      { error: "获取热榜失败，请稍后重试" },
      { status: 500 }
    );
  }
}
