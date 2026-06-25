/** Supabase/PostgREST default max rows per request. */
const PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Fetches every row from a paginated Supabase query (PostgREST caps at 1000/request).
 */
export async function fetchAllRows<T extends Record<string, unknown>>(
  queryPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryPage(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: [], error: error.message };

    const page = data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: all, error: null };
}
