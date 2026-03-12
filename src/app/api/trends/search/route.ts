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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

// 热文播放量门槛：20万
const HOT_MIN_PLAYS = 200_000;

// ─── Tavily ───────────────────────────────────────────────────────────────────

async function tavilySearch(
  query: string,
  domains: string[],
  days: number
): Promise<ContentItem[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 10,
        days,
        include_domains: domains,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results ?? []).map(
      (r: { title: string; url: string; published_date?: string }) => ({
        title: stripHtml(r.title),
        url: r.url,
        heat: r.published_date
          ? new Date(r.published_date).toLocaleDateString("zh-CN", {
              month: "numeric",
              day: "numeric",
            })
          : undefined,
      })
    );
  } catch {
    return [];
  }
}

// ─── vvhan trending API ───────────────────────────────────────────────────────

interface VvhanItem {
  title: string;
  hot?: string;
  url?: string;
}

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

function matchVvhan(
  items: VvhanItem[],
  keyword: string
): { matched: VvhanItem[]; exact: boolean } {
  const kw = keyword.replace(/\s/g, "");
  const exact = items.filter((i) => i.title?.includes(kw));
  if (exact.length >= 2) return { matched: exact, exact: true };
  const chars = kw.split("").filter((c) => /[\u4e00-\u9fa5a-zA-Z0-9]/.test(c));
  const partial = items.filter((i) =>
    chars.some((c) => i.title?.includes(c))
  );
  if (partial.length >= 3) return { matched: partial, exact: false };
  return { matched: items.slice(0, 10), exact: false };
}

// ─── Google News RSS（兜底）───────────────────────────────────────────────────

async function googleNewsSearch(
  query: string,
  days: number,
  lang: "zh-CN" | "en-US" = "zh-CN"
): Promise<ContentItem[]> {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const after = d.toISOString().split("T")[0];
  const fullQuery = `${query} after:${after}`;
  const ceid = lang === "zh-CN" ? "CN:zh-Hans" : "US:en";
  const hl = lang === "zh-CN" ? "zh-CN" : "en-US";
  const gl = lang === "zh-CN" ? "CN" : "US";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(fullQuery)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: ContentItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && items.length < 10) {
      const block = m[1];
      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]>|<title>([\s\S]*?)<\/title>/);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
      if (!titleMatch) continue;
      let title = stripHtml(titleMatch[1] ?? titleMatch[2] ?? "").trim();
      title = title.replace(/\s*[-–]\s*[^-–]{2,40}$/, "").trim();
      if (title.length < 5) continue;
      items.push({ title, url: linkMatch?.[1]?.trim() });
    }
    return items;
  } catch {
    return [];
  }
}

// ─── B站：真实播放量，只展示20万+热文 ───────────────────────────────────────

async function searchBilibili(keyword: string): Promise<PlatformResult> {
  try {
    const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&order=totalrank&page=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.bilibili.com/",
        Origin: "https://www.bilibili.com",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.code === 0 && (data.data?.result?.length ?? 0) > 0) {
        const videos: Array<{
          title: string;
          play: number;
          arcurl: string;
        }> = data.data.result;

        // 优先展示20万+
        const hotVideos = videos
          .filter((v) => v.play >= HOT_MIN_PLAYS)
          .sort((a, b) => b.play - a.play)
          .slice(0, 10)
          .map((v) => ({
            title: stripHtml(v.title),
            heat: `${(v.play / 10000).toFixed(0)}万播放`,
            url: v.arcurl,
          }));

        if (hotVideos.length > 0) {
          return {
            platform: "bilibili",
            label: "B站",
            icon: "📺",
            items: hotVideos,
            dataType: "realViews",
          };
        }

        // 没有20万+，显示最高播放量结果并说明
        const topVideos = videos
          .sort((a, b) => b.play - a.play)
          .slice(0, 8)
          .map((v) => ({
            title: stripHtml(v.title),
            heat:
              v.play >= 10000
                ? `${(v.play / 10000).toFixed(1)}万播放`
                : `${v.play}播放`,
            url: v.arcurl,
          }));

        if (topVideos.length > 0) {
          return {
            platform: "bilibili",
            label: "B站",
            icon: "📺",
            items: topVideos,
            error: `"${keyword}"暂无20万+播放视频，显示播放量最高结果`,
            dataType: "realViews",
          };
        }
      }
    }
  } catch { /* fall through */ }

  // vvhan fallback
  const vvItems = await fetchVvhan("bilibiliHot");
  if (vvItems.length > 0) {
    const { matched } = matchVvhan(vvItems, keyword);
    return {
      platform: "bilibili",
      label: "B站",
      icon: "📺",
      items: matched.slice(0, 10).map((i) => ({ title: i.title, heat: i.hot })),
      error: "无法获取播放量数据，显示B站热门",
      dataType: "trending",
    };
  }

  return {
    platform: "bilibili",
    label: "B站",
    icon: "📺",
    items: [],
    error: "暂时无法获取B站数据",
  };
}

// ─── 知乎：真实搜索API，按赞同数排序 ─────────────────────────────────────────

