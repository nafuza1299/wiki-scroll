/**
 * Runs `task` over every item with at most `limit` in flight.
 *
 * Enrichment fires one request per visible card, and letting ten or more go at
 * once is exactly the burst pattern that gets an IP throttled by the pageviews
 * API. Errors from individual tasks are the caller's to handle; this only bounds
 * how many run at a time.
 */
export async function forEachLimit<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await task(items[index], index);
    }
  });

  await Promise.all(workers);
}
