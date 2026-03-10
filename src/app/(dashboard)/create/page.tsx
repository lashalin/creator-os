"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

const PLATFORMS = ["小红书", "公众号", "X", "Instagram", "YouTube", "抖音"];

function CreatePageInner() {
  const searchParams = useSearchParams();
  const { t } = useLanguage();

  const [title, setTitle] = useState(searchParams.get("title") || "");
  const [angle, setAngle] = useState(searchParams.get("angle") || "");
  const [platform, setPlatform] = useState("小红书");
  const [contentType, setContentType] = useState("graphic");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  const topicId = searchParams.get("topicId") || "";

  const CONTENT_TYPES = [
    { value: "graphic", label: t.graphic, desc: t.graphic === "图文" ? "适合图文发布" : "Great for articles & posts" },
    { value: "script", label: t.script, desc: t.script === "口播逐字稿" ? "适合真人出镜" : "Great for video creators" },
  ];

  const generate = async () => {
    if (!title.trim()) {
      alert(t.topicTitleLabel);
      return;
    }
    setLoading(true);
    setGeneratedContent("");
    setSaved(false);
    try {
      const res = await fetch("/api/ai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, angle, platform, contentType, additionalContext }),
      });
      const data = await res.json();
      if (res.status === 429 && data.error === "LIMIT_REACHED") {
        setLimitReached(true);
      } else if (data.content) {
        setGeneratedContent(data.content);
        setLimitReached(false);
      } else {
        alert(data.error || t.error);
      }
    } catch {
      alert(t.error);
    } finally {
      setLoading(false);
    }
  };

  const saveContent = async () => {
    if (!generatedContent) return;
    setSaving(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          contentType,
          platform,
          content: generatedContent,
          topicId: topicId || undefined,
          status: "draft",
        }),
      });
      const data = await res.json();
      if (data.item) {
        setSaved(true);
      } else {
        alert(t.error);
      }
    } catch {
      alert(t.error);
    } finally {
      setSaving(false);
    }
  };

  const copyContent = async () => {
    if (!generatedContent) return;
    await navigator.clipboard.writeText(generatedContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link href="/topics" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← {t.topicRadar}
          </Link>
          <span className="text-sm font-semibold">{t.contentFactory}</span>
        </div>
        <Link href="/library" className="text-xs text-white/30 hover:text-white/60 transition-colors">
          {t.library}
        </Link>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Config */}
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-bold">{t.createTitle}</h1>
              <p className="text-xs text-white/30">{t.noProfileDesc}</p>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <label className="text-xs text-white/40">{t.topicTitleLabel} *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t.topicTitlePlaceholder}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            {/* Angle */}
            <div className="space-y-2">
              <label className="text-xs text-white/40">{t.angleLabel}</label>
              <input
                type="text"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder={t.anglePlaceholder}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
              />
            </div>

            {/* Platform */}
            <div className="space-y-2">
              <label className="text-xs text-white/40">{t.platformLabel}</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-4 py-2 rounded-full text-xs font-medium transition-all ${
                      platform === p
                        ? "bg-white text-black"
                        : "border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Type */}
            <div className="space-y-2">
              <label className="text-xs text-white/40">{t.contentTypeLabel}</label>
              <div className="grid grid-cols-2 gap-3">
                {CONTENT_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => setContentType(ct.value)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      contentType === ct.value
                        ? "border-white/30 bg-white/5"
                        : "border-white/8 hover:border-white/20"
                    }`}
                  >
                    <p className="text-sm font-medium">{ct.label}</p>
                    <p className="text-xs text-white/30 mt-0.5">{ct.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Additional Context */}
            <div className="space-y-2">
              <label className="text-xs text-white/40">{t.additionalLabel}</label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder={t.additionalPlaceholder}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
              />
            </div>

            <button
              onClick={generate}
              disabled={loading || !title.trim()}
              className="w-full bg-white text-black py-3.5 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? t.generatingContent : t.generateBtn}
            </button>

            {limitReached && (
              <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4 space-y-2 text-center">
                <p className="text-sm text-yellow-400/80">{t.limitReachedTitle}</p>
                <p className="text-xs text-white/30">{t.limitReachedDesc}</p>
                <Link
                  href="/pricing"
                  className="inline-block text-xs bg-white text-black px-5 py-2 rounded-full font-semibold hover:bg-white/90 transition-colors"
                >
                  {t.upgradeNow}
                </Link>
              </div>
            )}
          </div>

          {/* Right: Output */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/60">{t.generatedResult}</h2>
              {generatedContent && (
                <div className="flex gap-2">
                  <button
                    onClick={copyContent}
                    className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/40 hover:border-white/30 hover:text-white/70 transition-colors"
                  >
                    {copySuccess ? `${t.copied} ✓` : t.copy}
                  </button>
                  <button
                    onClick={saveContent}
                    disabled={saving || saved}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      saved
                        ? "bg-white/10 text-white/30 cursor-default"
                        : "bg-white text-black hover:bg-white/90"
                    }`}
                  >
                    {saved ? `${t.saved} ✓` : saving ? t.saving : t.saveToLibraryBtn}
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-[500px] bg-white/[0.02] border border-white/8 rounded-2xl p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                  <div className="w-5 h-5 border border-white/20 border-t-white rounded-full animate-spin" />
                  <p className="text-xs text-white/30">{t.generatingContent}</p>
                </div>
              ) : generatedContent ? (
                <div className="space-y-2">
                  <div className="flex gap-2 text-xs text-white/20 mb-4">
                    <span className="px-2 py-0.5 bg-white/5 rounded">{platform}</span>
                    <span className="px-2 py-0.5 bg-white/5 rounded">
                      {contentType === "graphic" ? t.graphic : t.script}
                    </span>
                    <span className="px-2 py-0.5 bg-white/5 rounded">
                      {generatedContent.replace(/\s/g, "").length} {t.wordCount}
                    </span>
                  </div>
                  <pre className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                    {generatedContent}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-20 gap-3 text-center">
                  <span className="text-4xl text-white/10">◈</span>
                  <p className="text-xs text-white/20">{t.generateBtn}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-5 h-5 border border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    }>
      <CreatePageInner />
    </Suspense>
  );
}
