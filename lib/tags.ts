// The complete list of tags a contact can have. Nothing else is offered.
export const TAG_OPTIONS: string[] = [
  "Existing PMS Investors",
  "Existing RIA Investors",
  "Shareholders",
  "FMS",
  "EO",
  "GRI",
  "Miscellaneous",
  "IFA",
  "Distributors",
  "Leads",
];

// Contacts with either of these tags are the ones shown on the Investors page.
export const INVESTOR_TAGS: string[] = ["Existing PMS Investors", "Existing RIA Investors"];

export function isInvestorTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  return INVESTOR_TAGS.some((investorTag) => investorTag.toLowerCase() === normalized);
}

export const TAG_COLORS: Record<string, string> = {
  "Existing PMS Investors": "#3b82f6",
  "Existing RIA Investors": "#6366f1",
  Shareholders: "#8b5cf6",
  FMS: "#10b981",
  EO: "#f59e0b",
  GRI: "#06b6d4",
  Miscellaneous: "#64748b",
  IFA: "#ec4899",
  Distributors: "#84cc16",
  Leads: "#f97316",
};
