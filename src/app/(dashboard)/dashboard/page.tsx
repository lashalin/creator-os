"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { useLanguage } from "@/contexts/LanguageContext";

interface CreatorProfile {
  background?: string;
  topics?: string[];
  platforms?: string[];
  dna?: {
    tags: string[];
    differentiation: string;
    persona: string;
    languageStyle: string;
    viralPattern: string;
    platformPriority: string[];
  };
}

interface SubInfo {
  plan: string;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { t, locale, setLocale } = useLanguage();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ topics: 0, content: 0 });

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      Promise.all([
        fetch("/api/profile").then((r) => r.json()),
        fetch("/api/subscription").then((r) => r.json()),
        fetch("/api/topics").then((r) => r.json()),
        fetch("/api/content").then((r) => r.json()),
      ]).then(([profileData, subData, topicsData, contentData]) => {
        setProfile(profileData.profile);
        setSubInfo(subData.subscription);
        setUsage(subData.usage || {});
        setStats({
          topics: topicsData.topics?.length || 0,
          content: contentData.items?.length || 0,
        });
        setLoadingProfile(false);
      }).catch(() => setLoadingProfile(false));
    }
  }, [session]);

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  if (isPending || loadingProfile) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-5 h-5 border border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const hasProfile = profile?.dna;

  const modules = [
    {
      id: "topics",
      title: t.topicRadar,
      desc: t.topicRadarDesc,
      icon: "◎",
      href: "/topics",
      color: "from-blue-500/10 to-transparent",
      borderColor: "border-blue-500/20 hover:border-blue-500/40",
    },
    {
      id: "create",
      title: t.contentFactory,
      desc: t.contentFactoryDesc,
      icon: "◈",
      href: "/create",
      color: "from-purple-500/10 to-transparent",
      borderColor: "border-purple-500/20 hover:border-purple-500/40",
    },
    {
      id: "library",
      title: t.library,
      desc: t.libraryDesc,
      icon: "◉",
      href: "/library",
      color: "from-green-500/10 to-transparent",
      borderColor: "border-green-500/20 hover:border-green-500/40",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5">
        <span className="text-sm font-semibold tracking-tight">{t.appName}</span>
        <div className="flex items-center gap-5">
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="text-xs text-white/30 hover:text-white/60 border border-white/10 px-2.5 py-1 rounded-full transition-colors"
          >
            {locale === "zh" ? "EN" : "中文"}
          </button>
          <span className="text-xs text-white/30">{session?.user?.name}</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            {t.signOut}
          </button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-8 py-12 space-y-12">
        {/* Welcome */}
        <div className="space-y-1">
          <p className="text-xs text-white/30">{t.hello}{session?.user?.name}</p>
          <h1 className="text-2xl font-bold">{t.dashboardTitle}</h1>
        </div>

        {/* DNA Card */}
        {!hasProfile ? (
          <div className="border border-dashed border-white/10 rounded-2xl p-8 text-center space-y-4">
            <div className="text-3xl">◐</div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t.noProfile}</p>
              <p className="text-xs text-white/40">{t.noProfileDesc}</p>
            </div>
            <Link
              href="/onboarding"
              className="inline-block bg-white text-black text-sm px-6 py-2.5 rounded-full font-semibold hover:bg-white/90 transition-colors"
            >
              {t.startProfile}
            </Link>
          </div>
        ) : (
          <div className="border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{t.myDNA}</h2>
              <Link href="/onboarding" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                {t.updateProfile}
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.dna?.tags.map((tag) => (
                <span key={tag} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs">{tag}</span>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs text-white/30">{t.dnaCore}</p>
                <p className="text-sm">{profile.dna?.differentiation}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/30">{t.dnaLanguage}</p>
                <p className="text-sm">{profile.dna?.languageStyle}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/30">{t.dnaPersona}</p>
                <p className="text-sm">{profile.dna?.persona}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-white/30">{t.dnaViral}</p>
                <p className="text-sm">{profile.dna?.viralPattern}</p>
              </div>
            </div>
            {profile.dna?.platformPriority && profile.dna.platformPriority.length > 0 && (
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs text-white/30 mb-2">{t.priorityPlatforms}</p>
                <div className="flex gap-2">
                  {profile.dna.platformPriority.map((p, i) => (
                    <span key={p} className="text-xs text-white/60">{i + 1}. {p}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modules */}
        <div className="space-y-4">
          <h2 className="text-xs text-white/30 uppercase tracking-wider">{t.modules}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {modules.map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className={`group border ${m.borderColor} rounded-2xl p-6 transition-all bg-gradient-to-br ${m.color} space-y-3`}
              >
                <span className="text-2xl text-white/40 group-hover:text-white/70 transition-colors">{m.icon}</span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{m.title}</h3>
                  <p className="text-xs text-white/40">{m.desc}</p>
                </div>
                <span className="text-xs text-white/20 group-hover:text-white/40 transition-colors">{t.enter}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Usage / Upgrade banner */}
        {subInfo?.plan !== "pro" && (
          <div className="border border-white/8 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <p className="text-xs text-white/40">{t.todayUsage}</p>
              <div className="flex gap-6">
                <div>
                  <span className="text-xs text-white/50">{t.contentGen} </span>
                  <span className="text-xs font-mono text-white/70">{usage.generate_content || 0}/3</span>
                </div>
                <div>
                  <span className="text-xs text-white/50">{t.topicSuggest} </span>
                  <span className="text-xs font-mono text-white/70">{usage.suggest_topics || 0}/5</span>
                </div>
              </div>
            </div>
            <Link href="/pricing" className="shrink-0 bg-white text-black text-xs px-4 py-2 rounded-full font-semibold hover:bg-white/90 transition-colors">
              {t.upgrade}
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t.savedTopics, value: stats.topics.toString() },
            { label: t.generatedContent, value: stats.content.toString() },
            { label: t.coverPlatforms, value: profile?.platforms?.length?.toString() || "0" },
          ].map((stat) => (
            <div key={stat.label} className="border border-white/5 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-white/30 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
