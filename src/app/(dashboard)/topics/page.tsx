"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

interface Topic {
  id?: string;
  title: string;
  angle: string;
  viralScore: number;
  matchScore: number;
  competitionLevel: string;
  platforms: string[];
  saved?: boolean;
}

interface TrendItem {
  keyword: string;
  heat?: string;
  tag?: string;
}

interface ContentItem {
  title: string;
  heat?: string;
  tag?: string;
  url?: string;
}

interface PlatformResult {
  platform: string;
  label: string;
  icon: string;
  items: ContentItem[];
  error?: string;
  dataType?: "realViews" | "trending" | "news";
}

type TrendSource = "google" | "douyin" | "xiaohongshu" | "x";

const COMPETITION_COLORS: Record<string, string> = {
  低: "text-green-400",
  中: "text-yellow-400",
  高: "text-red-400",
  Low: "text-green-400",
  Medium: "text-yellow-400",
  High: "text-red-400",
};

const TREND_SOURCES: { key: TrendSource; label: string; icon: string }[] = [
  { key: "google", label: "Google 趋势", icon: "🔍" },
  { key: "douyin", label: "抖音热搜", icon: "🎵" },
  { key: "xiaohongshu", label: "小红书", icon: "📕" },
  { key: "x", label: "X 热点", icon: "𝕏" },
];

