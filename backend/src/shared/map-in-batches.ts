/** Maps [items] a batch of [size] at a time, keeping their order. */
export async function mapInBatches<T, R>(
  items: readonly T[],
  size: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size);
    results.push(...(await Promise.all(batch.map((item, offset) => map(item, start + offset)))));
  }
  return results;
}
