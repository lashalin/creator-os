import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export interface ContentItem {
  title: string;
  heat?: string;
  tag?: string;
}

export interface PlatformResult {
  platform: string;
  label: string;
  icon: string;
  items: ContentItem[];
  error?: string;
}

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1";

// ── 抖音关键词视频搜索 ────────────────────────────────────
async function searchDouyinVideos(keyword: string): Promise<PlatformResult> {
  const encoded = encodeURIComponent(keyword);

  try {
    // Douyin web search API (no auth needed, works with mobile UA)
    const res = await fetch(
      `https://www.douyin.com/aweme/v1/web/search/item/?keyword=${encoded}&count=10&search_channel=aweme_video_web&sort_type=0&publish_time=0&source=search_history&pc_client_type=1&version_code=190500&version_name=19.5.0&aid=6383&channel=tiktok_web`,
      {
        headers: {
          "User-Agent": MOBILE_UA,
          Referer: "https://www.douyin.com/",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        next: { revalidate: 900 },
      }
    );

    if (res.ok) {
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = data?.data?.data ?? [];
      const items: ContentItem[] = list
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((item: any) => item?.aweme_info?.desc)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => {
          const info = item.aweme_info;
          const plays = info?.statistics?.play_count ?? 0;
          const likes = info?.statistics?.digg_count ?? 0;
          const heat =
            plays > 0
              ? plays >= 10000
                ? `${(plays / 10000).toFixed(1)}万播`
                : `${plays}播`
              : likes > 0
              ? `${likes}赞`
              : undefined;
          return { title: info.desc, heat };
        })
        .filter((i: ContentItem) => i.title?.trim())
        .slice(0, 10);

      if (items.length > 0) {
        return { platform: "douyin", label: "抖音", icon: "🎵", items };
      }
    }
  } catch {
    // fall through
  }

  // Fallback: search via vvhan + filter by keyword (approximate)
  try {
    const hotRes = await fetch("https://api.vvhan.com/api/hotlist/douyinHot", {
      next: { revalidate: 900 },
    });
    if (hotRes.ok) {
      const d = await hotRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = d?.data ?? [];
      const kw = keyword.toLowerCase();
      const filtered = all.filter((item) =>
        (item.title ?? "").toLowerCase().includes(kw)
      );
      const list = filtered.length > 0 ? filtered : all;
      const items: ContentItem[] = list.slice(0, 10).map((item) => ({
        title: item.title,
        heat: item.desc,
      }));
      return {
        platform: "douyin",
        label: "抖音",
        icon: "🎵",
        items,
        error: filtered.length === 0 ? "未找到精确匹配，显示当前热搜" : undefined,
      };
    }
  } catch {
    // fall through
  }

  return {
    platform: "douyin",
    label: "抖音",
    icon: "🎵",
    items: [],
    error: "暂时无法获取抖音数据",
  };
}

