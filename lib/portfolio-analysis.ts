import ExcelJS from "exceljs";
import { callGeminiGenerateContent } from "@/lib/gemini";
import { cellValueToString } from "@/lib/parse-spreadsheet";
import type { PortfolioAnalysis, PortfolioHolding } from "@/lib/portfolio-types";

// Keeps one request comfortably inside the model's limits and the host's time budget.
const MAX_TEXT_CHARS = 200_000;
// Gives up before the host would cut the request off, so the update shows a clear error.
const ANALYSIS_TIMEOUT_MS = 55_000;

export type PortfolioFileKind = "pdf" | "xlsx" | "csv" | "text";

export function portfolioFileKind(fileName: string, mimeType: string | null): PortfolioFileKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".txt")) return "text";
  return null;
}

async function workbookToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("The Excel file could not be read. Please make sure it's a valid .xlsx file.");
  }
  const parts: string[] = [];
  for (const sheet of workbook.worksheets) {
    const lines: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      const cells: string[] = [];
      for (let col = 1; col < values.length; col += 1) cells.push(cellValueToString(values[col]));
      if (cells.some((cell) => cell !== "")) lines.push(cells.join(" | "));
    });
    if (lines.length > 0) parts.push(`--- Sheet: ${sheet.name} ---\n${lines.join("\n")}`);
  }
  if (parts.length === 0) throw new Error("The Excel file does not contain any data.");
  return parts.join("\n\n");
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanHoldings(value: unknown, direction: "desc" | "asc"): PortfolioHolding[] {
  if (!Array.isArray(value)) return [];
  const holdings: PortfolioHolding[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const name = stringOrNull(row.name);
    if (!name) continue;
    holdings.push({
      name,
      ticker: stringOrNull(row.ticker),
      return_pct: numberOrNull(row.return_pct),
      detail: stringOrNull(row.detail),
    });
  }
  // Rank by the figure itself rather than trusting the model's ordering.
  holdings.sort((a, b) => {
    const left = a.return_pct ?? (direction === "desc" ? -Infinity : Infinity);
    const right = b.return_pct ?? (direction === "desc" ? -Infinity : Infinity);
    return direction === "desc" ? right - left : left - right;
  });
  return holdings.slice(0, 5);
}

function parseAnalysis(raw: string, hasPrevious: boolean): PortfolioAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error("Gemini returned an unexpected response format.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Gemini returned an unexpected response format.");
  }
  const result = parsed as Record<string, unknown>;
  const aum = (result.aum ?? {}) as Record<string, unknown>;
  const returns = (result.returns ?? {}) as Record<string, unknown>;
  const changes = (result.changes_vs_previous ?? null) as Record<string, unknown> | null;

  return {
    aum: {
      value: numberOrNull(aum.value),
      display: stringOrNull(aum.display),
      currency: stringOrNull(aum.currency),
      as_of: stringOrNull(aum.as_of),
    },
    returns: {
      period: stringOrNull(returns.period),
      pct: numberOrNull(returns.pct),
      display: stringOrNull(returns.display),
    },
    top_gainers: cleanHoldings(result.top_gainers, "desc"),
    top_losers: cleanHoldings(result.top_losers, "asc"),
    summary: stringOrNull(result.summary) ?? "",
    changes_vs_previous:
      hasPrevious && changes
        ? {
            aum_delta_pct: numberOrNull(changes.aum_delta_pct),
            returns_delta_pct_points: numberOrNull(changes.returns_delta_pct_points),
            notes: stringOrNull(changes.notes),
          }
        : null,
    confidence_notes: stringOrNull(result.confidence_notes),
  };
}

/**
 * Reads a portfolio / investor update and extracts AUM, returns, the top 5
 * gainers and bottom 5 losers, plus how it compares with the previous update.
 * PDFs go to Gemini directly; Excel and CSV are flattened to text first.
 */
export async function analyzePortfolioUpdate(args: {
  buffer: Buffer;
  fileName: string;
  mimeType: string | null;
  previousAnalysis: PortfolioAnalysis | null;
  previousLabel: string | null;
}): Promise<PortfolioAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const kind = portfolioFileKind(args.fileName, args.mimeType);
  if (!kind) throw new Error("Unsupported file type. Please use PDF, Excel (.xlsx) or CSV.");

  const previous = args.previousAnalysis
    ? `\n\nPREVIOUS UPDATE (${args.previousLabel ?? "earlier"}) extracted figures, for comparison:\n${JSON.stringify({
        aum: args.previousAnalysis.aum,
        returns: args.previousAnalysis.returns,
      })}`
    : "";

  const instructions = `You are an analyst assistant for CREST Capital Management's investor CRM. The attached material is an investor or portfolio update. Extract the key figures exactly as stated. NEVER invent or estimate a number: if a figure is not in the document, use null.

Respond with ONLY one JSON object in this shape:
{
  "aum": {"value": number|null (in the document's own currency units, full number, e.g. 12500000), "display": string|null (as written, e.g. "₹1.25 Cr"), "currency": string|null, "as_of": string|null (date or period as stated)},
  "returns": {"period": string|null (e.g. "FY26", "since inception", "1M"), "pct": number|null (percent, e.g. 14.2), "display": string|null (as written)},
  "top_gainers": up to 5 items {"name": string, "ticker": string|null, "return_pct": number|null, "detail": string|null (any other figure given, e.g. absolute P&L or weight)} ordered best first,
  "top_losers": up to 5 items in the same shape ordered worst first (negative returns first),
  "summary": string (2-3 short sentences: AUM, returns and what stands out),
  "changes_vs_previous": ${args.previousAnalysis ? `{"aum_delta_pct": number|null, "returns_delta_pct_points": number|null, "notes": string|null (one short sentence on what changed versus the previous update)}` : "null"},
  "confidence_notes": string|null (anything missing, ambiguous or assumed, e.g. "returns are for a different period than the previous update")
}
Gainers and losers must come from the holdings/stocks listed in the document, ranked by their stated return. If the document has no holdings-level returns, return empty arrays. If the document does not print a ticker, give the NSE trading symbol only when you are certain of it for that exact listed company; otherwise null. Never guess a ticker for ETFs or funds you are unsure of.${previous}`;

  const parts: Array<Record<string, unknown>> = [{ text: instructions }];
  if (kind === "pdf") {
    parts.push({ inline_data: { mime_type: "application/pdf", data: args.buffer.toString("base64") } });
  } else {
    const text = kind === "xlsx" ? await workbookToText(args.buffer) : args.buffer.toString("utf8");
    if (!text.trim()) throw new Error("The file is empty.");
    parts.push({ text: `DOCUMENT CONTENT:\n${text.slice(0, MAX_TEXT_CHARS)}` });
  }

  const data = await callGeminiGenerateContent(apiKey, {
    contents: [{ parts }],
    generationConfig: { responseMimeType: "application/json" },
  }, { timeoutMs: ANALYSIS_TIMEOUT_MS });

  const generated = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generated || !generated.trim()) throw new Error("No analysis generated by Gemini.");
  return parseAnalysis(generated, args.previousAnalysis !== null);
}
