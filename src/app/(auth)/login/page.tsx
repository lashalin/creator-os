"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const { locale, setLocale } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isZh = locale === "zh";
  const copy = {
    back: isZh ? "← CreatorOS" : "← CreatorOS",
    title: isZh ? "欢迎回来" : "Welcome back",
    subtitle: isZh ? "登录你的创作者账号" : "Sign in to your account",
    emailLabel: isZh ? "邮箱" : "Email",
    passwordLabel: isZh ? "密码" : "Password",
    passwordPlaceholder: isZh ? "••••••••" : "••••••••",
    errorMsg: isZh ? "邮箱或密码错误" : "Invalid email or password",
    submitBtn: isZh ? "登录" : "Sign In",
    submitting: isZh ? "登录中..." : "Signing in...",
    noAccount: isZh ? "还没有账号？" : "Don't have an account? ",
    register: isZh ? "免费注册" : "Sign up free",
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await signIn.email({ email, password });
    if (error) {
      setError(copy.errorMsg);
      setLoading(false);
    } else {
      router.push("/dashboard");
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
            {copy.back}
          </Link>
          <h1 className="text-2xl font-bold mt-4">{copy.title}</h1>
          <p className="text-sm text-white/40">{copy.subtitle}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
          {copy.noAccount}{" "}
          <Link href="/register" className="text-white/60 hover:text-white transition-colors">
            {copy.register}
          </Link>
        </p>
      </div>
    </div>
  );
}
