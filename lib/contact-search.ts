import type { ContactRow } from "@/components/contact-details-dialog";

/**
 * Instant search over contacts held in memory.
 *
 * Each contact is prepared once (lower-cased name, name words, digits-only
 * phone, lower-cased email). A search then makes one pass over the list: every
 * word typed must match somewhere (word start of the name, anywhere in the
 * name, the phone digits or the email). Matches are ranked, best first.
 * For a few thousand contacts this takes well under a millisecond, so results
 * can update on every keystroke without asking the server.
 */

export interface SearchableContact<T extends ContactRow = ContactRow> {
  contact: T;
  name: string;
  words: string[];
  digits: string;
  email: string;
  /** Time of the latest WhatsApp message (ms), 0 if none. */
  lastAt: number;
  /** Date the contact was saved (ms), 0 if unknown. */
  savedAt: number;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function buildSearchIndex<T extends ContactRow>(contacts: T[]): SearchableContact<T>[] {
  return contacts.map((contact) => {
    const name = normalize(contact.name ?? "");
    return {
      contact,
      name,
      words: name.split(/[^a-z0-9]+/).filter(Boolean),
      digits: String(contact.phone ?? "").replace(/\D/g, ""),
      email: normalize(contact.email ?? ""),
      lastAt: toTime(contact.last_message_at),
      savedAt: toTime(contact.date_saved),
    };
  });
}

/** Score of one typed word against a contact; 0 means no match. */
function scoreToken(entry: SearchableContact<ContactRow>, token: string): number {
  const numeric = token.replace(/\D/g, "");
  const looksLikeNumber = numeric.length >= 2 && numeric.length >= token.length - 1;

  if (looksLikeNumber) {
    // +91 / 91 / 0 prefixes typed by the user should still find the 10-digit number.
    const variants = new Set([numeric]);
    if (numeric.length > 10 && numeric.startsWith("91")) variants.add(numeric.slice(2));
    if (numeric.length > 10 && numeric.startsWith("0")) variants.add(numeric.slice(1));
    for (const variant of variants) {
      if (entry.digits.startsWith(variant)) return 6;
      if (entry.digits.includes(variant)) return 4;
    }
    return 0;
  }

  let best = 0;
  for (let i = 0; i < entry.words.length; i++) {
    if (entry.words[i].startsWith(token)) {
      best = Math.max(best, i === 0 ? 8 : 6);
      break;
    }
  }
  if (best === 0 && entry.name.includes(token)) best = 3;
  if (entry.email) {
    if (entry.email.startsWith(token)) best = Math.max(best, 4);
    else if (entry.email.includes(token)) best = Math.max(best, 2);
  }
  return best;
}

export function searchContacts<T extends ContactRow>(
  index: SearchableContact<T>[],
  query: string,
  tags: string[] = [],
  /** Order among equal matches after the most recent chat: newest saved first, or A to Z. */
  tieBreak: "saved" | "name" = "saved",
): T[] {
  const normalizedQuery = normalize(query).trim();
  // A phone number typed with spaces, dashes or +91 is one search term, not several.
  const phoneLike = /^[\d\s+()-]+$/.test(normalizedQuery) && normalizedQuery.replace(/\D/g, "").length >= 3;
  const tokens = phoneLike
    ? [normalizedQuery.replace(/\D/g, "")]
    : normalizedQuery
        .split(/\s+/)
        .map((token) => token.replace(/[.,;:]+$/, ""))
        .filter(Boolean);

  const scored: Array<{ entry: SearchableContact<T>; score: number }> = [];
  for (const entry of index) {
    if (tags.length > 0 && !entry.contact.tags?.some((tag) => tags.includes(tag))) continue;

    let score = 0;
    let matchesAll = true;
    for (const token of tokens) {
      const tokenScore = scoreToken(entry, token);
      if (tokenScore === 0) {
        matchesAll = false;
        break;
      }
      score += tokenScore;
    }
    if (!matchesAll) continue;
    if (tokens.length > 0 && entry.name.startsWith(normalizedQuery)) score += 4;
    scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Most recent chat first, like WhatsApp; then newest saved; then A to Z.
    if (b.entry.lastAt !== a.entry.lastAt) return b.entry.lastAt - a.entry.lastAt;
    if (tieBreak === "saved" && b.entry.savedAt !== a.entry.savedAt) return b.entry.savedAt - a.entry.savedAt;
    return a.entry.name.localeCompare(b.entry.name);
  });
  return scored.map((item) => item.entry.contact);
}
