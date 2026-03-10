"use client";
import { useState } from "react";
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

const COMPETITION_COLORS: Record<string, string> = {
  低: "text-green-400",
  中: "text-yellow-400",
  高: "text-red-400",
  Low: "text-green-400",
  Medium: "text-yellow-400",
  High: "text-red-400",
};

export default function TopicsPage() {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [mode, setMode] = useState<"ai" | "hot">("ai");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [hotKeyword, setHotKeyword] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

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

  const searchHotTopics = async () => {
    if (!hotKeyword.trim()) return;
    setLoading(true);
    setTopics([]);
    try {
      const res = await fetch("/api/ai/hot-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: hotKeyword }),
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

        {/* Controls */}
        {mode === "ai" ? (
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
        ) : (
          <div className="flex gap-3">
            <input
              type="text"
              value={hotKeyword}
              onChange={(e) => setHotKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchHotTopics()}
              placeholder={locale === "zh" ? "输入关键词，如：副业、情绪管理、健身..." : "Enter keywords, e.g. productivity, fitness, side hustle..."}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
            <button
              onClick={searchHotTopics}
              disabled={loading || !hotKeyword.trim()}
              className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t.loadingTopics : t.fetchHot}
            </button>
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
                {locale === "zh" ? `共 ${topics.length} 个选题建议` : `${topics.length} topic suggestions`}
              </p>
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
                          <div className="h-full bg-white/60 rounded-full" style={{ width: `${topic.viralScore}%` }} />
                        </div>
                        <span className="text-xs font-mono text-white/70">{topic.viralScore}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-white/30">{t.matchScore}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400/60 rounded-full" style={{ width: `${topic.matchScore}%` }} />
                        </div>
                        <span className="text-xs font-mono text-white/70">{topic.matchScore}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-white/30">{t.competition}</p>
                      <span className={`text-xs font-medium ${COMPETITION_COLORS[topic.competitionLevel] || "text-white/50"}`}>
                        {topic.competitionLevel}
                      </span>
                    </div>
                  </div>

                  {topic.platforms && topic.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {topic.platforms.map((p) => (
                        <span key={p} className="px-2 py-0.5 bg-white/5 rounded-full text-xs text-white/40">{p}</span>
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
        {!loading && topics.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 space-y-3 text-center">
            <span className="text-4xl text-white/10">◎</span>
            <p className="text-sm text-white/30">
              {mode === "ai"
                ? (locale === "zh" ? "点击「AI 推荐选题」，AI 为你推荐专属选题" : "Click \"AI Recommend Topics\" to get personalized suggestions")
                : (locale === "zh" ? "输入关键词搜索平台热文选题" : "Enter keywords to search trending topics")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
