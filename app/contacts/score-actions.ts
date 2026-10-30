"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import type { PortfolioAnalysis } from "@/lib/portfolio-types";
import { scoreProspect } from "@/lib/prospect-scoring";
import {
  MAX_SCORE_REASON_CHARS,
  PROSPECT_SCORE_COLUMNS,
  type ProspectScore,
} from "@/lib/prospect-score-types";

const MISSING_COLUMN_ERROR = "Prospect score isn't set up yet. Run the latest Supabase migration (prospect score) first.";

function isMissingColumn(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /ai_score|manual_score/.test(error.message ?? ""));
}

function revalidateContact(contactId: string) {
  revalidatePath("/contacts");
  revalidatePath("/investors");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/investors/${contactId}`);
}

/** Asks the AI for a score and reason from everything the CRM knows about the contact, and saves it as the AI suggestion. */
export async function suggestProspectScore(
  contactId: string,
): Promise<{ score: ProspectScore } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const id = contactId.trim();
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, name, company, tags, notes, date_saved")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (contactError || !contact) return { error: "The contact could not be found." };

  const [messages, notes, followUps, portfolio] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("direction, message_text, sent_at, created_at")
      .eq("contact_id", id)
      .is("deleted_at", null)
      .order("sent_at", { ascending: true }),
    supabase
      .from("interactions")
      .select("note, created_at")
      .eq("contact_id", id)
      .eq("type", "meeting")
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("follow_ups")
      .select("due_date, message, is_done")
      .eq("contact_id", id)
      .is("deleted_at", null),
    supabase
      .from("portfolio_updates")
      .select("analysis")
      .eq("contact_id", id)
      .eq("analysis_status", "done")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (messages.error || notes.error || followUps.error) {
    return { error: "Could not load the contact's messages, notes or follow-ups." };
  }

  let result: { score: number; reason: string };
  try {
    result = await scoreProspect({
      todayIsoDate: new Date().toISOString().slice(0, 10),
      contact,
      messages: messages.data ?? [],
      meetingNotes: notes.data ?? [],
      followUps: followUps.data ?? [],
      // The table may not exist yet; the score works without portfolio data.
      portfolio: portfolio.error ? null : ((portfolio.data?.analysis as PortfolioAnalysis | null) ?? null),
    });
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "The score could not be generated." };
  }

  const { data: saved, error: saveError } = await supabase
    .from("contacts")
    .update({ ai_score: result.score, ai_score_reason: result.reason, ai_scored_at: new Date().toISOString() })
    .eq("id", id)
    .select(PROSPECT_SCORE_COLUMNS)
    .single();
  if (saveError || !saved) return { error: isMissingColumn(saveError) ? MISSING_COLUMN_ERROR : "The score could not be saved." };

  revalidateContact(id);
  return { score: saved as ProspectScore };
}

/** Saves the owner's own score and reason, which takes precedence over the AI suggestion. */
export async function setManualScore(
  contactId: string,
  score: number,
  reason: string,
): Promise<{ score: ProspectScore } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  if (!Number.isInteger(score) || score < 1 || score > 5) return { error: "Choose a score from 1 to 5." };
  const cleanReason = reason.trim();
  if (cleanReason.length > MAX_SCORE_REASON_CHARS) {
    return { error: `Please keep the reason under ${MAX_SCORE_REASON_CHARS} characters.` };
  }

  const id = contactId.trim();
  const { data: saved, error } = await supabase
    .from("contacts")
    .update({ manual_score: score, manual_score_reason: cleanReason || null, manual_scored_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROSPECT_SCORE_COLUMNS)
    .single();
  if (error || !saved) return { error: isMissingColumn(error) ? MISSING_COLUMN_ERROR : "The score could not be saved." };

  revalidateContact(id);
  return { score: saved as ProspectScore };
}

/** Removes the owner's override so the AI suggestion applies again. */
export async function clearManualScore(
  contactId: string,
): Promise<{ score: ProspectScore } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const id = contactId.trim();
  const { data: saved, error } = await supabase
    .from("contacts")
    .update({ manual_score: null, manual_score_reason: null, manual_scored_at: null })
    .eq("id", id)
    .is("deleted_at", null)
    .select(PROSPECT_SCORE_COLUMNS)
    .single();
  if (error || !saved) return { error: isMissingColumn(error) ? MISSING_COLUMN_ERROR : "The override could not be removed." };

  revalidateContact(id);
  return { score: saved as ProspectScore };
}
