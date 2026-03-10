"use client";
import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PLATFORMS = ["小红书", "公众号", "X", "Instagram", "YouTube", "抖音"];

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

interface ContentBlock {
  id: string;
  type: string;
  label: string;
  content: string;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400";
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
  const searchParams = useSearchParams();

  // URL params from hot topics
  const urlTitle = searchParams.get("title") || "";
  const urlAngle = searchParams.get("angle") || "";
  const urlTopicId = searchParams.get("topicId") || "";

  const [step, setStep] = useState<Step>(urlTitle ? "evaluate" : "entry");
  const [entryMode, setEntryMode] = useState<EntryMode | null>(urlTitle ? "hot" : null);

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

  // Platform/type
  const [platform, setPlatform] = useState("小红书");
  const [contentType, setContentType] = useState("graphic");

  // Editor state
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [regeneratingBlock, setRegeneratingBlock] = useState<string | null>(null);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyBlock, setCopyBlock] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // Auto-load questions when coming from hot topics
  useEffect(() => {
    if (urlTitle && step === "evaluate") {
      // For hot topics, show the evaluate step but skip evaluation API call
      // Just show the topic info and let user proceed to interview
    }
  }, [urlTitle, step]);

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

  const runEvaluate = async (payload: { topic?: string; material?: string }) => {
    setEvaluating(true);
    setEvaluation(null);
    try {
      const res = await fetch("/api/ai/evaluate-topic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      // silent fail, user can still proceed manually
    } finally {
      setEvaluating(false);
    }
  };

  // ── INTERVIEW ──────────────────────────────────────────
  const loadQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const res = await fetch("/api/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: evalTitle, angle: evalAngle }),
      });
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
        setQaAnswers(
          data.questions.map((q: Question) => ({
            questionId: q.id,
            question: q.question,
            answer: "",
          }))
        );
      }
    } catch {
      alert("加载问题失败，请重试");
    } finally {
      setLoadingQuestions(false);
    }
  };

  const goToInterview = async () => {
    setStep("interview");
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

  // ── EDITOR ────────────────────────────────────────────
  const generateFullContent = async () => {
    setGeneratingContent(true);
    setLimitReached(false);
    setSaved(false);
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
        }),
      });
      const data = await res.json();
      if (res.status === 429 && data.error === "LIMIT_REACHED") {
        setLimitReached(true);
        setStep("interview");
      } else if (data.blocks) {
        setBlocks(data.blocks);
        setStep("editor");
      } else {
        alert(data.error || "生成失败，请重试");
      }
    } catch {
      alert("生成失败，请重试");
    } finally {
      setGeneratingContent(false);
    }
  };

  const regenerateSingleBlock = async (blockId: string) => {
    setRegeneratingBlock(blockId);
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
          regenerateBlock: blockId,
        }),
      });
      const data = await res.json();
      if (data.block) {
        setBlocks((prev) =>
          prev.map((b) => (b.id === blockId ? { ...b, content: data.block.content } : b))
        );
      }
    } catch {
      alert("重新生成失败，请重试");
    } finally {
      setRegeneratingBlock(null);
    }
  };

  const startEdit = (block: ContentBlock) => {
    setEditingBlock(block.id);
    setEditValue(block.content);
  };

  const saveEdit = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content: editValue } : b))
    );
    setEditingBlock(null);
    setEditValue("");
  };

  const copyBlockContent = async (blockId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopyBlock(blockId);
    setTimeout(() => setCopyBlock(null), 2000);
  };

  const copyAll = async () => {
    const allContent = blocks.map((b) => `【${b.label}】\n${b.content}`).join("\n\n");
    await navigator.clipboard.writeText(allContent);
    setCopyBlock("all");
    setTimeout(() => setCopyBlock(null), 2000);
  };

  const saveToLibrary = async () => {
    if (blocks.length === 0) return;
    setSaving(true);
    try {
      const combinedContent = blocks
        .map((b) => `【${b.label}】\n${b.content}`)
        .join("\n\n");
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: evalTitle,
          contentType,
          platform,
          content: combinedContent,
          topicId: urlTopicId || undefined,
          status: "draft",
        }),
      });
      const data = await res.json();
      if (data.item) {
        setSaved(true);
      } else {
        alert(data.error || "保存失败");
      }
    } catch {
      alert("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link href="/topics" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← 选题雷达
          </Link>
          <span className="text-sm font-semibold">内容创作</span>
        </div>
        <div className="flex items-center gap-6">
          {/* Step indicator */}
          <div className="hidden sm:flex items-center gap-2">
            {[
              { key: "entry", label: "选择入口" },
              { key: "evaluate", label: "评估选题" },
              { key: "interview", label: "深度访谈" },
              { key: "editor", label: "模块编辑" },
            ].map((s, i) => {
              const stepOrder = ["entry", "evaluate", "interview", "editor"];
              const currentIdx = stepOrder.indexOf(step);
              const thisIdx = stepOrder.indexOf(s.key);
              const isActive = s.key === step;
              const isDone = thisIdx < currentIdx;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-px ${isDone ? "bg-white/30" : "bg-white/8"}`} />}
                  <div className={`flex items-center gap-1.5 ${isActive ? "opacity-100" : isDone ? "opacity-50" : "opacity-20"}`}>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isActive ? "bg-white text-black" : isDone ? "bg-white/20 text-white" : "border border-white/20 text-white/40"}`}>
                      {isDone ? "✓" : i + 1}
                    </div>
                    <span className="text-xs hidden md:block">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Link href="/library" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            内容库
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* ── STEP: ENTRY ── */}
        {step === "entry" && (
          <div className="space-y-8">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">开始创作</h1>
              <p className="text-sm text-white/40">选择你的创作起点</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Hot Topics Card */}
              <Link
                href="/topics"
                className="group flex items-start gap-5 p-5 border border-white/8 rounded-2xl hover:border-white/20 hover:bg-white/[0.02] transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                  🔥
                </div>
                <div className="space-y-1 flex-1">
                  <h3 className="font-semibold group-hover:text-white transition-colors">行业热点选题</h3>
                  <p className="text-sm text-white/40">从热点话题中选取选题，AI 自动匹配最优角度和平台</p>
                  <p className="text-xs text-white/20 mt-2">→ 去选题雷达</p>
                </div>
              </Link>

              {/* Custom Topic Card */}
              <div className="p-5 border border-white/8 rounded-2xl space-y-4">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                    ✏️
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">自定义选题</h3>
                    <p className="text-sm text-white/40">输入你想写的话题，AI 帮你评估潜力和打磨角度</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTopicEntry()}
                    placeholder="例：普通人怎么靠副业月入过万"
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                  <button
                    onClick={handleTopicEntry}
                    disabled={!topicInput.trim()}
                    className="px-5 py-2.5 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    评估
                  </button>
                </div>
              </div>

              {/* Paste Material Card */}
              <div className="p-5 border border-white/8 rounded-2xl space-y-4">
                <div className="flex items-start gap-5">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                    📄
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold">粘贴素材</h3>
                    <p className="text-sm text-white/40">粘贴已有文章、笔记或资料，AI 提炼选题并评估潜力</p>
                  </div>
                </div>
                <textarea
                  value={materialInput}
                  onChange={(e) => setMaterialInput(e.target.value)}
                  placeholder="粘贴你的素材内容（文章、笔记、灵感片段等）..."
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
                />
                <button
                  onClick={handleMaterialEntry}
                  disabled={!materialInput.trim()}
                  className="w-full py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/10 hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  分析素材 →
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
                ← 返回
              </button>
              <h1 className="text-xl font-bold">选题评估</h1>
            </div>

            {/* Topic info */}
            <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-white/40">选题标题</label>
                <input
                  type="text"
                  value={evalTitle}
                  onChange={(e) => setEvalTitle(e.target.value)}
                  placeholder="输入或编辑选题标题"
                  className="w-full bg-transparent border-b border-white/10 pb-2 text-base font-semibold focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-white/40">创作角度</label>
                <input
                  type="text"
                  value={evalAngle}
                  onChange={(e) => setEvalAngle(e.target.value)}
                  placeholder="AI 推荐角度或自行填写"
                  className="w-full bg-transparent border-b border-white/10 pb-2 text-sm focus:outline-none focus:border-white/30 transition-colors text-white/80"
                />
              </div>
            </div>

            {/* AI Evaluation result */}
            {evaluating && (
              <div className="flex items-center gap-3 p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
                <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin flex-shrink-0" />
                <p className="text-sm text-white/40">AI 正在评估选题潜力...</p>
              </div>
            )}

            {evaluation && !evaluating && (
              <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">AI 评估报告</h3>
                  <span className="text-xs text-white/30">
                    综合分 {Math.round((evaluation.evaluation.viralScore + evaluation.evaluation.differentiationScore + evaluation.evaluation.commercialScore) / 3)}
                  </span>
                </div>

                {/* Scores */}
                <div className="space-y-3">
                  <ScoreBar score={evaluation.evaluation.viralScore} label="爆款潜力" />
                  <ScoreBar score={evaluation.evaluation.differentiationScore} label="差异化程度" />
                  <ScoreBar score={evaluation.evaluation.commercialScore} label="商业价值" />
                </div>

                {/* Summary */}
                <p className="text-sm text-white/60 leading-relaxed">{evaluation.evaluation.summary}</p>

                {/* Strengths & Suggestions */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-green-400/70 font-medium">✦ 优势</p>
                    <ul className="space-y-1">
                      {evaluation.evaluation.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-white/50">{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-yellow-400/70 font-medium">◎ 建议</p>
                    <ul className="space-y-1">
                      {evaluation.evaluation.suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-white/50">{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommended Platforms */}
                {evaluation.recommendedPlatforms.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-white/30">推荐平台：</span>
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

            {/* Hot topic — no evaluation needed, show simple prompt */}
            {entryMode === "hot" && !evaluating && !evaluation && (
              <div className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl">
                <p className="text-sm text-white/50">
                  ✓ 来自热点选题，已有 AI 推荐角度。确认标题和角度后，点击开始访谈。
                </p>
              </div>
            )}

            <button
              onClick={goToInterview}
              disabled={!evalTitle.trim()}
              className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              开始深度访谈 →
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
                ← 返回
              </button>
              <div>
                <h1 className="text-xl font-bold">深度访谈</h1>
                <p className="text-xs text-white/30 mt-0.5 truncate max-w-xs">{evalTitle}</p>
              </div>
            </div>

            {/* Platform & Type */}
            <div className="p-4 bg-white/[0.02] border border-white/8 rounded-2xl space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-white/40">发布平台</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
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
              <div className="space-y-2">
                <label className="text-xs text-white/40">内容类型</label>
                <div className="flex gap-3">
                  {[
                    { value: "graphic", label: "图文", desc: "适合图文发布" },
                    { value: "script", label: "口播逐字稿", desc: "适合真人出镜" },
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

            {/* Questions */}
            {loadingQuestions ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="w-6 h-6 border border-white/20 border-t-white rounded-full animate-spin" />
                <p className="text-sm text-white/30">AI 正在用第一性原理设计问题...</p>
              </div>
            ) : questions.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/40">已回答 {answeredCount}/{questions.length} 个问题（至少回答 2 个）</p>
                  <div className="flex gap-1.5">
                    {questions.map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-all ${
                          qaAnswers[i]?.answer.trim() ? "bg-white" : "bg-white/15"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {questions.map((q, idx) => (
                  <div key={q.id} className="p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 flex-shrink-0">
                        <span className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-xs text-white/40 font-mono">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] text-white/20 font-medium whitespace-nowrap">{q.layer}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium leading-snug">{q.question}</p>
                        {q.hint && <p className="text-xs text-white/30 mt-1">提示：{q.hint}</p>}
                      </div>
                    </div>
                    <textarea
                      value={qaAnswers[idx]?.answer || ""}
                      onChange={(e) => updateAnswer(idx, e.target.value)}
                      placeholder="分享你的真实想法..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {limitReached && (
              <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-xl p-4 space-y-2 text-center">
                <p className="text-sm text-yellow-400/80">今日生成次数已达上限</p>
                <p className="text-xs text-white/30">免费版每日 3 次，升级 Pro 无限使用</p>
                <Link
                  href="/pricing"
                  className="inline-block text-xs bg-white text-black px-5 py-2 rounded-full font-semibold hover:bg-white/90 transition-colors mt-1"
                >
                  升级 Pro
                </Link>
              </div>
            )}

            <button
              onClick={generateFullContent}
              disabled={generatingContent || answeredCount < 2 || loadingQuestions}
              className="w-full py-3.5 bg-white text-black rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {generatingContent ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin inline-block" />
                  AI 正在生成专属内容...
                </span>
              ) : answeredCount < 2 ? (
                `请至少回答 2 个问题（已回答 ${answeredCount} 个）`
              ) : (
                "生成专属内容 ✦"
              )}
            </button>
          </div>
        )}

        {/* ── STEP: EDITOR ── */}
        {step === "editor" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-4 mb-1">
                  <button
                    onClick={() => setStep("interview")}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    ← 返回访谈
                  </button>
                </div>
                <h1 className="text-xl font-bold">{evalTitle}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-white/30">{platform}</span>
                  <span className="text-white/10">·</span>
                  <span className="text-xs text-white/30">{contentType === "graphic" ? "图文" : "口播逐字稿"}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={copyAll}
                  className="px-3 py-1.5 border border-white/10 rounded-lg text-xs text-white/40 hover:border-white/30 hover:text-white/70 transition-colors"
                >
                  {copyBlock === "all" ? "已复制 ✓" : "全文复制"}
                </button>
                <button
                  onClick={saveToLibrary}
                  disabled={saving || saved}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    saved
                      ? "bg-white/10 text-white/30 cursor-default"
                      : "bg-white text-black hover:bg-white/90"
                  }`}
                >
                  {saved ? "已保存 ✓" : saving ? "保存中..." : "保存到库"}
                </button>
              </div>
            </div>

            {/* Content Blocks */}
            <div className="space-y-4">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="group p-5 bg-white/[0.02] border border-white/8 rounded-2xl space-y-3 hover:border-white/12 transition-colors"
                >
                  {/* Block header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/60">{block.label}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyBlockContent(block.id, block.content)}
                        className="px-2.5 py-1 rounded-lg text-xs border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70 transition-colors"
                      >
                        {copyBlock === block.id ? "✓" : "复制"}
                      </button>
                      <button
                        onClick={() =>
                          editingBlock === block.id
                            ? saveEdit(block.id)
                            : startEdit(block)
                        }
                        className="px-2.5 py-1 rounded-lg text-xs border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70 transition-colors"
                      >
                        {editingBlock === block.id ? "保存" : "编辑"}
                      </button>
                      <button
                        onClick={() => regenerateSingleBlock(block.id)}
                        disabled={regeneratingBlock === block.id}
                        className="px-2.5 py-1 rounded-lg text-xs border border-white/10 text-white/40 hover:border-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
                      >
                        {regeneratingBlock === block.id ? (
                          <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 border border-white/30 border-t-white/60 rounded-full animate-spin inline-block" />
                            生成中
                          </span>
                        ) : (
                          "重新生成"
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Block content */}
                  {editingBlock === block.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={6}
                        autoFocus
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/40 transition-colors resize-y"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(block.id)}
                          className="px-4 py-1.5 bg-white text-black rounded-lg text-xs font-semibold hover:bg-white/90 transition-colors"
                        >
                          保存修改
                        </button>
                        <button
                          onClick={() => { setEditingBlock(null); setEditValue(""); }}
                          className="px-4 py-1.5 border border-white/10 rounded-lg text-xs text-white/40 hover:border-white/30 transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : regeneratingBlock === block.id ? (
                    <div className="flex items-center gap-3 py-4">
                      <div className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin flex-shrink-0" />
                      <p className="text-sm text-white/30">AI 正在重新生成...</p>
                    </div>
                  ) : (
                    <pre className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                      {block.content}
                    </pre>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom actions */}
            <div className="pt-4 border-t border-white/5 flex gap-3">
              <button
                onClick={() => {
                  setBlocks([]);
                  setStep("interview");
                }}
                className="flex-1 py-3 border border-white/10 rounded-xl text-sm text-white/50 hover:border-white/20 hover:text-white/70 transition-colors"
              >
                重新生成全部
              </button>
              <Link
                href="/library"
                className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-center text-white/50 hover:bg-white/8 hover:border-white/20 transition-colors"
              >
                查看内容库 →
              </Link>
            </div>
          </div>
        )}
      </main>
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
