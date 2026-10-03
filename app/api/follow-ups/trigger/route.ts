import { NextResponse } from "next/server";
import { dispatchDueFollowUpReminders } from "@/lib/follow-up-reminders";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SCHEDULER_SECRET;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7).trim();

  // Return identical generic response if SCHEDULER_SECRET is missing or token mismatches
  if (!expectedSecret || token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await dispatchDueFollowUpReminders();
    return NextResponse.json(summary);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to process follow-up reminders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
