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
  /** realViews = 平台真实数据；trending = 热榜话题；news = 相关内容 */
  dataType?: "realViews" | "trending" | "news";
}

// ─── X / Twitter via TwitterAPI.io ───────────────────────────────────────────

// Helper: get ISO date string N days ago
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function searchX(keyword: string, timeRange: "24h" | "48h" | "7d" = "7d"): Promise<PlatformResult> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey) {
    return {
      platform: "x",
      label: "X",
      icon: "𝕏",
      items: [],
      error: "未配置 TWITTERAPI_IO_KEY，请联系管理员",
    };
  }

  try {
    // Build time filter: since:YYYY-MM-DD
    const sinceDays = timeRange === "24h" ? 1 : timeRange === "48h" ? 2 : 7;
    const sinceDate = daysAgo(sinceDays);
    const rawQuery = `${keyword} -is:retweet since:${sinceDate}`;
    const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(rawQuery)}&queryType=Top`;

    const res = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[searchX] API error:", res.status, errText);
      return {
        platform: "x",
        label: "X",
        icon: "𝕏",
        items: [],
        error: `X API 错误 (${res.status})`,
      };
    }

    const data = await res.json();

    type Tweet = {
      id?: string;
      text?: string;
      url?: string;
      likeCount?: number;
      retweetCount?: number;
      replyCount?: number;
      viewCount?: number;
      author?: { userName?: string; name?: string };
    };

    // TwitterAPI.io may return tweets at top-level or nested
    const tweets: Tweet[] =
      data?.tweets ?? data?.data?.tweets ?? data?.data ?? [];

    const items: ContentItem[] = tweets
      .filter((t) => t.text && t.text.length > 10)
      .slice(0, 10)
      .map((t) => {
        const views = t.viewCount ?? 0;
        const likes = t.likeCount ?? 0;

        let heat: string | undefined;
        if (views >= 1_000_000) {
          heat = `${(views / 10000).toFixed(0)}万浏览`;
        } else if (views >= 10_000) {
          heat = `${(views / 10000).toFixed(1)}万浏览`;
        } else if (likes >= 1000) {
          heat = `${(likes / 1000).toFixed(1)}k♥`;
        } else if (likes > 0) {
          heat = `${likes}♥`;
        }

        const tweetUrl =
          t.url ||
          (t.author?.userName && t.id
            ? `https://x.com/${t.author.userName}/status/${t.id}`
            : undefined);

        // Clean tweet text: strip URLs and extra whitespace
        const title = (t.text ?? "")
          .replace(/https?:\/\/\S+/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140);

        return { title, heat, url: tweetUrl };
      })
      .filter((i) => i.title.length > 5);

    if (items.length > 0) {
      return {
        platform: "x",
        label: "X",
        icon: "𝕏",
        items,
        dataType: "realViews",
      };
    }

    return {
      platform: "x",
      label: "X",
      icon: "𝕏",
      items: [],
      error: `未找到"${keyword}"相关推文，请换个关键词`,
    };
  } catch (err) {
    console.error("[searchX] error:", err);
    return {
      platform: "x",
      label: "X",
      icon: "𝕏",
      items: [],
      error: "X 搜索暂时不可用，请稍后重试",
    };
  }
}

// ─── Hacker News via Algolia API (free, no auth, works from Vercel) ──────────

async function searchHN(keyword: string, timeRange: "24h" | "48h" | "7d" = "7d"): Promise<PlatformResult> {
  try {
    // Convert timeRange to a Unix timestamp filter
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsMap = { "24h": 86400, "48h": 172800, "7d": 604800 };
    const since = nowSec - secondsMap[timeRange];

    // Algolia HN search API — completely free, no auth, works from any server
    const url =
      `https://hn.algolia.com/api/v1/search?` +
      `query=${encodeURIComponent(keyword)}` +
      `&tags=story` +
      `&numericFilters=created_at_i>${since},points>0` +
      `&hitsPerPage=10` +
      `&attributesToRetrieve=title,url,points,num_comments,objectID`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[searchHN] Algolia error: ${res.status}`);
      return {
        platform: "hn",
        label: "Hacker News",
        icon: "🟠",
        items: [],
        error: `HN API 错误 (${res.status})`,
      };
    }

    const data = await res.json();

    type HNHit = {
      title?: string;
      url?: string;
      objectID: string;
      points?: number;
      num_comments?: number;
    };

    const hits: HNHit[] = data?.hits ?? [];

    const items: ContentItem[] = hits
      .filter((h) => h.title && h.title.length > 3)
      .map((h) => {
        const points = h.points ?? 0;
        const comments = h.num_comments ?? 0;

        let heat: string | undefined;
        if (points >= 500) {
          heat = `${points}↑ · ${comments}💬`;
        } else if (points >= 100) {
          heat = `${points}↑ · ${comments}💬`;
        } else if (points > 0) {
          heat = `${points}↑`;
        }

        return {
          title: h.title ?? "",
          heat,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        };
      });

    if (items.length > 0) {
      return {
        platform: "hn",
        label: "Hacker News",
        icon: "🟠",
        items,
        dataType: "realViews",
      };
    }

    // If strict filter returned nothing, retry without time filter
    const fallbackUrl =
      `https://hn.algolia.com/api/v1/search?` +
      `query=${encodeURIComponent(keyword)}` +
      `&tags=story` +
      `&hitsPerPage=10` +
      `&attributesToRetrieve=title,url,points,num_comments,objectID`;

    const res2 = await fetch(fallbackUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const hits2: HNHit[] = data2?.hits ?? [];
      const items2: ContentItem[] = hits2
        .filter((h) => h.title && h.title.length > 3)
        .map((h) => ({
          title: h.title ?? "",
          heat: h.points ? `${h.points}↑` : undefined,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        }));

      if (items2.length > 0) {
        return {
          platform: "hn",
          label: "Hacker News",
          icon: "🟠",
          items: items2,
          dataType: "realViews",
        };
      }
    }

    return {
      platform: "hn",
      label: "Hacker News",
      icon: "🟠",
      items: [],
      error: `未找到"${keyword}"相关讨论，可尝试英文关键词`,
    };
  } catch (err) {
    console.error("[searchHN] error:", err);
    return {
      platform: "hn",
      label: "Hacker News",
      icon: "🟠",
      items: [],
      error: "HN 搜索暂时不可用，请稍后重试",
    };
  }
}

