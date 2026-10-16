// The complete list of tags a contact can have. Nothing else is offered.
export const TAG_OPTIONS: string[] = [
  "Existing PMS Investors",
  "Existing RIA Investors",
  "Shareholders",
  "FMS",
  "EO",
  "Miscellaneous",
  "IFA",
  "Distributors",
  "Leads",
  "HNI Professional",
  "HNI Founder",
  "GRI / Real Estate",
  "Friends",
  "Family Office",
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
  Miscellaneous: "#64748b",
  IFA: "#ec4899",
  Distributors: "#84cc16",
  Leads: "#f97316",
  "HNI Professional": "#0ea5e9",
  "HNI Founder": "#a855f7",
  "GRI / Real Estate": "#22c55e",
  "Friends": "#eab308",
  "Family Office": "#f43f5e",
};
