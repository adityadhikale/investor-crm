export const TAG_OPTIONS: string[] = [
  "Investors",
  "Shareholders",
  "FMS Leads",
  "EO",
  "GRI",
  "Potential Leads",
  "IFA",
  "Distributors",
  "Leads",
];

export const INVESTOR_TAG = "Investors";

export function isInvestorTag(tag: string): boolean {
  return tag.trim().toLowerCase() === INVESTOR_TAG.toLowerCase();
}

export const TAG_COLORS: Record<string, string> = {
  Investors: "#3b82f6",
  Shareholders: "#8b5cf6",
  "FMS Leads": "#10b981",
  EO: "#f59e0b",
  GRI: "#06b6d4",
  "Potential Leads": "#ef4444",
  IFA: "#ec4899",
  Distributors: "#84cc16",
  Leads: "#f97316",
};
