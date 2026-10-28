export type PortfolioHolding = {
  name: string;
  ticker: string | null;
  return_pct: number | null;
  /** Any extra figure shown in the update for this holding, e.g. "P&L ₹1.2L". */
  detail: string | null;
};

export type PortfolioAnalysis = {
  aum: { value: number | null; display: string | null; currency: string | null; as_of: string | null };
  returns: { period: string | null; pct: number | null; display: string | null };
  top_gainers: PortfolioHolding[];
  top_losers: PortfolioHolding[];
  summary: string;
  changes_vs_previous: {
    aum_delta_pct: number | null;
    returns_delta_pct_points: number | null;
    notes: string | null;
  } | null;
  confidence_notes: string | null;
};

export type PortfolioUpdate = {
  id: string;
  title: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  source: "file" | "paste";
  analysis: PortfolioAnalysis | null;
  analysis_status: "pending" | "done" | "failed";
  analysis_error: string | null;
  as_of_date: string | null;
  created_at: string;
};

export const PORTFOLIO_UPDATE_COLUMNS =
  "id, title, file_name, mime_type, size_bytes, source, analysis, analysis_status, analysis_error, as_of_date, created_at";

export const PORTFOLIO_ACCEPTED_EXTENSIONS = [".pdf", ".xlsx", ".csv"];
export const MAX_PORTFOLIO_FILE_BYTES = 15 * 1024 * 1024;
