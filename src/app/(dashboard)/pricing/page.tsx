"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

interface SubInfo {
  plan: string;
  status: string;
  currentPeriodEnd?: string;
}

interface UsageInfo {
  generate_content?: number;
  suggest_topics?: number;
}

const PRO_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "";

export default function PricingPage() {
  const { t, locale } = useLanguage();
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo>({});
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    fetch("/api/subscription")
      .then((r) => r.json())
      .then((data) => {
        setSubInfo(data.subscription);
        setUsage(data.usage || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleUpgrade = async () => {
    if (!PRO_PRICE_ID) {
      alert("Missing NEXT_PUBLIC_STRIPE_PRO_PRICE_ID in .env.local");
      return;
    }
    setCheckingOut(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: PRO_PRICE_ID }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(t.error);
      }
    } catch {
      alert(t.error);
    } finally {
      setCheckingOut(false);
    }
  };

  const isPro = subInfo?.plan === "pro" && subInfo?.status === "active";

  const FREE_FEATURES = locale === "zh"
    ? ["每天 3 次内容生成", "每天 5 次选题推荐", "创作者 DNA 建档", "内容库管理", "Word / PDF 导出"]
    : ["3 content generations / day", "5 topic suggestions / day", "Creator DNA profile", "Content library", "Word / PDF export"];

  const PRO_FEATURES = locale === "zh"
    ? ["无限次内容生成", "无限次选题推荐", "热文分析无限使用", "创作者 DNA 随时更新", "内容库无限存储", "Word / PDF 导出", "优先客服支持"]
    : ["Unlimited content generation", "Unlimited topic suggestions", "Unlimited trend analysis", "Update Creator DNA anytime", "Unlimited content storage", "Word / PDF export", "Priority support"];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            ← {t.dashboardTitle}
          </Link>
          <span className="text-sm font-semibold">{t.pricingTitle}</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-8 py-16 space-y-12">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold">{t.pricingTitle}</h1>
          <p className="text-sm text-white/40">{t.pricingSubtitle}</p>
        </div>

        {/* Current usage (free users) */}
        {!loading && !isPro && (
          <div className="border border-white/8 rounded-2xl p-5 space-y-3">
            <p className="text-xs text-white/40">{t.todayUsageTitle}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/50">{t.contentGen}</span>
                  <span className="text-white/70">{usage.generate_content || 0} / 3</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full">
                  <div
                    className="h-full bg-white/50 rounded-full transition-all"
                    style={{ width: `${Math.min(((usage.generate_content || 0) / 3) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-white/50">{t.topicSuggest}</span>
                  <span className="text-white/70">{usage.suggest_topics || 0} / 5</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full">
                  <div
                    className="h-full bg-white/50 rounded-full transition-all"
                    style={{ width: `${Math.min(((usage.suggest_topics || 0) / 5) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free */}
          <div className={`border rounded-2xl p-6 space-y-5 ${!isPro ? "border-white/20" : "border-white/8"}`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{t.free}</h2>
                {!isPro && (
                  <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full">{t.currentPlan}</span>
                )}
              </div>
              <p className="text-2xl font-bold">¥0<span className="text-sm text-white/30 font-normal">{t.perMonth}</span></p>
            </div>
            <ul className="space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                  <span className="text-white/30 mt-0.5">○</span>
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-white/20">
              {locale === "zh" ? "每天凌晨 0 点重置次数" : "Resets daily at midnight"}
            </p>
          </div>

          {/* Pro */}
          <div className={`border rounded-2xl p-6 space-y-5 ${isPro ? "border-white/20" : "border-white/15"} bg-gradient-to-br from-white/[0.03] to-transparent`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{t.pro}</h2>
                {isPro && (
                  <span className="text-xs bg-white text-black px-2 py-0.5 rounded-full font-medium">{t.currentPlan}</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold">¥69<span className="text-sm text-white/30 font-normal">{t.perMonth}</span></p>
                <p className="text-sm text-white/30 line-through">¥99</p>
              </div>
              <p className="text-xs text-white/30">
                {locale === "zh" ? "年付 ¥599 省 ¥229 · 支持支付宝/信用卡" : "Annual plan ¥599 · Alipay / Credit card"}
              </p>
            </div>
            <ul className="space-y-2.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                  <span className="text-white/50 mt-0.5">●</span>
                  {f}
                </li>
              ))}
            </ul>

            {isPro ? (
              <div className="space-y-1">
                <p className="text-sm text-white/60">{t.alreadyPro}</p>
                <p className="text-xs text-white/30">
                  {locale === "zh" ? "续费自动处理，可随时取消" : "Auto-renewed, cancel anytime"}
                </p>
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={checkingOut}
                className="w-full bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkingOut ? t.upgrading : t.upgradePro}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/20">
          {locale === "zh"
            ? "通过 Stripe 处理支付，安全加密 · 随时可以取消订阅"
            : "Payments processed by Stripe, encrypted & secure · Cancel anytime"}
        </p>
      </main>
    </div>
  );
}