// ─── Reddit via OAuth2 client credentials ────────────────────────────────────

// Cache token in memory (reused across requests in the same function instance)
let redditTokenCache: { token: string; expiresAt: number } | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (5 min buffer)
  if (redditTokenCache && Date.now() < redditTokenCache.expiresAt - 300_000) {
    return redditTokenCache.token;
  }

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CreatorOS/1.0 by CreatorOS",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;

    redditTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

async function searchReddit(keyword: string, timeRange: "24h" | "48h" | "7d" = "7d"): Promise<PlatformResult> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  if (!clientId) {
    return {
      platform: "reddit",
      label: "Reddit",
      icon: "🟧",
      items: [],
      error: "Reddit API not configured — add REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET",
    };
  }

  try {
    const token = await getRedditToken();
    if (!token) {
      return {
        platform: "reddit",
        label: "Reddit",
        icon: "🟧",
        items: [],
        error: "Reddit auth failed — check REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET",
      };
    }

    const tMap = { "24h": "day", "48h": "week", "7d": "week" };
    const t = tMap[timeRange];
    const url =
      `https://oauth.reddit.com/search?` +
      `q=${encodeURIComponent(keyword)}&sort=top&t=${t}&limit=15&type=link&raw_json=1`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "CreatorOS/1.0 by CreatorOS",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        platform: "reddit",
        label: "Reddit",
        icon: "🟧",
        items: [],
        error: `Reddit API error (${res.status})`,
      };
    }

    const data = await res.json();

    type RedditPost = {
      data: {
        title?: string;
        permalink?: string;
        score?: number;
        num_comments?: number;
        subreddit?: string;
      };
    };

    const posts: RedditPost[] = data?.data?.children ?? [];

    const items: ContentItem[] = posts
      .filter((p) => p.data?.title && p.data.title.length > 3)
      .slice(0, 10)
      .map((p) => {
        const { title, permalink, score, num_comments } = p.data;
        const points = score ?? 0;
        const comments = num_comments ?? 0;

        let heat: string | undefined;
        if (points >= 10000) {
          heat = `${(points / 1000).toFixed(0)}k↑ · ${comments}💬`;
        } else if (points >= 1000) {
          heat = `${(points / 1000).toFixed(1)}k↑ · ${comments}💬`;
        } else if (points > 0) {
          heat = `${points}↑ · ${comments}💬`;
        }

        return {
          title: title ?? "",
          heat,
          url: permalink ? `https://www.reddit.com${permalink}` : undefined,
        };
      })
      .filter((i) => i.title.length > 3);

    if (items.length > 0) {
      return { platform: "reddit", label: "Reddit", icon: "🟧", items, dataType: "realViews" };
    }

    return {
      platform: "reddit",
      label: "Reddit",
      icon: "🟧",
      items: [],
      error: `No Reddit posts found for "${keyword}", try different keywords`,
    };
  } catch (err) {
    console.error("[searchReddit] error:", err);
    return {
      platform: "reddit",
      label: "Reddit",
      icon: "🟧",
      items: [],
      error: "Reddit search temporarily unavailable",
    };
  }
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

    const kw = keyword.trim();
    const rawRange = req.nextUrl.searchParams.get("timerange") ?? "7d";
    const timeRange: "24h" | "48h" | "7d" =
      rawRange === "24h" ? "24h" : rawRange === "48h" ? "48h" : "7d";

    const [xResult, redditResult] = await Promise.all([
      searchX(kw, timeRange),
      searchReddit(kw, timeRange),
    ]);

    return NextResponse.json({
      keyword: kw,
      hasTwitterAPI: !!process.env.TWITTERAPI_IO_KEY,
      platforms: [xResult, redditResult],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[trends/search] error:", error);
    return NextResponse.json({ error: "搜索失败，请稍后重试" }, { status: 500 });
  }
}
