import { TAG_OPTIONS } from "@/lib/tags";

/**
 * Matches the tag text typed in a file to one of the CRM's tags, forgiving the
 * usual differences: capital letters, extra or missing spaces (for example
 * "GRI/ Real Estate" for "GRI / Real Estate"), punctuation, and singular or
 * plural ("HNI founders"). Common short names are also understood.
 */

export function normalizeTagKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ignores a trailing "s" on each word, so "friends" and "friend" compare equal. */
function stripPlural(key: string): string {
  return key
    .split(" ")
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
    .join(" ");
}

const KEYS = TAG_OPTIONS.map((tag) => {
  const key = normalizeTagKey(tag);
  return { tag, key, loose: stripPlural(key) };
});

// Short names people commonly use, mapped to the CRM tag they mean.
const ALIASES: Record<string, string> = {
  gri: "GRI / Real Estate",
  "real estate": "GRI / Real Estate",
  "gri real estate": "GRI / Real Estate",
  "gri and real estate": "GRI / Real Estate",
  pms: "Existing PMS Investors",
  "existing pms": "Existing PMS Investors",
  "pms investor": "Existing PMS Investors",
  ria: "Existing RIA Investors",
  "existing ria": "Existing RIA Investors",
  "ria investor": "Existing RIA Investors",
  misc: "Miscellaneous",
  other: "Miscellaneous",
  others: "Miscellaneous",
  "fms leads": "FMS",
  lead: "Leads",
};

/** The CRM tag this text means, or null if it doesn't clearly match one. */
export function matchTag(raw: string): string | null {
  const key = normalizeTagKey(raw);
  if (!key) return null;
  const loose = stripPlural(key);
  const exact = KEYS.find((item) => item.key === key) ?? KEYS.find((item) => item.loose === loose);
  if (exact) return exact.tag;
  const alias = ALIASES[key] ?? ALIASES[loose];
  if (alias && TAG_OPTIONS.includes(alias)) return alias;
  return null;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Best guess for text that doesn't match exactly. `sure` is true for a clear
 * match; false means "looks close, please check" (for example a typo).
 */
export function suggestTag(raw: string): { tag: string; sure: boolean } | null {
  const sure = matchTag(raw);
  if (sure) return { tag: sure, sure: true };
  const loose = stripPlural(normalizeTagKey(raw));
  if (!loose) return null;
  let best: { tag: string; score: number } | null = null;
  for (const item of KEYS) {
    const longest = Math.max(loose.length, item.loose.length);
    const score = 1 - editDistance(loose, item.loose) / longest;
    if (!best || score > best.score) best = { tag: item.tag, score };
  }
  return best && best.score >= 0.7 ? { tag: best.tag, sure: false } : null;
}

/** Splits a tag cell into its separate tags (separated by ; | , or a new line). */
export function splitTagCell(cell: string): string[] {
  return cell
    .split(/[;|,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
