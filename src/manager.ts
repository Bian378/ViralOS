import type { Trend } from './model';
import { measureViewVelocity } from './momentum.ts';

export type ManagerCandidate = {
  trendId: string; title: string; url: string; publishedAt: string;
  observedAt: string; views: number; reason: string;
  // Optional for backwards compatibility with already persisted plans.
  viewsPerHour?: number; measuredHours?: number; observedViewIncrease?: number;
};
export type ManagerPlan = {
  id: string; createdAt: string; status: 'awaiting_selection' | 'selected';
  candidates: ManagerCandidate[]; selectedTrendId?: string; selectedAt?: string;
  steps: { role: string; status: 'done' | 'review' | 'waiting'; detail: string }[];
};

// Rule-based source observations, not an LLM or prediction of future popularity.
// When valid interval data exist, prefer measured view velocity over raw totals;
// otherwise fall back transparently to the existing popularity shortlist.
export function buildManagerPlan(id: string, createdAt: string, trends: Trend[]): ManagerPlan | null {
  const now = Date.parse(createdAt);
  if (!Number.isFinite(now)) return null;
  const fresh = trends.filter(t => {
    const observed = Date.parse(t.observedAt);
    const published = Date.parse(t.publishedAt);
    return t.source === 'YouTube' &&
      /^https:\/\/www\.youtube\.com\/watch\?v=[a-zA-Z0-9_-]+$/.test(t.url) &&
      Number.isFinite(observed) && observed > now - 7 * 86400000 &&
      observed < now + 300000 && Number.isFinite(published) &&
      published <= observed && Number.isFinite(t.value) && t.value >= 0;
  });
  const unique = new Map<string, Trend>();
  for (const trend of fresh) {
    const previous = unique.get(trend.id);
    if (!previous || previous.observedAt < trend.observedAt) unique.set(trend.id, trend);
  }
  const measured = [...unique.values()].map(trend => ({
    trend,
    velocity: measureViewVelocity(trend, createdAt),
  }));
  measured.sort((a, b) =>
    Number(Boolean(b.velocity)) - Number(Boolean(a.velocity)) ||
    ((b.velocity?.viewsPerHour ?? 0) - (a.velocity?.viewsPerHour ?? 0)) ||
    b.trend.observedAt.localeCompare(a.trend.observedAt) ||
    b.trend.value - a.trend.value ||
    a.trend.title.localeCompare(b.trend.title));
  const shortlist = measured.slice(0, 3);
  if (!shortlist.length) return null;
  const observedCount = measured.filter(t => t.velocity !== null).length;
  return {
    id, createdAt, status: 'awaiting_selection',
    candidates: shortlist.map(({ trend: t, velocity }) => ({
      trendId: t.id, title: t.title, url: t.url, publishedAt: t.publishedAt,
      observedAt: t.observedAt, views: t.value,
      ...(velocity ? {
        viewsPerHour: velocity.viewsPerHour,
        measuredHours: velocity.hours,
        observedViewIncrease: velocity.addedViews,
      } : {}),
      reason: velocity
        ? 'Uppmätt förändring mellan två YouTube-observationer under de senaste 24 timmarna. Medelhastighet för intervallet, ingen prognos eller viralitetspoäng.'
        : 'Otillräckliga upprepade mätningar. Reservurval efter senaste observation och totalt antal visningar; ingen tillväxt har verifierats.',
    })),
    steps: [
      { role: 'YouTube Discovery', status: 'done',
        detail: 'Läste ' + fresh.length + ' sparade YouTube-signaler från de senaste sju dagarna. Ingen ny API-hämtning.' },
      { role: 'Trend Intelligence', status: 'done',
        detail: observedCount + ' av ' + measured.length +
          ' unika kandidater hade två giltiga mätningar för visningar per timme. ' +
          'Dessa prioriteras; övriga rankas efter observationstid/totalvisningar. Ingen viralitetspoäng.' },
      { role: 'Research & Rights', status: 'review',
        detail: 'Originalklippen har inte granskats: fakta, Shorts-format och rättigheter måste kontrolleras.' },
      { role: 'Creative Director', status: 'waiting',
        detail: 'Väntar på ditt val för engelskt originalmanus. AI-generering kräver separat medgivande.' },
      { role: 'Quality Control', status: 'waiting',
        detail: 'Du måste granska manus och video. Publicering är alltid en separat åtgärd.' },
    ],
  };
}