async function searchZhihu(keyword: string): Promise<PlatformResult> {
  try {
    const url = `https://www.zhihu.com/api/v4/search_v3?t=content&q=${encodeURIComponent(keyword)}&correction=1&offset=0&limit=20&lc_idx=0&show_all_topics=0`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: `https://www.zhihu.com/search?q=${encodeURIComponent(keyword)}&type=content`,
        "Accept-Language": "zh-CN,zh;q=0.9",
        "x-api-version": "3.0.91",
        "x-app-za": "OS=Web",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      type ZhihuObj = {
        title?: string;
        question?: { title: string };
        voteup_count?: number;
        comment_count?: number;
        url?: string;
        id?: number | string;
        type?: string;
      };
      const results: Array<{ type: string; object?: ZhihuObj }> = data?.data ?? [];

      const items: ContentItem[] = results
        .filter((r) => r.object && (r.object.title || r.object.question?.title))
        .sort(
          (a, b) =>
            (b.object?.voteup_count ?? 0) - (a.object?.voteup_count ?? 0)
        )
        .slice(0, 10)
        .map((r) => {
          const obj = r.object!;
          const title = obj.title || obj.question?.title || "";
          const votes = obj.voteup_count ?? 0;
          const heat =
            votes >= 10000
              ? `${(votes / 10000).toFixed(0)}万赞`
              : votes > 0
              ? `${votes}赞`
              : undefined;
          const url =
            obj.url ||
            `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`;
          return { title, heat, url };
        })
        .filter((i) => i.title.length > 0);

      if (items.length > 0) {
        return {
          platform: "zhihu",
          label: "知乎",
          icon: "💡",
          items,
          dataType: "realViews",
        };
      }
    }
  } catch { /* fall through */ }

  // Tavily fallback
  if (process.env.TAVILY_API_KEY) {
    const items = await tavilySearch(`${keyword} 知乎`, ["zhihu.com"], 30);
    if (items.length > 0) {
      return {
        platform: "zhihu",
        label: "知乎",
        icon: "💡",
        items,
        dataType: "news",
      };
    }
  }

  // vvhan fallback
  const vvItems = await fetchVvhan("zhihuHot");
  if (vvItems.length > 0) {
    const { matched } = matchVvhan(vvItems, keyword);
    return {
      platform: "zhihu",
      label: "知乎",
      icon: "💡",
      items: matched.slice(0, 10).map((i) => ({
        title: i.title,
        heat: i.hot,
        url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(keyword)}`,
      })),
      error: `未找到"${keyword}"相关内容，显示知乎热榜`,
      dataType: "trending",
    };
  }

  return {
    platform: "zhihu",
    label: "知乎",
    icon: "💡",
    items: [],
    error: "暂时无法获取知乎数据",
  };
}

// ─── 微博：移动端API，按互动数排序 ───────────────────────────────────────────

async function searchWeibo(keyword: string): Promise<PlatformResult> {
  try {
    const url = `https://m.weibo.cn/api/container/getIndex?containerid=100103type%3D1%26q%3D${encodeURIComponent(keyword)}&page_type=searchall`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": MOBILE_UA,
        Referer: "https://m.weibo.cn/",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      type WeiboCard = {
        card_type: number;
        mblog?: {
          text: string;
          reposts_count: number;
          comments_count: number;
          attitudes_count: number;
          id: string;
        };
      };
      const cards: WeiboCard[] = data?.data?.cards ?? [];

      const posts = cards
        .filter((c) => c.card_type === 9 && c.mblog)
        .map((c) => {
          const m = c.mblog!;
          const total =
            (m.reposts_count || 0) +
            (m.comments_count || 0) +
            (m.attitudes_count || 0);
          const text = stripHtml(m.text).slice(0, 80);
          const heat =
            total >= 10000
              ? `${(total / 10000).toFixed(0)}万互动`
              : total > 0
              ? `${total}互动`
              : undefined;
          return {
            title: text,
            heat,
            url: `https://weibo.com/${m.id}`,
            _total: total,
          };
        })
        .filter((p) => p.title.length > 5)
        .sort((a, b) => b._total - a._total)
        .slice(0, 10)
        .map(({ title, heat, url }) => ({ title, heat, url }));

      if (posts.length > 0) {
        return {
          platform: "weibo",
          label: "微博",
          icon: "🌟",
          items: posts,
          dataType: "realViews",
        };
      }
    }
  } catch { /* fall through */ }

  // Tavily fallback
  if (process.env.TAVILY_API_KEY) {
    const items = await tavilySearch(`${keyword} 微博`, ["weibo.com"], 7);
    if (items.length > 0) {
      return {
        platform: "weibo",
        label: "微博",
        icon: "🌟",
        items,
        dataType: "news",
      };
    }
  }

  // vvhan fallback
  const vvItems = await fetchVvhan("wbHot");
  if (vvItems.length > 0) {
    const { matched } = matchVvhan(vvItems, keyword);
    return {
      platform: "weibo",
      label: "微博",
      icon: "🌟",
      items: matched.slice(0, 10).map((i) => ({
        title: i.title,
        heat: i.hot,
        url:
          i.url ||
          `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&xsort=hot`,
      })),
      error: `未找到"${keyword}"精确匹配，显示微博当前热搜`,
      dataType: "trending",
    };
  }

  return {
    platform: "weibo",
    label: "微博",
    icon: "🌟",
    items: [],
    error: "暂时无法获取微博数据",
  };
}

// ─── 抖音：平台封闭，显示相关内容 ────────────────────────────────────────────
// 抖音无公开API可获取真实播放量，只能展示相关内容供参考

async function searchDouyin(keyword: string): Promise<PlatformResult> {
  if (process.env.TAVILY_API_KEY) {
    const items = await tavilySearch(
      `${keyword} 抖音 爆款`,
      ["douyin.com"],
      30
    );
    if (items.length > 0) {
      return {
        platform: "douyin",
        label: "抖音",
        icon: "🎵",
        items,
        dataType: "news",
      };
    }
  }

  const vvItems = await fetchVvhan("douyinHot");
  if (vvItems.length > 0) {
    const { matched } = matchVvhan(vvItems, keyword);
    return {
      platform: "douyin",
      label: "抖音",
      icon: "🎵",
      items: matched.slice(0, 10).map((i) => ({ title: i.title, heat: i.hot })),
      error: `抖音封闭平台，无法获取真实播放量，展示平台热榜话题`,
      dataType: "trending",
    };
  }

  const newsItems = await googleNewsSearch(`${keyword} 抖音`, 7, "zh-CN");
  if (newsItems.length > 0) {
    return {
      platform: "douyin",
      label: "抖音",
      icon: "🎵",
      items: newsItems,
      dataType: "news",
    };
  }

  return {
    platform: "douyin",
    label: "抖音",
    icon: "🎵",
    items: [],
    error: "暂时无法获取抖音数据",
  };
}

// ─── 小红书：平台封闭，显示相关内容 ──────────────────────────────────────────
// 小红书无公开API，无法获取真实阅读量

async function searchXhs(keyword: string): Promise<PlatformResult> {
  if (process.env.TAVILY_API_KEY) {
    const items = await tavilySearch(
      `${keyword} 小红书 爆款`,
      ["xiaohongshu.com", "xhslink.com"],
      30
    );
    if (items.length > 0) {
      return {
        platform: "xiaohongshu",
        label: "小红书",
        icon: "📕",
        items,
        dataType: "news",
      };
    }
  }

  const vvItems = await fetchVvhan("xhsHot");
  if (vvItems.length > 0) {
    const { matched } = matchVvhan(vvItems, keyword);
    return {
      platform: "xiaohongshu",
      label: "小红书",
      icon: "📕",
      items: matched.slice(0, 10).map((i) => ({ title: i.title, heat: i.hot })),
      error: `小红书封闭平台，无法获取真实阅读量，展示平台热榜话题`,
      dataType: "trending",
    };
  }

  const newsItems = await googleNewsSearch(`${keyword} 小红书`, 7, "zh-CN");
  if (newsItems.length > 0) {
    return {
      platform: "xiaohongshu",
      label: "小红书",
      icon: "📕",
      items: newsItems,
      dataType: "news",
    };
  }

  return {
    platform: "xiaohongshu",
    label: "小红书",
    icon: "📕",
    items: [],
    error: "暂时无法获取小红书数据",
  };
}

// ─── X / Twitter ──────────────────────────────────────────────────────────────

async function searchX(keyword: string): Promise<PlatformResult> {
  if (process.env.TAVILY_API_KEY) {
    const items = await tavilySearch(keyword, ["x.com", "twitter.com"], 7);
    if (items.length > 0) {
      return {
        platform: "x",
        label: "X",
        icon: "𝕏",
        items,
        dataType: "news",
      };
    }
  }

  const newsItemsEn = await googleNewsSearch(`${keyword} twitter`, 7, "en-US");
  if (newsItemsEn.length > 0) {
    return { platform: "x", label: "X", icon: "𝕏", items: newsItemsEn, dataType: "news" };
  }

  const newsItemsZh = await googleNewsSearch(`${keyword} 推特 OR Twitter`, 7, "zh-CN");
  if (newsItemsZh.length > 0) {
    return { platform: "x", label: "X", icon: "𝕏", items: newsItemsZh, dataType: "news" };
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

    const kw = keyword.trim();

    const [bilibiliResult, douyinResult, xhsResult, weiboResult, zhihuResult, xResult] =
      await Promise.all([
        searchBilibili(kw),
        searchDouyin(kw),
        searchXhs(kw),
        searchWeibo(kw),
        searchZhihu(kw),
        searchX(kw),
      ]);

    return NextResponse.json({
      keyword: kw,
      hasTavily: !!process.env.TAVILY_API_KEY,
      platforms: [bilibiliResult, douyinResult, xhsResult, weiboResult, zhihuResult, xResult],
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[trends/search] error:", error);
    return NextResponse.json({ error: "搜索失败，请稍后重试" }, { status: 500 });
  }
}
