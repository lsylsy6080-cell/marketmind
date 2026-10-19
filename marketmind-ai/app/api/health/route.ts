import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/database/admin";

export async function GET() {
  try {
    const database = createAdminClient();

    const { count, error } = await database
      .from("market_candles")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: "Buddy4 PostgreSQL 조회에 실패했습니다.",
          error: error.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Next.js와 Buddy4 PostgreSQL가 정상적으로 연결되었습니다.",
      marketCandleCount: count ?? 0,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류입니다.";

    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}