/** Object keys don't keep numeric order, since integer keys like 0 and 1 always come first. */
export function sortedByKey<T>(record: { [key: number]: T }): [number, T][] {
    return Object.entries(record)
        .map(([key, item]): [number, T] => [Number(key), item])
        .sort(([a], [b]) => a - b);
}
