"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function RegisterPage() {
  const router = useRouter();
  const { locale, setLocale } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isZh = locale === "zh";
  const copy = {
    title: isZh ? "创建你的账号" : "Create your account",
    subtitle: isZh ? "开始打造你的个人内容系统" : "Start building your content system",
    nameLabel: isZh ? "昵称" : "Display name",
    namePlaceholder: isZh ? "你的创作者名字" : "Your creator name",
    emailLabel: isZh ? "邮箱" : "Email",
    passwordLabel: isZh ? "密码" : "Password",
    passwordPlaceholder: isZh ? "至少 8 位" : "At least 8 characters",
    errorFallback: isZh ? "注册失败，请重试" : "Registration failed, please try again",
    submitBtn: isZh ? "创建账号" : "Create Account",
    submitting: isZh ? "注册中..." : "Creating...",
    hasAccount: isZh ? "已有账号？" : "Already have an account? ",
    signIn: isZh ? "直接登录" : "Sign in",
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await signUp.email({ name, email, password });
    if (error) {
      setError(error.message || copy.errorFallback);
      setLoading(false);
    } else {
      router.push("/onboarding");
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center px-4">
      {/* Language switcher — top right */}
      <div className="fixed top-4 right-4">
        <button
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          className="text-xs text-white/30 hover:text-white/60 transition-colors border border-white/10 rounded-lg px-3 py-1.5"
        >
          {locale === "zh" ? "EN" : "中文"}
        </button>
      </div>

      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="text-sm text-white/30 hover:text-white/60 transition-colors">
            ← CreatorOS
          </Link>
          <h1 className="text-2xl font-bold mt-4">{copy.title}</h1>
          <p className="text-sm text-white/40">{copy.subtitle}</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-white/40">{copy.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={copy.namePlaceholder}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/40">{copy.emailLabel}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-white/40">{copy.passwordLabel}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={copy.passwordPlaceholder}
              required
              minLength={8}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? copy.submitting : copy.submitBtn}
          </button>
        </form>

        <p className="text-center text-xs text-white/30">
          {copy.hasAccount}{" "}
          <Link href="/login" className="text-white/60 hover:text-white transition-colors">
            {copy.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
