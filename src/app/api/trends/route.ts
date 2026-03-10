import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface TrendItem {
  keyword: string;
  heat?: string;
  tag?: string; // "新" | "爆" | "热"
}

// ── Google Trends ──────────────────────────────────────────
// Uses Google's official (but undocumented) daily trends JSON API
// No API key required. Updates ~daily.
async function fetchGoogleTrends(geo = "CN"): Promise<TrendItem[]> {
  const url = `https://trends.google.com/trends/api/dailytrends?hl=zh-CN&geo=${geo}&ns=15`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    next: { revalidate: 3600 }, // cache 1 hour
  });

  if (!res.ok) throw new Error(`Google Trends HTTP ${res.status}`);

  const text = await res.text();
  // Google prepends ")]}',\n" to prevent XSSI attacks
  const jsonStr = text.replace(/^\)\]\}',\n/, "");
  const data = JSON.parse(jsonStr);

  const trendingDays: Array<{
    trendingSearches: Array<{
      title: { query: string };
      formattedTraffic?: string;
    }>;
  }> = data?.default?.trendingSearchesDays ?? [];

  if (!trendingDays.length) return [];

  return trendingDays[0].trendingSearches.slice(0, 20).map((s) => ({
    keyword: s.title.query,
    heat: s.formattedTraffic ?? "",
  }));
}

// ── YouTube Trending ───────────────────────────────────────
// YouTube Data API v3 — free 10,000 units/day
// Enable "YouTube Data API v3" in Google Cloud Console (same project as Gemini)
// Create an API key there and set YOUTUBE_API_KEY in .env
async function fetchYoutubeTrends(regionCode = "CN"): Promise<TrendItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured");

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", regionCode);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 }, // cache 30 min
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`YouTube API error: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return (
    data.items?.map(
      (item: { snippet: { title: string; channelTitle: string } }) => ({
        keyword: item.snippet.title,
        heat: item.snippet.channelTitle,
      })
    ) ?? []
  );
}

// ── 抖音热搜 ────────────────────────────────────────────────
// Primary: Douyin official hot search endpoint (no auth needed)
// Fallback: vvhan free aggregation API
async function fetchDouyinTrends(): Promise<TrendItem[]> {
  // Primary: official douyin endpoint
  try {
    const res = await fetch(
      "https://www.douyin.com/aweme/v1/hot/search/list/?count=30&source=6&detail_list=1",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          Referer: "https://www.douyin.com/",
          Cookie: "", // no cookie needed for hot list
        },
        next: { revalidate: 900 }, // cache 15 min
      }
    );

    if (res.ok) {
      const data = await res.json();
      const wordList: Array<{
        word: string;
        hot_value?: number;
        label?: number;
      }> = data?.data?.word_list ?? [];

      if (wordList.length > 0) {
        return wordList.slice(0, 20).map((item) => ({
          keyword: item.word,
          heat: item.hot_value
            ? `${(item.hot_value / 10000).toFixed(1)}万`
            : undefined,
          tag:
            item.label === 1
              ? "新"
              : item.label === 2
              ? "爆"
              : item.label === 3
              ? "热"
              : undefined,
        }));
      }
    }
  } catch {
    // fall through to backup
  }

  // Fallback: vvhan free hot search aggregation API
  const res = await fetch("https://api.vvhan.com/api/hotlist/douyinHot", {
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error("Douyin fallback also failed");

  const data = await res.json();
  const list: Array<{ title: string; desc?: string; index?: number }> =
    data?.data ?? [];

  return list.slice(0, 20).map((item) => ({
    keyword: item.title,
    heat: item.desc,
  }));
}

// ── Route handler ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const source = req.nextUrl.searchParams.get("source") ?? "google";
    const geo = req.nextUrl.searchParams.get("geo") ?? "CN"; // CN or US

    let trends: TrendItem[] = [];
    let warning: string | undefined;

    switch (source) {
      case "google":
        trends = await fetchGoogleTrends(geo);
        break;
      case "youtube":
        try {
          trends = await fetchYoutubeTrends(geo === "US" ? "US" : "CN");
        } catch (err) {
          if (
            err instanceof Error &&
            err.message.includes("YOUTUBE_API_KEY")
          ) {
            warning = "需要配置 YOUTUBE_API_KEY（在 Google Cloud Console 开启 YouTube Data API v3 后创建 API key）";
            trends = [];
          } else {
            throw err;
          }
        }
        break;
      case "douyin":
        trends = await fetchDouyinTrends();
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
    console.error("Trends API error:", error);
    return NextResponse.json(
      { error: "获取热榜失败，请稍后重试" },
      { status: 500 }
    );
  }
}
