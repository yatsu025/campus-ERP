import "server-only";

/** PostgREST returns at most 1000 rows per request. This helper pages through all of them. */
export async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>, max = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data } = await build(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