export default function TopicsPage() {
  const router = useRouter();
  const { t, locale } = useLanguage();

  const [mode, setMode] = useState<"ai" | "hot">("ai");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [hotKeyword, setHotKeyword] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  // Real trends state
  const [trendSource, setTrendSource] = useState<TrendSource>("google");
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [trendsWarning, setTrendsWarning] = useState<string | null>(null);
  const [trendsFetchedAt, setTrendsFetchedAt] = useState<string | null>(null);

  // Keyword trend search state
  const [kwSearchInput, setKwSearchInput] = useState("");
  const [kwTimeRange, setKwTimeRange] = useState<"24h" | "48h" | "7d">("24h");
  const [kwPlatforms, setKwPlatforms] = useState<PlatformResult[]>([]);
  const [kwActiveTab, setKwActiveTab] = useState<string>("x");
  const [kwSearchLoading, setKwSearchLoading] = useState(false);
  const [kwSearchError, setKwSearchError] = useState<string | null>(null);
  const [kwLastQuery, setKwLastQuery] = useState<string | null>(null);
  const [kwHasTavily, setKwHasTavily] = useState<boolean | null>(null);
  const [kwCooldown, setKwCooldown] = useState(0); // seconds remaining

  const fetchTrends = useCallback(async (source: TrendSource) => {
    setTrendsLoading(true);
    setTrendsError(null);
    setTrendsWarning(null);
    setTrends([]);
    try {
      const res = await fetch(`/api/trends?source=${source}`);
      const data = await res.json();
      if (!res.ok) {
        setTrendsError(data.error || "获取失败");
      } else {
        setTrends(data.trends ?? []);
        setTrendsWarning(data.warning ?? null);
        setTrendsFetchedAt(data.fetched_at ?? null);
      }
    } catch {
      setTrendsError("网络错误，请重试");
    } finally {
      setTrendsLoading(false);
    }
  }, []);

  // Auto-fetch when switching to hot mode or changing trend source
  useEffect(() => {
    if (mode === "hot") {
      fetchTrends(trendSource);
    }
  }, [mode, trendSource, fetchTrends]);

  const searchKeywordTrend = async (kw?: string, tr?: "24h" | "48h" | "7d") => {
    const q = (kw ?? kwSearchInput).trim();
    if (!q || kwCooldown > 0) return;
    const range = tr ?? kwTimeRange;
    if (kw) setKwSearchInput(kw);
    setKwLastQuery(q);
    setKwSearchLoading(true);
    setKwSearchError(null);
    setKwPlatforms([]);
    try {
      const res = await fetch(
        `/api/trends/search?q=${encodeURIComponent(q)}&timerange=${range}`
      );
      const data = await res.json();
      if (!res.ok) {
        setKwSearchError(data.error || "搜索失败");
      } else {
        const platforms: PlatformResult[] = data.platforms ?? [];
        setKwPlatforms(platforms);
        setKwHasTavily(data.hasTavily ?? false);
        const firstWithData = platforms.find((p) => p.items.length > 0);
        if (firstWithData) setKwActiveTab(firstWithData.platform);
      }
    } catch {
      setKwSearchError("网络错误，请重试");
    } finally {
      setKwSearchLoading(false);
      // 6s cooldown to respect TwitterAPI.io free-tier rate limit (1 req/5s)
      setKwCooldown(6);
      const timer = setInterval(() => {
        setKwCooldown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
  };

  // Re-search when time range changes (if a query exists)
  useEffect(() => {
    if (kwLastQuery) {
      searchKeywordTrend(kwLastQuery, kwTimeRange);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kwTimeRange]);

  const generateAITopics = async () => {
    setLoading(true);
    setTopics([]);
    try {
      const res = await fetch("/api/ai/suggest-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 8 }),
      });
      const data = await res.json();
      if (data.topics) {
        setTopics(data.topics.map((tp: Topic) => ({ ...tp, saved: false })));
      }
    } catch {
      alert(t.error);
    } finally {
      setLoading(false);
    }
  };

  const searchHotTopics = async (keyword?: string) => {
    const kw = keyword ?? hotKeyword;
    if (!kw.trim()) return;
    if (keyword) setHotKeyword(keyword);
    setLoading(true);
    setTopics([]);
    try {
      const res = await fetch("/api/ai/hot-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const data = await res.json();
      if (data.topics) {
        setTopics(data.topics.map((tp: Topic) => ({ ...tp, saved: false })));
      }
    } catch {
      alert(t.error);
    } finally {
      setLoading(false);
    }
  };

  const saveTopic = async (topic: Topic, index: number) => {
    setSavingId(index);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...topic, source: mode }),
      });
      const data = await res.json();
      if (data.topic) {
        setTopics((prev) =>
          prev.map((tp, i) => (i === index ? { ...tp, saved: true, id: data.topic.id } : tp))
        );
      }
    } catch {
      alert(t.error);
    } finally {
      setSavingId(null);
    }
  };

  const goCreate = (topic: Topic) => {
    const params = new URLSearchParams({
      title: topic.title,
      angle: topic.angle,
      topicId: topic.id || "",
    });
    router.push(`/create?${params.toString()}`);
  };

  const formatFetchedAt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} 更新`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← {t.dashboardTitle}
          </Link>
          <span className="text-sm font-semibold">{t.topicRadar}</span>
        </div>
        <Link href="/library" className="text-xs text-white/30 hover:text-white/60 transition-colors">
          {t.library}
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-8 py-10 space-y-8">
        {/* Mode Toggle */}
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl w-fit">
          <button
            onClick={() => { setMode("ai"); setTopics([]); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "ai" ? "bg-white text-black" : "text-white/40 hover:text-white/70"
            }`}
          >
            ◎ {t.aiTopics}
          </button>
          <button
            onClick={() => { setMode("hot"); setTopics([]); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "hot" ? "bg-white text-black" : "text-white/40 hover:text-white/70"
            }`}
          >
            ◈ {t.hotTopics}
          </button>
        </div>

        {/* ── AI MODE ── */}
        {mode === "ai" && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-white/50 flex-1">
              {locale === "zh"
                ? "基于你的创作者 DNA，AI 推荐最适合你的选题并评分"
                : "Based on your Creator DNA, AI recommends and scores the best topics for you"}
            </p>
            <button
              onClick={generateAITopics}
              disabled={loading}
              className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.loadingTopics : t.suggestTopics}
            </button>
          </div>
        )}

        {/* ── HOT MODE ── */}
        {mode === "hot" && (
          <div className="space-y-6">
            {/* ── Real-time Trending Section ── */}
            <div className="border border-white/8 rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">📡 实时热榜</span>
                  {trendsFetchedAt && !trendsLoading && (
                    <span className="text-xs text-white/25">{formatFetchedAt(trendsFetchedAt)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Source tabs */}
                  <div className="flex gap-1">
                    {TREND_SOURCES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setTrendSource(s.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          trendSource === s.key
                            ? "bg-white/10 text-white"
                            : "text-white/30 hover:text-white/60"
                        }`}
                      >
                        <span>{s.icon}</span>
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => fetchTrends(trendSource)}
                    disabled={trendsLoading}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                    title="刷新"
                  >
                    {trendsLoading ? "⟳" : "↻ 刷新"}
                  </button>
                </div>
              </div>

              {/* Trends content */}
              <div className="px-5 py-4">
                {trendsLoading && (
                  <div className="flex items-center justify-center py-8 gap-3">
                    <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin" />
                    <span className="text-sm text-white/30">正在获取实时热榜...</span>
                  </div>
                )}

                {trendsWarning && !trendsLoading && (
                  <div className="flex flex-col gap-2 py-4 px-4 bg-yellow-500/5 border border-yellow-500/15 rounded-xl text-sm text-yellow-400/80">
                    <p>⚠️ {trendsWarning}</p>
                  </div>
                )}

                {trendsError && !trendsLoading && (
                  <div className="flex items-center justify-between py-3 px-4 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <span className="text-sm text-red-400/80">{trendsError}</span>
                    <button
                      onClick={() => fetchTrends(trendSource)}
                      className="text-xs text-white/40 hover:text-white/70 transition-colors"
                    >
                      重试
                    </button>
                  </div>
                )}

                {!trendsLoading && !trendsError && !trendsWarning && trends.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {trends.map((trend, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          searchHotTopics(trend.keyword);
                        }}
                        className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                      >
                        <span className="text-xs text-white/20 font-mono w-5 flex-shrink-0 text-right">
                          {idx + 1}
                        </span>
                        <span className="text-sm text-white/70 group-hover:text-white transition-colors flex-1 truncate">
                          {trend.keyword}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {trend.tag && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                trend.tag === "爆"
                                  ? "bg-red-500/20 text-red-400"
                                  : trend.tag === "新"
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-orange-500/20 text-orange-400"
                              }`}
                            >
                              {trend.tag}
                            </span>
                          )}
                          {trend.heat && (
                            <span className="text-xs text-white/20 hidden sm:inline">{trend.heat}</span>
                          )}
                          <span className="text-white/20 group-hover:text-white/50 transition-colors text-xs">→</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!trendsLoading && !trendsError && !trendsWarning && trends.length === 0 && (
                  <p className="text-sm text-white/30 text-center py-6">暂无数据，请刷新重试</p>
                )}
              </div>

              {/* Footer note */}
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
                <p className="text-xs text-white/20">
                  {trendSource === "google" && "数据来源：Google Trends 官方接口，约1小时更新"}
                  {trendSource === "douyin" && "数据来源：抖音热搜榜官方接口，约15分钟更新"}
                  {trendSource === "xiaohongshu" && "数据来源：小红书热搜榜，约15分钟更新"}
                  {trendSource === "x" && "数据来源：trends24.in 聚合 X/Twitter 实时热榜，约15分钟更新"}
                </p>
                <p className="text-xs text-white/20">点击任意词 → AI 生成选题建议</p>
              </div>
            </div>

            {/* ── Keyword Trend Search ── */}
            <div className="border border-white/8 rounded-2xl overflow-hidden">
              {/* Header + Search input */}
              <div className="px-5 py-4 border-b border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">🔎 关键词热内容</span>
                    <span className="text-xs text-white/30">搜一个词，看各平台的热门内容</span>
                  </div>
                  {/* Time range pills */}
                  <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg">
                    {(["24h", "48h", "7d"] as const).map((tr) => (
                      <button
                        key={tr}
                        onClick={() => setKwTimeRange(tr)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          kwTimeRange === tr
                            ? "bg-white/15 text-white"
                            : "text-white/30 hover:text-white/60"
                        }`}
                      >
                        {tr === "24h" ? "24小时" : tr === "48h" ? "48小时" : "7天"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={kwSearchInput}
                    onChange={(e) => setKwSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchKeywordTrend()}
                    placeholder="输入关键词，如：副业、AI创业、减脂..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    onClick={() => searchKeywordTrend()}
                    disabled={kwSearchLoading || !kwSearchInput.trim() || kwCooldown > 0}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-white/8 hover:bg-white/15 text-white/70 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap border border-white/10 min-w-[72px]"
                  >
                    {kwSearchLoading ? "搜索中…" : kwCooldown > 0 ? `${kwCooldown}s` : "搜索"}
                  </button>
                </div>
              </div>

              {/* Loading */}
              {kwSearchLoading && (
                <div className="flex items-center justify-center gap-3 py-10">
                  <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-sm text-white/30">正在查询 X · Reddit…</span>
                </div>
              )}

              {/* Error */}
              {kwSearchError && !kwSearchLoading && (
                <div className="flex items-center justify-between m-4 py-3 px-4 bg-red-500/5 border border-red-500/15 rounded-xl">
                  <span className="text-sm text-red-400/80">{kwSearchError}</span>
                  <button onClick={() => searchKeywordTrend()} className="text-xs text-white/40 hover:text-white/70">重试</button>
                </div>
              )}

              {/* Results — platform tabs */}
              {!kwSearchLoading && !kwSearchError && kwPlatforms.length > 0 && (
                <div>
                  {/* Platform tabs — scrollable row */}
                  <div className="flex gap-1 px-5 pt-4 overflow-x-auto pb-1">
                    {kwPlatforms.map((p) => (
                      <button
                        key={p.platform}
                        onClick={() => setKwActiveTab(p.platform)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                          kwActiveTab === p.platform
                            ? "bg-white/10 text-white"
                            : "text-white/35 hover:text-white/60"
                        }`}
                      >
                        <span>{p.icon}</span>
                        <span>{p.label}</span>
                        {p.items.length > 0 && (
                          <span className="ml-0.5 text-[10px] text-white/30">{p.items.length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Active tab content */}
                  {kwPlatforms.map((p) =>
                    p.platform !== kwActiveTab ? null : (
                      <div key={p.platform} className="px-5 py-3 space-y-1.5">
                        {/* Data type badge */}
                        <div className="flex items-center gap-2 pb-1 flex-wrap">
                          {p.dataType === "realViews" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-medium">
                              ✓ 真实数据（含互动量）
                            </span>
                          )}
                          {p.dataType === "trending" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70 font-medium">
                              📡 热榜话题（无法获取播放量）
                            </span>
                          )}
                          {p.dataType === "news" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 font-medium">
                              🔍 相关内容（无法获取播放量）
                            </span>
                          )}
                          {p.error && (
                            <p className="text-xs text-yellow-400/50">⚠ {p.error}</p>
                          )}
                        </div>

                        {p.items.length === 0 ? (
                          <p className="text-sm text-white/25 text-center py-6">
                            暂无数据，请换个关键词或时间范围
                          </p>
                        ) : (
                          p.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="group flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors"
                            >
                              <span className="text-xs text-white/20 font-mono w-5 flex-shrink-0 text-right mt-0.5">
                                {idx + 1}
                              </span>
                              <span className="text-sm text-white/70 flex-1 leading-snug line-clamp-2">
                                {item.title}
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                {item.heat && (
                                  <span
                                    className={`text-xs hidden sm:inline ${
                                      p.dataType === "realViews"
                                        ? "text-green-400/60 font-medium"
                                        : "text-white/25"
                                    }`}
                                  >
                                    {item.heat}
                                  </span>
                                )}
                                {item.url && (
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="查看原文"
                                    className="text-xs text-white/20 hover:text-white/60 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    ↗
                                  </a>
                                )}
                                <button
                                  onClick={() => searchHotTopics(item.title)}
                                  title="AI 生成选题"
                                  className="text-xs text-white/20 hover:text-white/70 transition-colors"
                                >
                                  ✦
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  )}

                  <div className="px-5 py-3 border-t border-white/5">
                    <p className="text-xs text-white/20">
                      ✦ 点击生成AI选题 &nbsp;↗ 查看原文 &nbsp;·&nbsp; X 显示真实浏览/点赞量，Reddit 显示真实票数和评论数
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state before search */}
              {!kwSearchLoading && !kwSearchError && kwPlatforms.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <p className="text-sm text-white/20">输入关键词，查看 X 和 Reddit 的热门内容</p>
                  <p className="text-xs text-white/15">X 提供真实浏览量与点赞数 &nbsp;|&nbsp; Reddit 提供真实票数与评论数</p>
                </div>
              )}
            </div>

            {/* AI Topic Generation from keyword */}
            <div className="space-y-2">
              <p className="text-xs text-white/30">或直接输入关键词，让 AI 生成选题</p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={hotKeyword}
                  onChange={(e) => setHotKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchHotTopics()}
                  placeholder={
                    locale === "zh"
                      ? "输入关键词，如：副业、情绪管理、健身..."
                      : "Enter keywords, e.g. productivity, fitness, side hustle..."
                  }
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                />
                <button
                  onClick={() => searchHotTopics()}
                  disabled={loading || !hotKeyword.trim()}
                  className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t.loadingTopics : "AI 生成选题"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-sm text-white/40">{t.loadingTopics}</span>
          </div>
        )}

        {/* Topics Grid */}
        {topics.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30">
                {locale === "zh"
                  ? `共 ${topics.length} 个选题建议`
                  : `${topics.length} topic suggestions`}
              </p>
              {hotKeyword && (
                <span className="text-xs text-white/25">
                  基于关键词：<span className="text-white/50">{hotKeyword}</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((topic, index) => (
                <div
                  key={index}
                  className="border border-white/8 rounded-2xl p-5 space-y-4 hover:border-white/15 transition-colors bg-white/[0.02]"
                >
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold leading-snug">{topic.title}</h3>
                    <p className="text-xs text-white/40 leading-relaxed">{topic.angle}</p>
                  </div>

                  <div className="flex gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-white/30">{t.viralScore}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/60 rounded-full"
                            style={{ width: `${topic.viralScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/70">{topic.viralScore}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-white/30">{t.matchScore}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400/60 rounded-full"
                            style={{ width: `${topic.matchScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/70">{topic.matchScore}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-white/30">{t.competition}</p>
                      <span
                        className={`text-xs font-medium ${
                          COMPETITION_COLORS[topic.competitionLevel] || "text-white/50"
                        }`}
                      >
                        {topic.competitionLevel}
                      </span>
                    </div>
                  </div>

                  {topic.platforms && topic.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {topic.platforms.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 bg-white/5 rounded-full text-xs text-white/40"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => goCreate(topic)}
                      className="flex-1 bg-white text-black py-2 rounded-lg text-xs font-semibold hover:bg-white/90 transition-colors"
                    >
                      {t.createContent} →
                    </button>
                    <button
                      onClick={() => saveTopic(topic, index)}
                      disabled={topic.saved || savingId === index}
                      className={`px-4 py-2 rounded-lg text-xs border transition-colors ${
                        topic.saved
                          ? "border-white/10 text-white/20 cursor-default"
                          : "border-white/15 text-white/50 hover:border-white/30 hover:text-white/80"
                      }`}
                    >
                      {topic.saved ? `${t.saved} ✓` : savingId === index ? "..." : t.saveToLibrary}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && topics.length === 0 && mode === "ai" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
            <span className="text-4xl text-white/10">◎</span>
            <p className="text-sm text-white/30">
              {locale === "zh"
                ? "点击「AI 推荐选题」，AI 为你推荐专属选题"
                : "Click \"AI Recommend Topics\" to get personalized suggestions"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
