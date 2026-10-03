import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/secure-compare";
import { createServiceRoleClient } from "@/lib/supabase-service";
import { saveDailyBackup } from "@/lib/backup";

/** Nightly backup, called by netlify/functions/daily-backup.mts. */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SCHEDULER_SECRET;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();
  if (!expectedSecret || !safeEqual(token, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await saveDailyBackup(createServiceRoleClient());
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
