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
    // Use Unix timestamps for precise time range enforcement
    const nowSec = Math.floor(Date.now() / 1000);
    const secondsMap = { "24h": 86400, "48h": 172800, "7d": 604800 };
    const sinceSec = nowSec - secondsMap[timeRange];

    // since_time: / until_time: with Unix timestamps are strictly enforced by TwitterAPI.io
    // Do NOT filter -is:retweet — retweets are often the highest-reach content
    // min_faves:50 ensures only posts with real engagement are included
    const rawQuery = `${keyword} min_faves:50 since_time:${sinceSec} until_time:${nowSec}`;
    const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(rawQuery)}&queryType=Top`;

    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
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
      createdAt?: string;
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
      .filter((t) => {
        if (!t.text || t.text.length <= 10) return false;
        // Client-side date guard: discard tweets outside the time window
        if (t.createdAt) {
          const tweetSec = Math.floor(new Date(t.createdAt).getTime() / 1000);
          if (tweetSec < sinceSec || tweetSec > nowSec) return false;
        }
        return true;
      })
      // Sort by viewCount desc — highest reach first
      .sort((a, b) => (b.viewCount ?? b.likeCount ?? 0) - (a.viewCount ?? a.likeCount ?? 0))
      .slice(0, 10)
      .map((t) => {
        const views = t.viewCount ?? 0;
        const likes = t.likeCount ?? 0;

        let heat: string | undefined;
        if (views >= 100_000_000) {
          heat = `${(views / 100_000_000).toFixed(1)}亿views`;
        } else if (views >= 10_000_000) {
          heat = `${(views / 10_000_000).toFixed(0)}千万views`;
        } else if (views >= 1_000_000) {
          heat = `${(views / 1_000_000).toFixed(1)}M views`;
        } else if (views >= 10_000) {
          heat = `${(views / 10_000).toFixed(1)}万views`;
        } else if (views > 0) {
          heat = `${views.toLocaleString()} views`;
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

// ─── Reddit Search ────────────────────────────────────────────────────────────
// Strategy 1: Reddit OAuth2 (client credentials) — most reliable from cloud servers
// Strategy 2: PullPush.io (Pushshift successor, no auth, cloud-friendly)

type RedditSubmission = {
  title?: string;
  url?: string;
  permalink?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  subreddit?: string;
};

function formatRedditHeat(score: number, comments: number): string | undefined {
  if (score >= 10000) return `${(score / 1000).toFixed(0)}k↑ · ${comments}💬`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k↑ · ${comments}💬`;
  if (score > 0) return `${score}↑ · ${comments}💬`;
  return undefined;
}

// Reddit OAuth2 token cache
let redditTokenCache: { token: string; expiresAt: number } | null = null;

async function getRedditToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (redditTokenCache && redditTokenCache.expiresAt > now + 60000) {
    return redditTokenCache.token;
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "CreatorOS/1.0",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("No access_token in Reddit response");
  redditTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function searchReddit(keyword: string, timeRange: "24h" | "48h" | "7d" = "7d"): Promise<PlatformResult> {
  const secondsMap = { "24h": 86400, "48h": 172800, "7d": 604800 };
  const nowSec = Math.floor(Date.now() / 1000);
  const afterSec = nowSec - secondsMap[timeRange];

  // ── Strategy 1: Reddit OAuth2 (most reliable from Vercel/cloud) ─────────────
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      const token = await getRedditToken(clientId, clientSecret);
      // Reddit's t= param: hour|day|week|month|year|all
      // 24h → day, 48h → week (then filter client-side), 7d → week
      const tMap = { "24h": "day", "48h": "week", "7d": "week" };
      const searchUrl =
        `https://oauth.reddit.com/search?` +
        `q=${encodeURIComponent(keyword)}&sort=top&t=${tMap[timeRange]}&limit=25&type=link`;

      const res = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "CreatorOS/1.0",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        const posts: { data: RedditSubmission }[] = data?.data?.children ?? [];

        const items: ContentItem[] = posts
          .filter((p) => {
            if (!p.data?.title || p.data.title.length <= 3) return false;
            // For 48h, Reddit has no exact tier — filter client-side
            if (timeRange === "48h" && p.data.created_utc) {
              return p.data.created_utc >= afterSec;
            }
            return true;
          })
          .slice(0, 10)
          .map((p) => ({
            title: p.data.title ?? "",
            heat: formatRedditHeat(p.data.score ?? 0, p.data.num_comments ?? 0),
            url: p.data.permalink
              ? `https://www.reddit.com${p.data.permalink}`
              : undefined,
          }))
          .filter((i) => i.title.length > 3);

        if (items.length > 0) {
          return { platform: "reddit", label: "Reddit", icon: "🟧", items, dataType: "realViews" };
        }
      } else {
        console.warn("[searchReddit OAuth2] status:", res.status);
      }
    } catch (err) {
      console.warn("[searchReddit OAuth2] error:", err);
    }
  }

  // ── Strategy 2: PullPush.io (no auth, cloud-friendly, Pushshift successor) ──
  try {
    // sort_type=score to get highest-scored posts in the time window
    const ppUrl =
      `https://api.pullpush.io/reddit/search/submission/?` +
      `q=${encodeURIComponent(keyword)}` +
      `&sort_type=score&sort=desc&size=25` +
      `&after=${afterSec}&before=${nowSec}`;

    const res = await fetch(ppUrl, {
      headers: { "User-Agent": "CreatorOS/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = await res.json();
      const hits: RedditSubmission[] = data?.data ?? [];

      const items: ContentItem[] = hits
        .filter((h) => h.title && h.title.length > 3)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, 10)
        .map((h) => ({
          title: h.title ?? "",
          heat: formatRedditHeat(h.score ?? 0, h.num_comments ?? 0),
          url: h.permalink ? `https://www.reddit.com${h.permalink}` : undefined,
        }))
        .filter((i) => i.title.length > 3);

      if (items.length > 0) {
        return { platform: "reddit", label: "Reddit", icon: "🟧", items, dataType: "realViews" };
      }
    } else {
      console.warn("[searchReddit PullPush] status:", res.status);
    }
  } catch (err) {
    console.warn("[searchReddit PullPush] error:", err);
  }

  // ── Strategy 3: PullPush without time filter (wider net, still score-sorted) ─
  try {
    const ppUrl2 =
      `https://api.pullpush.io/reddit/search/submission/?` +
      `q=${encodeURIComponent(keyword)}&sort_type=score&sort=desc&size=10`;

    const res2 = await fetch(ppUrl2, {
      headers: { "User-Agent": "CreatorOS/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      const hits2: RedditSubmission[] = data2?.data ?? [];
      const items2: ContentItem[] = hits2
        .filter((h) => h.title && h.title.length > 3)
        .slice(0, 10)
        .map((h) => ({
          title: h.title ?? "",
          heat: formatRedditHeat(h.score ?? 0, h.num_comments ?? 0),
          url: h.permalink ? `https://www.reddit.com${h.permalink}` : undefined,
        }))
        .filter((i) => i.title.length > 3);

      if (items2.length > 0) {
        return { platform: "reddit", label: "Reddit", icon: "🟧", items: items2, dataType: "realViews" };
      }
    }
  } catch (err) {
    console.warn("[searchReddit PullPush fallback] error:", err);
  }

  return {
    platform: "reddit",
    label: "Reddit",
    icon: "🟧",
    items: [],
    error: !clientId
      ? "Reddit credentials not configured — add REDDIT_CLIENT_ID & REDDIT_CLIENT_SECRET in Vercel env"
      : `No Reddit posts found for "${keyword}", try different keywords`,
  };
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
