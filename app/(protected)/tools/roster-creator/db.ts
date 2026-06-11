const PAGE = 1000;

// Supabase caps a single .select() at 1000 rows. For a season with >1000
// players (or buddy links) an unpaginated read silently drops the rest — they
// never get resolved, grouped, or written to a roster. This pages through with
// .range() until exhausted. The query MUST carry a stable .order() (callers
// order by `id`) so the page windows line up and nothing is skipped or doubled.
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
