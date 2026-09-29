/**
 * Supabase/PostgREST caps every response at the project's configured "Max
 * Rows" setting (often 1000), regardless of any .limit() requested above
 * it — silently, with no error. Any query whose result is used as a full
 * list (counted, filtered, deduped) must page through with .range()
 * instead of relying on a single unbounded/limited select.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    results.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return results;
}
