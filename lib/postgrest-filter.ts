/**
 * Builds a PostgREST `.or()` filter that matches `term` anywhere in any of
 * `columns` (case-insensitive). The value is double-quoted so search text
 * containing `,` `(` `)` or `.` cannot change the filter itself.
 */
export function ilikeAnyFilter(columns: string[], term: string): string {
  const quoted = `"%${term.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
