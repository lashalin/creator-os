import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserSubscription, getUsageToday, FREE_LIMITS } from "@/lib/subscription";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const [sub, usage] = await Promise.all([
      getUserSubscription(session.user.id),
      getUsageToday(session.user.id),
    ]);

    return NextResponse.json({ subscription: sub, usage, limits: FREE_LIMITS });
  } catch (error) {
    console.error("Get subscription error:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
