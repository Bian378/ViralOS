import type { Trend } from './model';

/**
 * Measured view-count change from TWO saved YouTube observations.
 * Never verifies that a video is a Short, viral, licensed, or factually correct.
 */
export function measuredYouTubeGrowth(trend: Trend): number | null {
  if (trend.source !== 'YouTube' || !Array.isArray(trend.observations)) return null;
  const points = trend.observations;
  if (points.length < 2 || points.length > 12) return null;
  const last = points[points.length - 1];
  const end = Date.parse(last.at);
  if (!Number.isFinite(end) || !Number.isSafeInteger(last.value) || last.value < 0) return null;
  for (let i = 1; i < points.length; i++) {
    const p = points[i], previous = points[i - 1];
    const t = Date.parse(p.at), before = Date.parse(previous.at);
    if (!Number.isFinite(t) || !Number.isFinite(before) || t <= before ||
        !Number.isSafeInteger(p.value) || !Number.isSafeInteger(previous.value) ||
        p.value < previous.value || previous.value < 0) return null;
  }
  // The last 24 hours only. Require at least fifteen minutes between readings.
  for (let i = points.length - 2; i >= 0; i--) {
    const first = points[i];
    const interval = end - Date.parse(first.at);
    if (interval > 86400000) break;
    if (interval >= 900000) {
      return (last.value - first.value) / (interval / 3600000);
    }
  }
  return null;
}