// ── 小红书关键词笔记搜索 ──────────────────────────────────
async function searchXiaohongshuNotes(keyword: string): Promise<PlatformResult> {
  const encoded = encodeURIComponent(keyword);

  // Try 1: XHS official web API (works intermittently without signed tokens)
  try {
    const res = await fetch(
      `https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?keyword=${encoded}&page=1&page_size=20&search_id=0&sort=general&note_type=0`,
      {
        headers: {
          "User-Agent": DESKTOP_UA,
          Referer: `https://www.xiaohongshu.com/search_result?keyword=${encoded}&type=51`,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9",
          Origin: "https://www.xiaohongshu.com",
        },
        next: { revalidate: 900 },
      }
    );

    if (res.ok) {
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any[] = data?.data?.items ?? [];
      const items: ContentItem[] = raw
        .map((item) => {
          const card = item?.note_card ?? item;
          const title =
            card?.display_title ?? card?.title ?? card?.desc ?? "";
          const likes = card?.interact_info?.liked_count;
          const heat = likes
            ? Number(likes) >= 10000
              ? `${(Number(likes) / 10000).toFixed(1)}万赞`
              : `${likes}赞`
            : undefined;
          return { title: title.trim(), heat };
        })
        .filter((i) => i.title)
        .slice(0, 10);

      if (items.length > 0) {
        return { platform: "xiaohongshu", label: "小红书", icon: "📕", items };
      }
    }
  } catch {
    // fall through
  }

  // Try 2: XHS trending filtered by keyword
  try {
    const hotRes = await fetch("https://api.vvhan.com/api/hotlist/xhsHot", {
      next: { revalidate: 900 },
    });
    if (hotRes.ok) {
      const d = await hotRes.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = d?.data ?? [];
      const kw = keyword.toLowerCase();
      const filtered = all.filter((item) =>
        (item.title ?? "").toLowerCase().includes(kw)
      );
      const list = filtered.length > 0 ? filtered : all;
      const items: ContentItem[] = list.slice(0, 10).map((item) => ({
        title: item.title,
        heat: item.hot ?? item.desc,
      }));
      return {
        platform: "xiaohongshu",
        label: "小红书",
        icon: "📕",
        items,
        error: filtered.length === 0 ? "未找到精确匹配，显示当前热搜" : undefined,
      };
    }
  } catch {
    // fall through
  }

  // Try 3: Bilibili keyword search as fallback (similar short-video audience)
  try {
    const res = await fetch(
      `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encoded}&order=click&page=1`,
      {
        headers: {
          "User-Agent": DESKTOP_UA,
          Referer: "https://www.bilibili.com",
        },
        next: { revalidate: 900 },
      }
    );
    if (res.ok) {
      const d = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = d?.data?.result ?? [];
      const items: ContentItem[] = list
        .map((v) => ({
          title: v.title.replace(/<[^>]+>/g, "").trim(),
          heat: v.play
            ? v.play >= 10000
              ? `${(v.play / 10000).toFixed(1)}万播放`
              : `${v.play}播放`
            : undefined,
        }))
        .filter((v) => v.title)
        .slice(0, 10);

      if (items.length > 0) {
        return {
          platform: "xiaohongshu",
          label: "小红书",
          icon: "📕",
          items,
          error: "小红书接口限制，显示B站相关内容参考",
        };
      }
    }
  } catch {
    // fall through
  }

  return {
    platform: "xiaohongshu",
    label: "小红书",
    icon: "📕",
    items: [],
    error: "暂时无法获取小红书数据",
  };
}

// ── X / Twitter 关键词热推搜索 ────────────────────────────
async function searchXContent(keyword: string): Promise<PlatformResult> {
  const encoded = encodeURIComponent(keyword);
  const UA = DESKTOP_UA;

  // Try nitter instances (open-source Twitter frontend, no auth needed)
  const nitterInstances = [
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.cz",
  ];

  for (const instance of nitterInstances) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${instance}/search?q=${encoded}&f=tweets`, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
        next: { revalidate: 900 },
      });
      clearTimeout(timer);

      if (res.ok) {
        const html = await res.text();
        const items: ContentItem[] = [];
        const seen = new Set<string>();

        // Extract tweet text — nitter wraps content in <div class="tweet-content media-body">
        const tweetRe =
          /<div class="tweet-content[^"]*"[^>]*>([\s\S]{10,500}?)<\/div>/gi;
        let m: RegExpExecArray | null;
        while ((m = tweetRe.exec(html)) !== null && items.length < 10) {
          const text = m[1]
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (!text || text.length < 5 || seen.has(text)) continue;
          seen.add(text);
          items.push({ title: text });
        }

        if (items.length > 0) {
          return { platform: "x", label: "X", icon: "𝕏", items };
        }
      }
    } catch {
      // try next instance
    }
  }

  // Fallback: trends24.in search for related hashtags
  try {
    const res = await fetch(`https://trends24.in/search/?q=${encoded}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      next: { revalidate: 900 },
    });
    if (res.ok) {
      const html = await res.text();
      const items: ContentItem[] = [];
      const seen = new Set<string>();
      const re =
        /<a[^>]+href="https?:\/\/(?:twitter|x)\.com\/search\?q=[^"]*"[^>]*>([^<]{1,80})<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && items.length < 10) {
        const kw = m[1].trim();
        if (!kw || seen.has(kw)) continue;
        seen.add(kw);
        items.push({ title: kw });
      }
      if (items.length > 0) {
        return {
          platform: "x",
          label: "X",
          icon: "𝕏",
          items,
          error: "显示相关 X 话题标签",
        };
      }
    }
  } catch {
    // ignore
  }

  return {
    platform: "x",
    label: "X",
    icon: "𝕏",
    items: [],
    error: "暂时无法获取 X 数据",
  };
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

    // Fetch all three platforms in parallel
    const [douyinResult, xhsResult, xResult] = await Promise.all([
      searchDouyinVideos(kw),
      searchXiaohongshuNotes(kw),
      searchXContent(kw),
    ]);

    return NextResponse.json({
      keyword: kw,
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
