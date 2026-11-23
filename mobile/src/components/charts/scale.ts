export interface ChartPoint {
  /** Already formatted x-axis label. */
  label: string;
  value: number;
}

/** Rounds `rawMax` up to a "nice" axis maximum (7 -> 7, 23 -> 30, 140 -> 200). Never below 1. */
export function niceMax(rawMax: number): number {
  const safe = Math.max(1, rawMax);
  const magnitude = Math.pow(10, Math.floor(Math.log10(safe)));
  return Math.ceil(safe / magnitude) * magnitude;
}

/** Show every n-th x label so at most `maxLabels` are drawn. */
export function labelStep(count: number, maxLabels: number): number {
  return Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
}

export const CHART_PADDING = { left: 34, right: 10, top: 10, bottom: 24 } as const;
