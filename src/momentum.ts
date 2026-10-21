import type { Trend } from './model';

export type VelocityEvidence = {
  viewsPerHour: number;
  addedViews: number;
  hours: number;
  firstObservedAt: string;
  lastObservedAt: string;
};

/**
 * Compare stored official YouTube cumulative view observations. No predicted growth,
 * virality score, cross-platform inference, or claims about source-video contents.
 * Single observations and counter corrections do not justify velocity estimates.
 */
export function measureViewVelocity(
  trend: Trend,
  asOf: string = trend.observedAt,
): VelocityEvidence | null {
  if (trend.source !== 'YouTube') return null;
  const now = Date.parse(asOf);
  const published = Date.parse(trend.publishedAt);
  if (!Number.isFinite(now) || !Number.isFinite(published)) return null;
  const latestByTime = new Map<number, number>();
  for (const point of trend.observations || []) {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at) || !Number.isFinite(point.value) ||
        point.value < 0 || at < published || at > now + 5 * 60000) continue;
    latestByTime.set(at, point.value);
  }
  const points = [...latestByTime].sort((a, b) => a[0] - b[0]);
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  if (now - latest[0] > 24 * 3600000) return null;
  // Use the broadest actual interval within 24 hours that spans at least 15 minutes.
  const first = points.find(([at]) =>
    latest[0] - at >= 15 * 60000 &&
    latest[0] - at <= 24 * 3600000
  );
  if (!first) return null;
  const delta = latest[1] - first[1];
  if (delta < 0) return null; // Counter revisions are not positive growth.
  const hours = (latest[0] - first[0]) / 3600000;
  if (!(hours > 0)) return null;
  return {
    viewsPerHour: delta / hours,
    addedViews: delta,
    hours,
    firstObservedAt: new Date(first[0]).toISOString(),
    lastObservedAt: new Date(latest[0]).toISOString(),
  };
}
