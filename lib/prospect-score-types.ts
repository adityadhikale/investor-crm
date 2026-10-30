/** The score fields stored on a contact. The AI and the owner's own score are kept side by side. */
export type ProspectScore = {
  ai_score: number | null;
  ai_score_reason: string | null;
  ai_scored_at: string | null;
  manual_score: number | null;
  manual_score_reason: string | null;
  manual_scored_at: string | null;
};

export const PROSPECT_SCORE_COLUMNS =
  "ai_score, ai_score_reason, ai_scored_at, manual_score, manual_score_reason, manual_scored_at";

export const EMPTY_PROSPECT_SCORE: ProspectScore = {
  ai_score: null,
  ai_score_reason: null,
  ai_scored_at: null,
  manual_score: null,
  manual_score_reason: null,
  manual_scored_at: null,
};

export const MAX_SCORE_REASON_CHARS = 500;

export const SCORE_LEVELS: Array<{ score: number; label: string; meaning: string; className: string }> = [
  { score: 5, label: "Hot", meaning: "Strong capacity and clear interest: act now", className: "bg-emerald-100 text-emerald-800" },
  { score: 4, label: "Strong", meaning: "Good fit, worth active follow-up", className: "bg-lime-100 text-lime-800" },
  { score: 3, label: "Promising", meaning: "Potential, but unclear or not enough information", className: "bg-amber-100 text-amber-800" },
  { score: 2, label: "Weak", meaning: "Low interest or limited fit so far", className: "bg-orange-100 text-orange-800" },
  { score: 1, label: "Poor", meaning: "Poor fit or no engagement", className: "bg-red-100 text-red-800" },
];

export function scoreLevel(score: number) {
  return SCORE_LEVELS.find((level) => level.score === score) ?? null;
}
