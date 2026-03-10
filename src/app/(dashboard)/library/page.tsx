"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { exportToWord, exportToPDF } from "@/lib/export";

interface ContentItem {
  id: string;
  title: string;
  contentType: string;
  platform: string;
  content: string;
  status: string;
  wordCount: number;
  createdAt: string;
}

const PLATFORM_FILTERS = ["全部", "小红书", "公众号", "X", "Instagram", "YouTube", "抖音"];

export default function LibraryPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "graphic" | "script">("all");
  const [platformFilter, setPlatformFilter] = useState("全部");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [exporting, setExporting] = useState<"word" | "pdf" | null>(null);

  useEffect(() => {
    fetch("/api/content")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) => {
    const typeMatch =
      tab === "all" ||
      (tab === "graphic" && item.contentType === "graphic") ||
      (tab === "script" && item.contentType === "script");
    const platformMatch = platformFilter === "全部" || item.platform === platformFilter;
    return typeMatch && platformMatch;
  });

  const copyContent = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleExportWord = async (item: ContentItem) => {
    setExporting("word");
    try {
      await exportToWord(item.title, item.content, item.platform, item.contentType);
    } catch (e) {
      console.error(e);
      alert("导出失败，请重试");
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = (item: ContentItem) => {
    setExporting("pdf");
    try {
      exportToPDF(item.title, item.content, item.platform, item.contentType);
    } catch (e) {
      console.error(e);
      alert("导出失败，请重试");
    } finally {
      setExporting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← 主页
          </Link>
          <span className="text-sm font-semibold">内容库</span>
        </div>
        <Link href="/create" className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-medium hover:bg-white/90 transition-colors">
          + 生成内容
        </Link>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left: List */}
        <div className="w-96 border-r border-white/5 flex flex-col">
          {/* Tabs */}
          <div className="flex gap-1 p-3 border-b border-white/5">
            {[
              { value: "all", label: "全部" },
              { value: "graphic", label: "图文" },
              { value: "script", label: "口播稿" },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value as "all" | "graphic" | "script")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === t.value ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Platform Filter */}
          <div className="px-3 py-2 border-b border-white/5">
            <div className="flex gap-1 flex-wrap">
              {PLATFORM_FILTERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                    platformFilter === p
                      ? "bg-white/10 text-white"
                      : "text-white/30 hover:text-white/50"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                <span className="text-3xl text-white/10">◉</span>
                <p className="text-xs text-white/30">
                  {items.length === 0 ? "内容库还是空的，去内容工厂创建第一篇吧" : "没有符合筛选条件的内容"}
                </p>
                {items.length === 0 && (
                  <Link
                    href="/create"
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    去生成 →
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`w-full text-left px-4 py-4 hover:bg-white/[0.03] transition-colors ${
                      selectedItem?.id === item.id ? "bg-white/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="text-sm font-medium leading-snug line-clamp-2">{item.title}</p>
                        <div className="flex gap-2">
                          <span className="text-xs text-white/30">{item.platform}</span>
                          <span className="text-xs text-white/20">·</span>
                          <span className="text-xs text-white/30">
                            {item.contentType === "graphic" ? "图文" : "口播稿"}
                          </span>
                          <span className="text-xs text-white/20">·</span>
                          <span className="text-xs text-white/20">{item.wordCount || 0}字</span>
                        </div>
                      </div>
                      <span className="text-xs text-white/20 shrink-0 mt-0.5">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/5">
            <p className="text-xs text-white/20">{filtered.length} 篇内容</p>
          </div>
        </div>

        {/* Right: Detail */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedItem ? (
            <>
              <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-sm font-semibold">{selectedItem.title}</h2>
                  <div className="flex gap-3 text-xs text-white/30">
                    <span>{selectedItem.platform}</span>
                    <span>{selectedItem.contentType === "graphic" ? "图文" : "口播稿"}</span>
                    <span>{selectedItem.wordCount || 0} 字</span>
                    <span>{formatDate(selectedItem.createdAt)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyContent(selectedItem.content)}
                    className="px-3 py-2 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors"
                  >
                    {copySuccess ? "已复制 ✓" : "复制"}
                  </button>
                  <button
                    onClick={() => handleExportWord(selectedItem)}
                    disabled={exporting === "word"}
                    className="px-3 py-2 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors disabled:opacity-40"
                  >
                    {exporting === "word" ? "导出中..." : "Word"}
                  </button>
                  <button
                    onClick={() => handleExportPDF(selectedItem)}
                    disabled={exporting === "pdf"}
                    className="px-3 py-2 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors disabled:opacity-40"
                  >
                    {exporting === "pdf" ? "导出中..." : "PDF"}
                  </button>
                  <Link
                    href={`/create?title=${encodeURIComponent(selectedItem.title)}`}
                    className="px-3 py-2 bg-white/10 rounded-lg text-xs text-white/70 hover:bg-white/15 transition-colors"
                  >
                    重新生成
                  </Link>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <pre className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedItem.content}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl text-white/5">◉</span>
              <p className="text-sm text-white/20">从左侧选择一篇内容查看</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
