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
// Uses @treasure-dev/twitter-scraper (fork of the-convocation/twitter-scraper).
// Requires TWITTER_USERNAME + TWITTER_PASSWORD env vars.
// ⚠️ Use a dedicated account, NOT your main X account (low but non-zero ban risk).
// Tip: set TWITTER_COOKIES (JSON array) to skip login on warm starts.

// Module-level scraper cache (persists across warm invocations)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _xScraper: any = null;
let _xScraperTs = 0;
const X_SESSION_TTL = 25 * 60 * 1000; // 25 min

async function fetchXTrends(): Promise<TrendItem[]> {
  const username = process.env.TWITTER_USERNAME;
  const password = process.env.TWITTER_PASSWORD;
  const email = process.env.TWITTER_EMAIL;
  const cookiesEnv = process.env.TWITTER_COOKIES;

  if (!username || !password) {
    throw new Error("TWITTER_CREDENTIALS_MISSING");
  }

  const { Scraper } = await import("@treasure-dev/twitter-scraper");

  // Reuse cached scraper if session is fresh
  const now = Date.now();
  if (_xScraper && now - _xScraperTs < X_SESSION_TTL) {
    try {
      const stillIn = await _xScraper.isLoggedIn();
      if (stillIn) {
        const trends: string[] = await _xScraper.getTrends();
        return trends.map((t: string) => ({ keyword: t }));
      }
    } catch {
      _xScraper = null;
    }
  }

  const scraper = new Scraper();

  // If we have pre-saved cookies, use them (fastest, no login needed)
  if (cookiesEnv) {
    try {
      const cookies = JSON.parse(cookiesEnv);
      await scraper.setCookies(cookies);
      const isIn = await scraper.isLoggedIn();
      if (isIn) {
        _xScraper = scraper;
        _xScraperTs = now;
        const trends: string[] = await scraper.getTrends();
        return trends.map((t: string) => ({ keyword: t }));
      }
    } catch {
      // cookies expired, fall through to password login
    }
  }

  // Login with username/password
  await scraper.login(username, password, email);
  _xScraper = scraper;
  _xScraperTs = now;

  const trends: string[] = await scraper.getTrends();
  return trends.map((t: string) => ({ keyword: t }));
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
        try {
          trends = await fetchXTrends();
        } catch (err) {
          if (
            err instanceof Error &&
            err.message === "TWITTER_CREDENTIALS_MISSING"
          ) {
            warning =
              "需要配置 X 账号：在 Vercel 环境变量中添加 TWITTER_USERNAME、TWITTER_PASSWORD（建议用小号，非主账号）";
            trends = [];
          } else {
            throw err;
          }
        }
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
