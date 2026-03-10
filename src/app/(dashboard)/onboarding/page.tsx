"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

const PLATFORMS = ["小红书", "公众号", "X / Twitter", "Instagram", "YouTube", "抖音 / TikTok"];
const STYLES = ["理性深度", "幽默轻松", "犀利直接", "温暖治愈", "干货实用", "故事感强", "学术严谨", "接地气"];
const GOALS = ["打造个人品牌", "副业变现", "积累粉丝", "行业影响力", "记录生活", "分享知识"];

type Step = 1 | 2 | 3 | 4 | 5;

interface ContentItem {
  text: string;
  isViral: boolean;
  label: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    background: "",
    topics: "",
    targetAudience: "",
    avoidContent: "",
    referenceCreators: "",
    expressionStyle: [] as string[],
    platforms: [] as string[],
    goals: [] as string[],
    pastContent: [] as ContentItem[],
  });

  const [newContent, setNewContent] = useState({ text: "", isViral: false });
  const [dna, setDna] = useState<null | Record<string, unknown>>(null);

  const toggleArr = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const addContent = () => {
    if (!newContent.text.trim()) return;
    setForm((f) => ({
      ...f,
      pastContent: [...f.pastContent, { ...newContent, label: newContent.isViral ? "爆款" : "普通" }],
    }));
    setNewContent({ text: "", isViral: false });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((f) => ({
      ...f,
      pastContent: [...f.pastContent, { text, isViral: false, label: "普通" }],
    }));
  };

  const generateDNA = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/generate-dna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.dna) {
        setDna(data.dna);
        setStep(5);
      } else {
        alert("生成失败，请重试");
      }
    } catch {
      alert("生成失败，请重试");
    }
    setLoading(false);
  };

  const saveProfile = async () => {
    setLoading(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dna }),
      });
      router.push("/dashboard");
    } catch {
      alert("保存失败，请重试");
    }
    setLoading(false);
  };

  const progress = (step / 5) * 100;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Progress bar */}
      <div className="h-0.5 bg-white/5">
        <div className="h-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl space-y-8">
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span>{step} / 5</span>
            <span>·</span>
            <span>{["基本信息", "内容方向", "平台与目标", "历史内容", "你的创作者 DNA"][step - 1]}</span>
          </div>

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">你是做什么的？</h2>
                <p className="text-sm text-white/40 mt-1">让 AI 了解你的背景，才能给出最匹配的内容方向</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 block mb-2">职业 / 专业背景</label>
                  <textarea
                    value={form.background}
                    onChange={(e) => setForm({ ...form, background: e.target.value })}
                    placeholder="例：互联网产品经理，5年经验，擅长用户增长和商业化..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-2">你最擅长 / 最享受聊的话题</label>
                  <textarea
                    value={form.topics}
                    onChange={(e) => setForm({ ...form, topics: e.target.value })}
                    placeholder="例：职场晋升、副业变现、个人成长、产品思维..."
                    rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-2">你讨厌 / 绝对不想做的内容类型</label>
                  <input
                    value={form.avoidContent}
                    onChange={(e) => setForm({ ...form, avoidContent: e.target.value })}
                    placeholder="例：鸡汤、过度夸张、标题党..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!form.background || !form.topics}
                className="w-full bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                继续 →
              </button>
            </div>
          )}

          {/* Step 2: Style & Audience */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">你的风格是什么？</h2>
                <p className="text-sm text-white/40 mt-1">这决定了 AI 生成内容的语气和调性</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 block mb-3">表达风格（可多选）</label>
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setForm({ ...form, expressionStyle: toggleArr(form.expressionStyle, s) })}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          form.expressionStyle.includes(s)
                            ? "bg-white text-black border-white"
                            : "border-white/10 text-white/50 hover:border-white/30"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-2">目标受众</label>
                  <input
                    value={form.targetAudience}
                    onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
                    placeholder="例：25-35岁职场人，有上进心，想提升收入和影响力..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-2">你欣赏的创作者（参考风格）</label>
                  <input
                    value={form.referenceCreators}
                    onChange={(e) => setForm({ ...form, referenceCreators: e.target.value })}
                    placeholder="例：刘润、半佛仙人、李翔、Ali Abdaal..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border border-white/10 py-3 rounded-xl text-sm text-white/50 hover:text-white hover:border-white/30 transition-colors">
                  ← 上一步
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={form.expressionStyle.length === 0}
                  className="flex-2 flex-grow bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  继续 →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Platforms & Goals */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">在哪里发？为什么做？</h2>
                <p className="text-sm text-white/40 mt-1">平台决定内容格式，目标决定内容方向</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-white/40 block mb-3">主攻平台（可多选）</label>
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setForm({ ...form, platforms: toggleArr(form.platforms, p) })}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          form.platforms.includes(p)
                            ? "bg-white text-black border-white"
                            : "border-white/10 text-white/50 hover:border-white/30"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-3">创作目标（可多选）</label>
                  <div className="flex flex-wrap gap-2">
                    {GOALS.map((g) => (
                      <button
                        key={g}
                        onClick={() => setForm({ ...form, goals: toggleArr(form.goals, g) })}
                        className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                          form.goals.includes(g)
                            ? "bg-white text-black border-white"
                            : "border-white/10 text-white/50 hover:border-white/30"
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 border border-white/10 py-3 rounded-xl text-sm text-white/50 hover:text-white hover:border-white/30 transition-colors">
                  ← 上一步
                </button>
                <button
                  onClick={() => setStep(4)}
                  disabled={form.platforms.length === 0 || form.goals.length === 0}
                  className="flex-grow bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  继续 →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Past Content */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">上传你的过往内容</h2>
                <p className="text-sm text-white/40 mt-1">AI 会分析你的写作风格和爆款规律，让生成内容更像你</p>
              </div>

              <div className="space-y-3">
                <div className="border border-dashed border-white/10 rounded-xl p-4 space-y-3">
                  <textarea
                    value={newContent.text}
                    onChange={(e) => setNewContent({ ...newContent, text: e.target.value })}
                    placeholder="粘贴你写过的文章、帖子、脚本..."
                    rows={4}
                    className="w-full bg-transparent text-sm text-white placeholder-white/20 focus:outline-none resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newContent.isViral}
                        onChange={(e) => setNewContent({ ...newContent, isViral: e.target.checked })}
                        className="rounded"
                      />
                      这是爆款内容
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-white/40 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        上传文件
                      </button>
                      <button
                        onClick={addContent}
                        disabled={!newContent.text.trim()}
                        className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-30"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.md,.docx" onChange={handleFileUpload} className="hidden" />

                {form.pastContent.length > 0 && (
                  <div className="space-y-2">
                    {form.pastContent.map((c, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${c.isViral ? "bg-yellow-500/20 text-yellow-400" : "bg-white/5 text-white/30"}`}>
                            {c.label}
                          </span>
                          <span className="text-xs text-white/50 truncate max-w-[200px]">{c.text.slice(0, 40)}...</span>
                        </div>
                        <button
                          onClick={() => setForm((f) => ({ ...f, pastContent: f.pastContent.filter((_, j) => j !== i) }))}
                          className="text-xs text-white/20 hover:text-red-400 transition-colors"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 border border-white/10 py-3 rounded-xl text-sm text-white/50 hover:text-white hover:border-white/30 transition-colors">
                  ← 上一步
                </button>
                <button
                  onClick={generateDNA}
                  disabled={loading}
                  className="flex-grow bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  {loading ? "AI 分析中..." : "✦ 生成我的创作者 DNA"}
                </button>
              </div>
              <p className="text-center text-xs text-white/20">没有过往内容也可以跳过，直接生成</p>
            </div>
          )}

          {/* Step 5: DNA Result */}
          {step === 5 && dna && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">你的创作者 DNA</h2>
                <p className="text-sm text-white/40 mt-1">基于你的信息和历史内容生成，所有内容将基于此创作</p>
              </div>

              <div className="border border-white/10 rounded-2xl p-6 space-y-4">
                {[
                  { label: "定位标签", key: "tags", isArray: true },
                  { label: "差异化角度", key: "differentiation", isArray: false },
                  { label: "内容人设", key: "persona", isArray: false },
                  { label: "语言风格", key: "languageStyle", isArray: false },
                  { label: "爆款规律", key: "viralPattern", isArray: false },
                  { label: "建议平台顺序", key: "platformPriority", isArray: true },
                ].map(({ label, key, isArray }) => (
                  <div key={key} className="flex gap-4">
                    <span className="text-xs text-white/30 w-24 shrink-0 pt-0.5">{label}</span>
                    <span className="text-sm text-white/80">
                      {isArray
                        ? (dna[key] as string[])?.join(" · ")
                        : (dna[key] as string)}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={saveProfile}
                disabled={loading}
                className="w-full bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                {loading ? "保存中..." : "保存并进入 Dashboard →"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
