"use client";
// v2 - chatbot editor + delete
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { exportToWord, exportToPDF } from "@/lib/export";
import { useLanguage } from "@/contexts/LanguageContext";

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const PLATFORM_FILTERS_ZH = ["全部", "小红书", "公众号", "X", "Instagram", "YouTube", "抖音"];
const PLATFORM_FILTERS_EN = ["All", "Xiaohongshu", "WeChat Official", "X", "Instagram", "YouTube", "TikTok"];

const PLATFORM_NAME_EN: Record<string, string> = {
  "小红书": "Xiaohongshu",
  "公众号": "WeChat Official",
  "X": "X",
  "Instagram": "Instagram",
  "YouTube": "YouTube",
  "抖音": "TikTok",
};

// QUICK_REVISIONS now comes from t.quickRevisions

export default function LibraryPage() {
  const { t, locale } = useLanguage();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "graphic" | "script">("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [exporting, setExporting] = useState<"word" | "pdf" | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Chatbot state (per selected item)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const PLATFORM_FILTERS = locale === "zh" ? PLATFORM_FILTERS_ZH : PLATFORM_FILTERS_EN;
  const ALL_VALUE = locale === "zh" ? "全部" : "All";

  useEffect(() => {
    fetch("/api/content")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Clear chat when switching items
  const selectItem = (item: ContentItem) => {
    setSelectedItem(item);
    setChatMessages([]);
    setChatInput("");
    setSaveStatus("idle");
    setConfirmDeleteId(null);
  };

  // Map EN display name back to ZH DB value for filtering
  const PLATFORM_NAME_ZH: Record<string, string> = Object.fromEntries(
    Object.entries(PLATFORM_NAME_EN).map(([zh, en]) => [en, zh])
  );
  const platformFilterZH =
    platformFilter === "all"
      ? "all"
      : PLATFORM_NAME_ZH[platformFilter] ?? platformFilter;

  const filtered = items.filter((item) => {
    const typeMatch =
      tab === "all" ||
      (tab === "graphic" && item.contentType === "graphic") ||
      (tab === "script" && item.contentType === "script");
    const platformMatch =
      platformFilterZH === "all" || item.platform === platformFilterZH;
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
      alert(t.error);
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
      alert(t.error);
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        if (selectedItem?.id === id) {
          setSelectedItem(null);
          setChatMessages([]);
        }
        setConfirmDeleteId(null);
      }
    } catch {
      alert(t.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  // Chatbot send message
  const sendChatMessage = async (overrideMessage?: string) => {
    if (!selectedItem) return;
    const message = (overrideMessage ?? chatInput).trim();
    if (!message || isChatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: message };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/ai/chat-revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentContent: selectedItem.content,
          userMessage: message,
          chatHistory: chatMessages,
          topic: selectedItem.title,
          platform: selectedItem.platform,
          contentType: selectedItem.contentType,
          locale,
        }),
      });

      const data = await res.json();

      if (data.updatedContent) {
        // Update selected item content
        const updatedItem = { ...selectedItem, content: data.updatedContent };
        setSelectedItem(updatedItem);
        setItems((prev) =>
          prev.map((item) =>
            item.id === selectedItem.id
              ? { ...item, content: data.updatedContent }
              : item
          )
        );

        const aiMsg: ChatMessage = {
          role: "assistant",
          content: data.assistantMessage || t.aiModified,
        };
        setChatMessages([...newMessages, aiMsg]);

        // Auto-save to DB
        setSaveStatus("saving");
        await fetch(`/api/content/${selectedItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: data.updatedContent }),
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setChatMessages([
          ...newMessages,
          { role: "assistant", content: t.modifyFailed },
        ]);
      }
    } catch {
      setChatMessages([
        ...newMessages,
        { role: "assistant", content: t.networkError },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d
      .getHours()
      .toString()
      .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const TABS = [
    { value: "all", label: t.allTab },
    { value: "graphic", label: t.graphic },
    { value: "script", label: t.scriptsTab },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            ← {t.dashboardTitle}
          </Link>
          <span className="text-sm font-semibold">{t.libraryTitle}</span>
        </div>
        <Link
          href="/create"
          className="text-xs bg-white text-black px-4 py-1.5 rounded-full font-medium hover:bg-white/90 transition-colors"
        >
          + {t.contentFactory}
        </Link>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* ── Left: List ── */}
        <div className="w-80 border-r border-white/5 flex flex-col flex-shrink-0">
          {/* Tabs */}
          <div className="flex gap-1 p-3 border-b border-white/5">
            {TABS.map((tb) => (
              <button
                key={tb.value}
                onClick={() => setTab(tb.value as "all" | "graphic" | "script")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tab === tb.value
                    ? "bg-white/10 text-white"
                    : "text-white/30 hover:text-white/60"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>

          {/* Platform Filter */}
          <div className="px-3 py-2 border-b border-white/5">
            <div className="flex gap-1 flex-wrap">
              {PLATFORM_FILTERS.map((p, i) => {
                const filterVal = i === 0 ? "all" : p;
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(filterVal)}
                    className={`px-2.5 py-1 rounded-full text-xs transition-all ${
                      platformFilter === filterVal
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
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
                  {items.length === 0
                    ? t.emptyLibrary
                    : locale === "zh"
                    ? t.noFilteredContent
                    : t.noFilteredContent}
                </p>
                {items.length === 0 && (
                  <Link
                    href="/create"
                    className="text-xs text-white/50 hover:text-white transition-colors"
                  >
                    {t.goCreate}
                  </Link>
                )}
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map((item) => (
                  <div key={item.id} className="relative group">
                    <button
                      onClick={() => selectItem(item)}
                      className={`w-full text-left px-4 py-4 hover:bg-white/[0.03] transition-colors ${
                        selectedItem?.id === item.id ? "bg-white/5" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm font-medium leading-snug line-clamp-2 pr-6">
                            {item.title}
                          </p>
                          <div className="flex gap-2">
                            <span className="text-xs text-white/30">
                              {locale === "en" ? PLATFORM_NAME_EN[item.platform] ?? item.platform : item.platform}
                            </span>
                            <span className="text-xs text-white/20">·</span>
                            <span className="text-xs text-white/30">
                              {item.contentType === "graphic"
                                ? t.graphic
                                : t.script}
                            </span>
                            <span className="text-xs text-white/20">·</span>
                            <span className="text-xs text-white/20">
                              {item.wordCount || 0}
                              {t.wordCount}
                            </span>
                          </div>
                          <span className="text-xs text-white/20">
                            {formatDate(item.createdAt)}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Delete button */}
                    <div className="absolute top-3 right-3">
                      {confirmDeleteId === item.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(item.id);
                            }}
                            disabled={deletingId === item.id}
                            className="px-2 py-0.5 rounded text-[10px] bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                          >
                            {deletingId === item.id ? "..." : t.confirmBtn}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded text-[10px] border border-white/10 text-white/40 hover:text-white/70 transition-colors"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title={t.deleteBtn}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/5">
            <p className="text-xs text-white/20">
              {filtered.length} {locale === "zh" ? "篇内容" : "items"}
            </p>
          </div>
        </div>

        {/* ── Right: Detail + Chatbot ── */}
        <div className="flex-1 flex overflow-hidden">
          {selectedItem ? (
            <>
              {/* Content area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 flex-shrink-0 flex items-center justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h2 className="text-sm font-semibold truncate">
                      {selectedItem.title}
                    </h2>
                    <div className="flex gap-3 text-xs text-white/30">
                      <span>{locale === "en" ? PLATFORM_NAME_EN[selectedItem.platform] ?? selectedItem.platform : selectedItem.platform}</span>
                      <span>
                        {selectedItem.contentType === "graphic"
                          ? t.graphic
                          : t.script}
                      </span>
                      <span>
                        {selectedItem.wordCount || 0} {t.wordCount}
                      </span>
                      <span>{formatDate(selectedItem.createdAt)}</span>
                      {saveStatus === "saving" && (
                        <span className="text-white/30 flex items-center gap-1">
                          <span className="w-2 h-2 border border-white/20 border-t-white/50 rounded-full animate-spin inline-block" />
                          {t.savingShort}
                        </span>
                      )}
                      {saveStatus === "saved" && (
                        <span className="text-green-400/70">{t.savedShort}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => copyContent(selectedItem.content)}
                      className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors"
                    >
                      {copySuccess ? `${t.copied} ✓` : t.copy}
                    </button>
                    <button
                      onClick={() => handleExportWord(selectedItem)}
                      disabled={exporting === "word"}
                      className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors disabled:opacity-40"
                    >
                      {exporting === "word" ? t.exporting : t.exportWord}
                    </button>
                    <button
                      onClick={() => handleExportPDF(selectedItem)}
                      disabled={exporting === "pdf"}
                      className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/50 hover:border-white/30 hover:text-white/80 transition-colors disabled:opacity-40"
                    >
                      {exporting === "pdf" ? t.exporting : t.exportPDF}
                    </button>
                    <button
                      onClick={() => handleDelete(selectedItem.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        confirmDeleteId === selectedItem.id
                          ? "bg-red-500/80 text-white"
                          : "border border-white/10 text-white/30 hover:border-red-500/40 hover:text-red-400"
                      }`}
                    >
                      {confirmDeleteId === selectedItem.id
                        ? deletingId === selectedItem.id
                          ? t.deletingBtn
                          : t.confirmDeleteFull
                        : t.deleteBtn}
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <pre className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                    {selectedItem.content}
                  </pre>
                </div>
              </div>

              {/* Chatbot sidebar */}
              <div className="w-72 flex-shrink-0 border-l border-white/5 flex flex-col bg-white/[0.01]">
                {/* Chat header */}
                <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
                  <p className="text-xs font-semibold text-white/70">
                    {t.aiChatTitle}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {t.aiChatLibSubtitle}
                  </p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-6">
                      <p className="text-xs text-white/20 leading-relaxed">
                        {t.chatLibEmptyLine1}
                        <br />
                        {t.chatLibEmptyLine2}
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-white text-black"
                            : "bg-white/8 text-white/80 border border-white/8"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white/8 border border-white/8 px-3 py-2 rounded-xl">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <div
                            className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <div
                            className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick revision chips */}
                <div className="px-4 py-2 border-t border-white/5 flex-shrink-0">
                  <div className="flex flex-wrap gap-1.5">
                    {t.quickRevisions.map((r) => (
                      <button
                        key={r}
                        onClick={() => sendChatMessage(r)}
                        disabled={isChatLoading}
                        className="px-2 py-1 rounded-lg text-[11px] border border-white/8 text-white/35 hover:border-white/20 hover:text-white/60 transition-colors disabled:opacity-30"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-white/5 flex-shrink-0">
                  <div className="flex gap-2">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder={t.chatLibPlaceholder}
                      rows={2}
                      disabled={isChatLoading}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors resize-none disabled:opacity-40"
                    />
                    <button
                      onClick={() => sendChatMessage()}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="px-3 py-2 bg-white text-black rounded-xl text-xs font-semibold hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
                    >
                        {t.sendBtn}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl text-white/5">◉</span>
              <p className="text-sm text-white/20">
                {locale === "zh"
                  ? t.selectToView
                  : t.selectToView}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
