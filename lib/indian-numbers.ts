/**
 * Indian digit grouping (lakh / crore): 12,34,56,789 instead of 123,456,789.
 * AI text often comes back in Western grouping, so figures are regrouped here
 * before they are shown or sent.
 */

/** Groups the integer digits the Indian way: last three, then pairs. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${lastThree}`;
}

/** Formats a number with Indian grouping, e.g. 5756422.7 -> "57,56,422.7". */
export function formatIndianNumber(value: number, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value)) return "";
  const [integer, fraction] = Math.abs(value).toFixed(maximumFractionDigits).split(".");
  const trimmed = fraction ? fraction.replace(/0+$/, "") : "";
  return `${value < 0 ? "-" : ""}${groupIndian(integer)}${trimmed ? `.${trimmed}` : ""}`;
}

/**
 * Rewrites Western-grouped numbers in a piece of text to Indian grouping
 * ("₹5,756,422.70" -> "₹57,56,422.70"). Numbers with five digits or fewer, and
 * numbers already grouped the Indian way, come back unchanged.
 */
export function toIndianGrouping(text: string): string {
  return text.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, (match) => {
    const [integer, fraction] = match.split(".");
    const grouped = groupIndian(integer.replace(/,/g, ""));
    return fraction === undefined ? grouped : `${grouped}.${fraction}`;
  });
}
