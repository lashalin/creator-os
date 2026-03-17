"use client";
import { useState, Suspense, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

const PLATFORMS_ZH = ["小红书", "公众号", "X", "Instagram", "YouTube", "抖音"];
const PLATFORMS_EN: Record<string, string> = {
  "小红书": "Xiaohongshu",
  "公众号": "WeChat Official",
  "X": "X",
  "Instagram": "Instagram",
  "YouTube": "YouTube",
  "抖音": "TikTok",
};

type Step = "entry" | "evaluate" | "interview" | "editor";
type EntryMode = "hot" | "topic" | "material";

interface Evaluation {
  refinedTitle: string;
  coreAngle: string;
  evaluation: {
    viralScore: number;
    differentiationScore: number;
    commercialScore: number;
    summary: string;
    strengths: string[];
    suggestions: string[];
  };
  recommendedPlatforms: string[];
  contentType: string;
}

interface Question {
  id: string;
  layer: string;
  question: string;
  hint: string;
}

interface QAAnswer {
  questionId: string;
  question: string;
  answer: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-white/50">{label}</span>
        <span className="text-xs font-semibold">{score}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function CreatePageInner() {
  const { t, locale } = useLanguage();
  const searchParams = useSearchParams();

  const urlTitle = searchParams.get("title") || "";
  const urlAngle = searchParams.get("angle") || "";
  const urlTopicId = searchParams.get("topicId") || "";

  const [step, setStep] = useState<Step>(urlTitle ? "evaluate" : "entry");
  const [entryMode, setEntryMode] = useState<EntryMode | null>(
    urlTitle ? "hot" : null
  );

  // Entry state
  const [topicInput, setTopicInput] = useState("");
  const [materialInput, setMaterialInput] = useState("");

  // Evaluate state
  const [evalTitle, setEvalTitle] = useState(urlTitle);
  const [evalAngle, setEvalAngle] = useState(urlAngle);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Interview state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qaAnswers, setQaAnswers] = useState<QAAnswer[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  // Platform/type
  const [platform, setPlatform] = useState("小红书");
  const [contentType, setContentType] = useState("graphic");

  // Editor state
  const [content, setContent] = useState("");
  const [contentId, setContentId] = useState<string | null>(null);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Chatbot state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // ── ENTRY ──────────────────────────────────────────────
  const handleTopicEntry = () => {
    if (!topicInput.trim()) return;
    setEvalTitle(topicInput.trim());
    setEvalAngle("");
    setEntryMode("topic");
    setStep("evaluate");
    runEvaluate({ topic: topicInput.trim() });
  };

  const handleMaterialEntry = () => {
    if (!materialInput.trim()) return;
    setEntryMode("material");
    setEvalTitle("");
    setEvalAngle("");
    setStep("evaluate");
    runEvaluate({ material: materialInput.trim() });
  };

  const runEvaluate = async (payload: {
    topic?: string;
    material?: string;
  }) => {
    setEvaluating(true);
    setEvaluation(null);
    try {
      const res = await fetch("/api/ai/evaluate-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, locale }),
      });
      const data = await res.json();
      if (data.refinedTitle) {
        setEvaluation(data);
        setEvalTitle(data.refinedTitle);
        setEvalAngle(data.coreAngle);
        if (data.recommendedPlatforms?.[0]) {
          setPlatform(data.recommendedPlatforms[0]);
        }
      }
    } catch {
      // silent fail
    } finally {
      setEvaluating(false);
    }
  };

  // ── INTERVIEW ──────────────────────────────────────────
  const loadQuestions = async () => {
    setLoadingQuestions(true);
    setQuestionsError(null);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: evalTitle, angle: evalAngle, locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQuestionsError(t.questionsGenFailed);
        return;
      }
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setQaAnswers(
          data.questions.map((q: Question) => ({
            questionId: q.id,
            question: q.question,
            answer: "",
          }))
        );
      } else {
        setQuestionsError(t.questionsAIFailed);
      }
    } catch {
      setQuestionsError(t.networkError);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const goToInterview = async () => {
    setStep("interview");
    setQuestionsError(null);
    if (questions.length === 0) {
      await loadQuestions();
    }
  };

  const updateAnswer = (idx: number, value: string) => {
    setQaAnswers((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], answer: value };
      return updated;
    });
  };

  const answeredCount = qaAnswers.filter((qa) => qa.answer.trim()).length;

  // ── EDITOR: Auto-save content ──────────────────────────
  const autoSave = useCallback(
    async (newContent: string, existingId?: string | null) => {
      setSaveStatus("saving");
      try {
        if (existingId) {
          await fetch(`/api/content/${existingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: newContent }),
          });
        } else {
          const res = await fetch("/api/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: evalTitle,
              contentType,
              platform,
              content: newContent,
              topicId: urlTopicId || undefined,
              status: "draft",
            }),
          });
          const data = await res.json();
          if (data.item?.id) {
            setContentId(data.item.id);
          }
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } catch {
        setSaveStatus("idle");
      }
    },
    [evalTitle, contentType, platform, urlTopicId]
  );

  // ── EDITOR: Generate content ───────────────────────────
  const generateFullContent = async () => {
    setGeneratingContent(true);
    setLimitReached(false);
    setChatMessages([]);
    setContent("");
    setContentId(null);
    setSaveStatus("idle");

    try {
      const res = await fetch("/api/ai/generate-modular-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: evalTitle,
          angle: evalAngle,
          platform,
          contentType,
          qaAnswers: qaAnswers.filter((qa) => qa.answer.trim()),
          sourceMaterial: materialInput.trim() || undefined,
          locale,
        }),
      });
      const data = await res.json();

      if (res.status === 429 && data.error === "LIMIT_REACHED") {
        setLimitReached(true);
        return;
      }

      if (data.content) {
        setContent(data.content);
        setStep("editor");
        await autoSave(data.content, null);
      } else {
        alert(data.error || t.generateFailed);
      }
    } catch {
      alert(t.generateFailed);
    } finally {
      setGeneratingContent(false);
    }
  };

  // ── CHATBOT: Send message ──────────────────────────────
  const sendChatMessage = async (overrideMessage?: string) => {
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
          currentContent: content,
          userMessage: message,
          chatHistory: chatMessages,
          topic: evalTitle,
          platform,
          contentType,
        }),
      });

      const data = await res.json();

      if (data.updatedContent) {
        setContent(data.updatedContent);
        const aiMsg: ChatMessage = {
          role: "assistant",
          content: data.assistantMessage || t.aiModified,
        };
        setChatMessages([...newMessages, aiMsg]);
        await autoSave(data.updatedContent, contentId);
      } else {
        const errMsg: ChatMessage = {
          role: "assistant",
          content: t.modifyFailed,
        };
        setChatMessages([...newMessages, errMsg]);
      }
    } catch {
      const errMsg: ChatMessage = {
        role: "assistant",
        content: t.networkError,
      };
      setChatMessages([...newMessages, errMsg]);
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

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/topics"
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            {t.backToTopics}
          </Link>
          <span className="text-sm font-semibold">{t.createNavTitle}</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-2">
            {[
              { key: "entry", label: t.stepEntryLabel },
              { key: "evaluate", label: t.stepEvaluateLabel },
              { key: "interview", label: t.stepInterviewLabel },
              { key: "editor", label: t.stepEditorLabel },
            ].map((s, i) => {
              const stepOrder = ["entry", "evaluate", "interview", "editor"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s.key);
              const isActive = s.key === step;
              const isDone = thisIdx < currentIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={`w-8 h-px ${isDone ? "bg-white/30" : "bg-white/8"}`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-1.5 ${
                      isActive ? "opacity-100" : isDone ? "opacity-50" : "opacity-20"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                        isActive
                          ? "bg-white text-black"
                          : isDone
                          ? "bg-white/20 text-white"
                          : "border border-white/20 text-white/40"
                      }`}
                    >
                      {isDone ? "✓" : i + 1}
                    </div>
                    <span className="text-xs hidden md:block">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            href="/library"
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            {t.library}
          </Link>
        </div>
      </nav>

      {/* Main */}
      <div className={`flex-1 ${step === "editor" ? "overflow-hidden flex flex-col" : ""}`}>
        <main
          className={
            step === "editor"
              ? "flex-1 flex flex-col overflow-hidden"
              : "max-w-3xl mx-auto px-6 py-10 w-full"
          }
        >
          {/* ── STEP: ENTRY ── */}
          {step === "entry" && (
            <div className="space-y-8">
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">{t.startCreating}</h1>
                <p className="text-sm text-white/40">{t.chooseStartingPoint}</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Link
                  href="/topics"
                  className="group flex items-start gap-5 p-5 border border-white/8 rounded-2xl hover:border-white/20 hover:bg-white/[0.02] transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                    🔥
                  </div>
                  <div className="space-y-1 flex-1">
                    <h3 className="font-semibold group-hover:text-white transition-colors">
                      {t.hotTopicCard}
                    </h3>
                    <p className="text-sm text-white/40">
                      {t.hotTopicCardDesc}
                    </p>
                    <p className="text-xs text-white/20 mt-2">{t.goToTopicRadar}</p>
                  </div>
                </Link>

                <div className="p-5 border border-white/8 rounded-2xl space-y-4">
                  <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                      ✏️
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold">{t.customTopicCard}</h3>
                      <p className="text-sm text-white/40">
                        {t.customTopicCardDesc}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleTopicEntry()
                      }
                      placeholder={t.customTopicPlaceholder}
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                    />
                    <button
                      onClick={handleTopicEntry}
                      disabled={!topicInput.trim()}
                      className="px-5 py-2.5 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {t.evaluateBtn}
                    </button>
                  </div>
                </div>

                <div className="p-5 border border-white/8 rounded-2xl space-y-4">
                  <div className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                      📄
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold">{t.pasteMaterialCard}</h3>
                      <p className="text-sm text-white/40">
                        {t.pasteMaterialCardDesc}
                      </p>
                    </div>
                  </div>
                  <textarea
                    value={materialInput}
                    onChange={(e) => setMaterialInput(e.target.value)}
                    placeholder={t.pasteMaterialPlaceholder}
                    rows={5}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
                  />
                  <button
                    onClick={handleMaterialEntry}
                    disabled={!materialInput.trim()}
                    className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {t.analyzeMaterial}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: EVALUATE ── */}
          {step === "evaluate" && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    if (entryMode === "hot") {
                      window.location.href = "/topics";
                    } else {
                      setStep("entry");
                      setEvaluation(null);
                    }
                  }}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  {t.backBtn}
                </button>
                <h1 className="text-xl font-bold">{t.evaluateStep}</h1>
              </div>

              {materialInput.trim() && (
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/8 border border-purple-500/15 rounded-xl">
                  <span className="text-purple-400/70 text-xs">📄</span>
                  <p className="text-xs text-purple-300/60">
                    {t.materialAdded}
                  </p>
                </div>
              )}

              <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-white/40">{t.topicTitleLabel}</label>
                  <input
                    type="text"
                    value={evalTitle}
                    onChange={(e) => setEvalTitle(e.target.value)}
                    placeholder={t.topicTitleEditPlaceholder}
                    className="w-full bg-transparent border-b border-white/10 pb-2 text-base font-semibold focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/40">{t.angleLabel}</label>
                  <input
                    type="text"
                    value={evalAngle}
                    onChange={(e) => setEvalAngle(e.target.value)}
                    placeholder={t.angleHint}
                    className="w-full bg-transparent border-b border-white/10 pb-2 text-sm focus:outline-none focus:border-white/30 transition-colors text-white/80"
                  />
                </div>
              </div>

              {evaluating && (
                <div className="flex items-center gap-3 p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
                  <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin flex-shrink-0" />
                  <p className="text-sm text-white/40">{t.evaluatingTopic}</p>
                </div>
              )}

              {evaluation && !evaluating && (
                <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{t.aiEvalReport}</h3>
                    <span className="text-xs text-white/30">
                      {t.overallScore}{" "}
                      {Math.round(
                        (evaluation.evaluation.viralScore +
                          evaluation.evaluation.differentiationScore +
                          evaluation.evaluation.commercialScore) /
                          3
                      )}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <ScoreBar
                      score={evaluation.evaluation.viralScore}
                      label={t.viralPotential}
                    />
                    <ScoreBar
                      score={evaluation.evaluation.differentiationScore}
                      label={t.differentiationScore}
                    />
                    <ScoreBar
                      score={evaluation.evaluation.commercialScore}
                      label={t.commercialValue}
                    />
                  </div>
                  <p className="text-sm text-white/60 leading-relaxed">
                    {evaluation.evaluation.summary}
                  </p>
                  {evaluation.recommendedPlatforms.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/30">{t.recommendedPlatformsLabel}</span>
                      {evaluation.recommendedPlatforms.map((p) => (
                        <button
                          key={p}
                          onClick={() => setPlatform(p)}
                          className={`px-3 py-1 rounded-full text-xs transition-all ${
                            platform === p
                              ? "bg-white text-black font-medium"
                              : "border border-white/10 text-white/40 hover:border-white/30"
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {entryMode === "hot" && !evaluating && !evaluation && (
                <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
                  <p className="text-sm text-white/50">{t.hotTopicNote}</p>
                </div>
              )}

              <button
                onClick={goToInterview}
                disabled={!evalTitle.trim()}
                className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {t.startInterview}
              </button>
            </div>
          )}

          {/* ── STEP: INTERVIEW ── */}
          {step === "interview" && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setStep("evaluate")}
                  className="text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  {t.backBtn}
                </button>
                <div>
                  <h1 className="text-xl font-bold">{t.interviewStep}</h1>
                  <p className="text-xs text-white/30 mt-0.5 truncate max-w-xs">
                    {evalTitle}
                  </p>
                </div>
              </div>

              {materialInput.trim() && (
                <div className="flex items-start gap-3 px-4 py-3 bg-purple-500/8 border border-purple-500/15 rounded-xl">
                  <span className="text-purple-400/70 text-sm flex-shrink-0">📄</span>
                  <div>
                    <p className="text-xs text-purple-300/70 font-medium">
                      {t.materialLoaded}
                    </p>
                    <p className="text-xs text-purple-300/40 mt-0.5 line-clamp-2">
                      {materialInput.slice(0, 120)}...
                    </p>
                  </div>
                </div>
              )}

              {/* Platform & Type selector */}
              <div className="p-4 bg-white/[0.02] border border-white/8 rounded-2xl space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-white/40">{t.publishPlatform}</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS_ZH.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPlatform(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          platform === p
                            ? "bg-white text-black"
                            : "border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70"
                        }`}
                      >
                        {locale === "en" ? PLATFORMS_EN[p] ?? p : p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-white/40">{t.contentTypeLabel}</label>
                  <div className="flex gap-3">
                    {[
                      { value: "graphic", label: t.graphicType, desc: t.graphicDesc },
                      { value: "script", label: t.scriptType, desc: t.scriptDesc },
                    ].map((ct) => (
                      <button
                        key={ct.value}
                        onClick={() => setContentType(ct.value)}
                        className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                          contentType === ct.value
                            ? "border-white/30 bg-white/5"
                            : "border-white/8 hover:border-white/20"
                        }`}
                      >
                        <p className="text-sm font-medium">{ct.label}</p>
                        <p className="text-xs text-white/30">{ct.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loadingQuestions ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-6 h-6 border border-white/20 border-t-white rounded-full animate-spin" />
                  <p className="text-sm text-white/30">{t.generatingQuestions}</p>
                </div>
              ) : questionsError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4 border border-red-500/20 bg-red-500/5 rounded-2xl">
                  <p className="text-sm text-red-400/80">{questionsError}</p>
                  <button
                    onClick={loadQuestions}
                    className="px-5 py-2 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 transition-colors"
                  >
                    {t.regenerateQuestions}
                  </button>
                </div>
              ) : questions.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/40">
                      {t.answeredCountFn(answeredCount, questions.length)}
                    </p>
                    <div className="flex gap-1.5">
                      {questions.map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full transition-all ${
                            qaAnswers[i]?.answer.trim()
                              ? "bg-white"
                              : "bg-white/15"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                          <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/40 font-mono">
                            {idx + 1}
                          </span>
                          <span className="text-[10px] text-white/20 font-medium whitespace-nowrap">
                            {q.layer}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-snug">
                            {q.question}
                          </p>
                          {q.hint && (
                            <p className="text-xs text-white/30 mt-1">
                              {t.hintPrefix} {q.hint}
                            </p>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={qaAnswers[idx]?.answer || ""}
                        onChange={(e) => updateAnswer(idx, e.target.value)}
                        placeholder={t.shareThoughts}
                        rows={3}
                        className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none"
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {limitReached && (
                <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4 space-y-2 text-center">
                  <p className="text-sm text-yellow-400/80">{t.dailyLimitReached}</p>
                  <p className="text-xs text-white/30">{t.dailyLimitDesc}</p>
                  <Link
                    href="/pricing"
                    className="inline-block text-xs bg-white text-black px-5 py-2 rounded-full font-semibold hover:bg-white/90 transition-colors mt-1"
                  >
                    {t.upgradePro2}
                  </Link>
                </div>
              )}

              <button
                onClick={generateFullContent}
                disabled={
                  generatingContent || answeredCount < 2 || loadingQuestions
                }
                className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {generatingContent ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin inline-block" />
                    {t.generatingContentBtn}
                  </span>
                ) : answeredCount < 2 ? (
                  t.minAnswersFn(answeredCount)
                ) : (
                  t.generateContentFn(!!materialInput.trim())
                )}
              </button>
            </div>
          )}

          {/* ── STEP: EDITOR (Chatbot) ── */}
          {step === "editor" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Editor Header */}
              <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setStep("interview")}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    {t.backToInterview}
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold truncate max-w-xs">
                      {evalTitle}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/30">{locale === "en" ? PLATFORMS_EN[platform] ?? platform : platform}</span>
                      <span className="text-white/10">·</span>
                      <span className="text-xs text-white/30">
                        {contentType === "graphic" ? t.graphicType : t.scriptType}
                      </span>
                      <span className="text-white/10">·</span>
                      {saveStatus === "saving" && (
                        <span className="text-xs text-white/30 flex items-center gap-1">
                          <span className="w-2.5 h-2.5 border border-white/20 border-t-white/50 rounded-full animate-spin inline-block" />
                          {t.savingStatus}
                        </span>
                      )}
                      {saveStatus === "saved" && (
                        <span className="text-xs text-green-400/70">
                          {t.autoSaved}
                        </span>
                      )}
                      {saveStatus === "idle" && contentId && (
                        <span className="text-xs text-white/20">{t.draftSaved}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(content);
                    }}
                    className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/40 hover:border-white/30 hover:text-white/70 transition-colors"
                  >
                    {t.copyFull}
                  </button>
                  <Link
                    href="/library"
                    className="px-3 py-1.5 bg-white/8 border border-white/10 rounded-lg text-xs text-white/50 hover:bg-white/12 transition-colors"
                  >
                    {t.viewLibrary}
                  </Link>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left: Content Display */}
                <div className="flex-1 overflow-y-auto px-8 py-6 border-r border-white/5">
                  <pre className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap font-sans">
                    {content}
                  </pre>
                  <div className="mt-8 pt-6 border-t border-white/5">
                    <button
                      onClick={generateFullContent}
                      disabled={generatingContent}
                      className="text-xs text-white/30 hover:text-white/60 transition-colors"
                    >
                      {generatingContent ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 border border-white/20 border-t-white/50 rounded-full animate-spin inline-block" />
                          {t.regeneratingAll}
                        </span>
                      ) : (
                        t.regenerateAll
                      )}
                    </button>
                  </div>
                </div>

                {/* Right: Chatbot Panel */}
                <div className="w-80 flex-shrink-0 flex flex-col bg-white/[0.01]">
                  {/* Chat header */}
                  <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
                    <p className="text-xs font-semibold text-white/70">
                      {t.aiChatTitle}
                    </p>
                    <p className="text-[11px] text-white/30 mt-0.5">
                      {t.aiChatSubtitle}
                    </p>
                  </div>

                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-xs text-white/20 leading-relaxed">
                          {t.contentGeneratedNote}
                          <br />
                          {t.enterRevisionBelow}
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
                            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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

                  {/* Chat input */}
                  <div className="px-4 py-3 border-t border-white/5 flex-shrink-0">
                    <div className="flex gap-2">
                      <textarea
                        ref={chatInputRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder={t.chatPlaceholder}
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
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="w-5 h-5 border border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <CreatePageInner />
    </Suspense>
  );
}
