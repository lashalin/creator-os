import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface TrendItem {
  keyword: string;
  heat?: string;
  tag?: string;
}

// ── Google Trends ────────────────────────────────────────
// Uses the public RSS feed (no API key needed, updated hourly).
// Falls back to US if the requested geo returns no data.
async function fetchGoogleTrends(geo = "US"): Promise<TrendItem[]> {
  const geoCode = geo === "CN" ? "US" : geo; // CN blocked outside China, use US as proxy
  const url = `https://trends.google.com/trending/rss?geo=${geoCode}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Google Trends RSS HTTP ${res.status}`);

  const xml = await res.text();
  const trends: TrendItem[] = [];

  // Parse <item> blocks from RSS
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRe.exec(xml)) !== null && trends.length < 20) {
    const block = itemMatch[1];
    // title can be plain or CDATA
    const titleMatch =
      block.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/) ||
      block.match(/<title>([^<]+)<\/title>/);
    const trafficMatch = block.match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/);
    if (titleMatch?.[1]) {
      trends.push({
        keyword: titleMatch[1].trim(),
        heat: trafficMatch?.[1]?.trim() ?? "",
      });
    }
  }
  return trends;
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
// NO API KEY NEEDED. Completely free. Timeout: 8s for Vercel serverless.
async function fetchYoutubeTrends(location = "US"): Promise<TrendItem[]> {
  const { Innertube } = await import("youtubei.js");

  // Wrap with 8s timeout (Vercel Hobby limit = 10s)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("YouTube timeout")), 8000)
  );

  const fetchPromise = (async () => {
    const yt = await Innertube.create({
      location: location === "CN" ? "US" : location,
      lang: "en",
      generate_session_locally: true,
    });

    const trending = await yt.getTrending();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feed = trending as any;
    const results: TrendItem[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extract = (items: unknown[]) => {
      for (const item of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = item as any;
        const title =
          v?.title?.text ??
          v?.title?.toString?.() ??
          v?.video_title?.text ??
          (typeof v?.title === "string" ? v.title : null);
        if (title && typeof title === "string" && title.length > 0) {
          results.push({
            keyword: title.trim(),
            heat: v?.short_view_count?.text ?? v?.view_count?.text ?? v?.author?.name ?? "",
          });
        }
      }
    };

    if (Array.isArray(feed.videos) && feed.videos.length > 0) {
      extract(feed.videos);
    }
    if (results.length === 0 && Array.isArray(feed.tabs)) {
      for (const tab of feed.tabs.slice(0, 1)) {
        const content = tab?.content ?? tab?.selected_tab?.content;
        if (!content) continue;
        const items = content.videos ?? content.results ?? content.items ?? content.contents;
        if (Array.isArray(items)) extract(items);
        if (results.length === 0 && Array.isArray(content.contents)) {
          for (const section of content.contents) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const si = (section as any)?.contents ?? (section as any)?.items;
            if (Array.isArray(si)) extract(si);
          }
        }
        if (results.length > 0) break;
      }
    }
    return results.slice(0, 20);
  })();

  return Promise.race([fetchPromise, timeoutPromise]);
}

// ── X / Twitter Trending ─────────────────────────────────
// Scrapes trends24.in (aggregates real X/Twitter trending data).
// Completely FREE — no API key, no account, no credentials required.
// Falls back to getdaytrends.com if trends24.in fails.

async function fetchXTrends(geo = "united-states"): Promise<TrendItem[]> {
  const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  // Map generic geo codes to valid trends24.in country slugs
  const slugMap: Record<string, string> = {
    "worldwide": "united-states",
    "US": "united-states",
    "CN": "united-states", // China not on X, use global proxy
    "GB": "united-kingdom",
    "JP": "japan",
    "KR": "south-korea",
    "IN": "india",
  };
  const slug = slugMap[geo] ?? geo.toLowerCase().replace("_", "-");

  // ── Primary: trends24.in ────────────────────────────────
  try {
    const res = await fetch(`https://trends24.in/${slug}/`, {
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
  const res2 = await fetch(`https://getdaytrends.com/`, {
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
