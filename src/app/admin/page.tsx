"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";

const ADMIN_EMAILS = ["yyyjjinx@gmail.com"];

interface UserRow {
  name: string;
  email: string;
  created_at: string;
  has_profile: boolean;
  plan?: string;
  status?: string;
}

interface DayCount {
  day: string;
  count: number;
}

interface PlatformCount {
  platform: string;
  count: number;
}

interface StatsData {
  users: {
    total: number;
    completedOnboarding: number;
    pro: number;
    dailySignups: DayCount[];
    recent: UserRow[];
  };
  content: {
    total: number;
    topics: number;
    dailyContent: DayCount[];
    platforms: PlatformCount[];
  };
  usage: {
    total: number;
    daily: DayCount[];
  };
}

function StatCard({
  label,
  value,
  sub,
  color = "text-white",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="text-sm text-white/50 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

function MiniBar({ data, label }: { data: DayCount[]; label: string }) {
  const max = Math.max(...data.map((d) => Number(d.count)), 1);
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="text-sm text-white/50 mb-4">{label}（近7天）</div>
      <div className="flex items-end gap-1 h-16">
        {data.length === 0 ? (
          <div className="text-white/30 text-xs">暂无数据</div>
        ) : (
          data.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-purple-500/70 rounded-sm min-h-[2px]"
                style={{ height: `${(Number(d.count) / max) * 56}px` }}
              />
              <div className="text-[9px] text-white/30">
                {new Date(d.day).getMonth() + 1}/{new Date(d.day).getDate()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) {
      router.push("/login");
      return;
    }
    if (!ADMIN_EMAILS.includes(session.user.email ?? "")) {
      setError("你没有访问权限");
      setLoading(false);
      return;
    }
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch(() => setError("加载失败，请刷新重试"))
      .finally(() => setLoading(false));
  }, [session, isPending, router]);

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-white/50 text-sm animate-pulse">加载中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  if (!stats) return null;

  const onboardingRate =
    stats.users.total > 0
      ? Math.round((stats.users.completedOnboarding / stats.users.total) * 100)
      : 0;

  const platformMap: Record<string, string> = {
    douyin: "抖音",
    xiaohongshu: "小红书",
    weibo: "微博",
    zhihu: "知乎",
    bilibili: "B站",
    x: "X",
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg">🛠 Admin 后台</div>
          <div className="text-xs text-white/40 mt-0.5">CreatorOS 数据总览</div>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xs text-white/40 hover:text-white/70 transition"
        >
          ← 返回主页
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* 核心指标 */}
        <section>
          <h2 className="text-xs uppercase text-white/40 tracking-widest mb-4">📊 核心指标</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="总注册用户" value={stats.users.total} color="text-purple-400" />
            <StatCard
              label="完成引导"
              value={`${stats.users.completedOnboarding} 人`}
              sub={`完成率 ${onboardingRate}%`}
              color="text-blue-400"
            />
            <StatCard
              label="Pro 订阅"
              value={stats.users.pro}
              sub="付费用户"
              color="text-yellow-400"
            />
            <StatCard
              label="总生成内容"
              value={stats.content.total}
              sub={`共 ${stats.content.topics} 个选题`}
              color="text-green-400"
            />
          </div>
        </section>

        {/* 趋势图 */}
        <section>
          <h2 className="text-xs uppercase text-white/40 tracking-widest mb-4">📈 趋势</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MiniBar data={stats.users.dailySignups} label="每日新增用户" />
            <MiniBar data={stats.content.dailyContent} label="每日生成内容" />
            <MiniBar data={stats.usage.daily} label="每日 AI 调用" />
          </div>
        </section>

        {/* 平台分布 */}
        {stats.content.platforms.length > 0 && (
          <section>
            <h2 className="text-xs uppercase text-white/40 tracking-widest mb-4">
              🎯 内容平台分布
            </h2>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="space-y-3">
                {stats.content.platforms.map((p, i) => {
                  const maxCount = Number(stats.content.platforms[0].count);
                  const pct = Math.round((Number(p.count) / maxCount) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-20 text-sm text-white/70 shrink-0">
                        {platformMap[p.platform] ?? p.platform}
                      </div>
                      <div className="flex-1 bg-white/10 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-sm text-white/50 w-8 text-right">{p.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* 用户列表 */}
        <section>
          <h2 className="text-xs uppercase text-white/40 tracking-widest mb-4">👥 最近注册用户</h2>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40 text-xs">
                  <th className="text-left px-4 py-3">用户</th>
                  <th className="text-left px-4 py-3">邮箱</th>
                  <th className="text-center px-4 py-3">引导</th>
                  <th className="text-center px-4 py-3">套餐</th>
                  <th className="text-right px-4 py-3">注册时间</th>
                </tr>
              </thead>
              <tbody>
                {stats.users.recent.map((u, i) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 last:border-0 hover:bg-white/5 transition"
                  >
                    <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-white/60">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      {u.has_profile ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.plan === "pro" ? (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                          Pro
                        </span>
                      ) : (
                        <span className="text-xs text-white/30">免费</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-white/40 text-xs">
                      {new Date(u.created_at).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 总使用量 */}
        <section>
          <h2 className="text-xs uppercase text-white/40 tracking-widest mb-4">⚡ AI 使用量</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="累计 AI 调用次数"
              value={stats.usage.total}
              sub="所有用户合计"
              color="text-cyan-400"
            />
            <StatCard
              label="人均使用次数"
              value={
                stats.users.total > 0
                  ? (stats.usage.total / stats.users.total).toFixed(1)
                  : "0"
              }
              sub="总次数 ÷ 总用户"
              color="text-pink-400"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
