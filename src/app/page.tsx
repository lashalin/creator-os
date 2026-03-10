"use client";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/5">
        <span className="text-lg font-semibold tracking-tight">CreatorOS</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-white/50 hover:text-white transition-colors">
            登录
          </Link>
          <Link href="/register" className="text-sm bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-white/90 transition-colors">
            免费开始
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 text-xs text-white/40 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block"></span>
            专为个人创作者设计
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
            从<span className="text-white/30">想法</span>到<span className="text-white/30">内容</span>
            <br />你只需要一个工具
          </h1>

          <p className="text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
            基于你的定位和风格，智能推荐选题、评分筛选、
            一键生成适配小红书、公众号、X、Instagram、YouTube 的个性化内容
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Link href="/register" className="bg-white text-black px-8 py-3.5 rounded-full font-semibold text-sm hover:bg-white/90 transition-colors">
              免费开始使用
            </Link>
            <Link href="/login" className="text-sm text-white/40 hover:text-white transition-colors">
              已有账号，直接登录 →
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full mt-24">
          {[
            {
              step: "01",
              title: "建立你的创作者档案",
              desc: "上传过往内容，AI 分析你的风格、爆款规律，生成专属创作者 DNA",
            },
            {
              step: "02",
              title: "发现最适合你的选题",
              desc: "AI 推荐 + 平台热文双模式，每个选题附爆款潜力评分和定位匹配度",
            },
            {
              step: "03",
              title: "一键生成多平台内容",
              desc: "图文 / 口播逐字稿，自动适配各平台调性，100% 符合你的个人风格",
            },
          ].map((f) => (
            <div key={f.step} className="border border-white/5 rounded-2xl p-6 text-left hover:border-white/10 transition-colors">
              <span className="text-xs text-white/20 font-mono">{f.step}</span>
              <h3 className="text-sm font-semibold mt-3 mb-2">{f.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center text-xs text-white/20">
        CreatorOS · 2026
      </footer>
    </div>
  );
}
