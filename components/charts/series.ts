/** Plain data helpers shared by server pages and client charts (no "use client" here on purpose). */

export type TrendPoint = {
  /** YYYY-MM-DD */
  date: string;
  value: number;
  /** Same-position value from the previous period, when comparing. */
  previous?: number;
  /** The previous period's date for this position, for the tooltip. */
  previousDate?: string;
};

/** Pairs a current series with the previous one position-for-position. */
export function withPrevious<T extends { date: string }>(
  current: T[],
  previous: T[] | undefined,
  pick: (point: T) => number,
): TrendPoint[] {
  return current.map((point, i) => {
    const prior = previous?.[i];
    return {
      date: point.date,
      value: pick(point),
      ...(prior ? { previous: pick(prior), previousDate: prior.date } : {}),
    };
  });
}
