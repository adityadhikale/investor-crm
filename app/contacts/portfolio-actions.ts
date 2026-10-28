"use server";

import { requireActionAuth } from "@/lib/auth";
import { analyzePortfolioUpdate, portfolioFileKind } from "@/lib/portfolio-analysis";
import {
  MAX_PORTFOLIO_FILE_BYTES,
  PORTFOLIO_UPDATE_COLUMNS,
  type PortfolioAnalysis,
  type PortfolioUpdate,
} from "@/lib/portfolio-types";
import {
  createPortfolioUploadTarget,
  downloadPortfolioFile,
  removePortfolioFile,
  uploadPortfolioFile,
} from "@/lib/supabase-storage";

const MAX_PASTED_CHARS = 100_000;
const MISSING_TABLE_ERROR =
  "Portfolio updates aren't set up yet. Run the latest Supabase migration (portfolio_updates) first.";

function isMissingTable(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /portfolio_updates/.test(error.message ?? ""));
}

/** Step 1: checks the file and returns a one-time address so the browser uploads straight to storage. */
export async function preparePortfolioUpload(
  contactId: string,
  filename: string,
  size: number,
): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  if (!size) return { error: "No file selected." };
  if (size > MAX_PORTFOLIO_FILE_BYTES) return { error: "File is too large. Please choose a file under 15MB." };
  const kind = portfolioFileKind(filename, null);
  if (!kind || kind === "text") return { error: "Please choose a PDF, Excel (.xlsx) or CSV file." };

  const { data: contact } = await supabase.from("contacts").select("id").eq("id", contactId.trim()).maybeSingle();
  if (!contact) return { error: "The contact could not be found." };

  try {
    return await createPortfolioUploadTarget(contact.id, filename);
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Could not prepare the upload." };
  }
}

/** Step 2: the file is in storage; records it as an update waiting for analysis. */
export async function createPortfolioUpdate(
  contactId: string,
  path: string,
  fileName: string,
  mimeType: string,
  size: number,
): Promise<{ id: string } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const id = contactId.trim();
  if (!path.startsWith(`${id}/`) || path.includes("..")) return { error: "That file isn't available for this contact." };

  const { data, error } = await supabase
    .from("portfolio_updates")
    .insert({
      contact_id: id,
      file_path: path,
      file_name: fileName,
      mime_type: mimeType || null,
      size_bytes: size,
      source: "file",
    })
    .select("id")
    .single();
  if (error || !data) return { error: isMissingTable(error) ? MISSING_TABLE_ERROR : "The update could not be saved." };
  return { id: data.id };
}

/** Saves pasted text as a text attachment. Analysis is a separate call, like for files. */
export async function createPortfolioUpdateFromText(
  contactId: string,
  text: string,
  title: string,
): Promise<{ id: string } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const id = contactId.trim();
  const body = text.trim();
  if (!body) return { error: "Paste the update text first." };
  if (body.length > MAX_PASTED_CHARS) return { error: "That text is too long. Please paste under 100,000 characters." };

  const { data: contact } = await supabase.from("contacts").select("id").eq("id", id).maybeSingle();
  if (!contact) return { error: "The contact could not be found." };

  const cleanTitle = title.trim().slice(0, 80);
  const fileName = `${(cleanTitle || "Pasted update").replace(/[^a-zA-Z0-9._ -]/g, "_")}.txt`;
  const path = `${id}/${Date.now()}-pasted.txt`;
  try {
    await uploadPortfolioFile(path, Buffer.from(body, "utf8"), "text/plain");
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "The update could not be saved." };
  }

  const { data, error } = await supabase
    .from("portfolio_updates")
    .insert({
      contact_id: id,
      title: cleanTitle || null,
      file_path: path,
      file_name: fileName,
      mime_type: "text/plain",
      size_bytes: Buffer.byteLength(body, "utf8"),
      source: "paste",
    })
    .select("id")
    .single();
  if (error || !data) {
    await removePortfolioFile(path);
    return { error: isMissingTable(error) ? MISSING_TABLE_ERROR : "The update could not be saved." };
  }
  return { id: data.id };
}

/**
 * Reads the stored file with AI and saves the analysis. The previous analysed
 * update for the same contact (the one just before this in time) is used for
 * the "change versus previous" comparison.
 */
export async function analyzePortfolioUpdateById(
  updateId: string,
): Promise<{ update: PortfolioUpdate } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { data: row, error: rowError } = await supabase
    .from("portfolio_updates")
    .select("id, contact_id, file_path, file_name, mime_type, created_at")
    .eq("id", updateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (rowError || !row) return { error: "The update could not be found." };

  const { data: previousRow } = await supabase
    .from("portfolio_updates")
    .select("analysis, title, file_name, created_at")
    .eq("contact_id", row.contact_id)
    .eq("analysis_status", "done")
    .is("deleted_at", null)
    .lt("created_at", row.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let analysis: PortfolioAnalysis | null = null;
  let failure: string | null = null;
  try {
    const buffer = await downloadPortfolioFile(row.file_path);
    analysis = await analyzePortfolioUpdate({
      buffer,
      fileName: row.file_name,
      mimeType: row.mime_type,
      previousAnalysis: (previousRow?.analysis as PortfolioAnalysis | null) ?? null,
      previousLabel: previousRow ? (previousRow.title ?? previousRow.file_name) : null,
    });
  } catch (err: unknown) {
    failure = err instanceof Error ? err.message : "The analysis failed.";
  }

  const { data: saved, error: saveError } = await supabase
    .from("portfolio_updates")
    .update(
      analysis
        ? { analysis, analysis_status: "done", analysis_error: null, as_of_date: asOfDate(analysis.aum.as_of) }
        : { analysis_status: "failed", analysis_error: failure },
    )
    .eq("id", row.id)
    .select(PORTFOLIO_UPDATE_COLUMNS)
    .single();
  if (saveError || !saved) return { error: "The analysis could not be saved." };
  if (failure) return { error: failure };
  return { update: saved as PortfolioUpdate };
}

function asOfDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function deletePortfolioUpdate(updateId: string): Promise<{ success: true } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { error } = await supabase
    .from("portfolio_updates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", updateId);
  if (error) return { error: "The update could not be deleted." };
  return { success: true };
}

/** The contact's current updates, so the page can pick up an analysis that finished in the background. */
export async function listPortfolioUpdates(
  contactId: string,
): Promise<{ updates: PortfolioUpdate[] } | { error: string }> {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { data, error } = await supabase
    .from("portfolio_updates")
    .select(PORTFOLIO_UPDATE_COLUMNS)
    .eq("contact_id", contactId.trim())
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { error: "Portfolio updates could not be loaded." };
  return { updates: (data ?? []) as PortfolioUpdate[] };
}
