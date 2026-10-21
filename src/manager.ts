import type { Trend } from './model';

export type ManagerCandidate = {
  trendId: string; title: string; url: string; publishedAt: string;
  observedAt: string; views: number; reason: string;
};
export type ManagerPlan = {
  id: string; createdAt: string; status: 'awaiting_selection' | 'selected';
  candidates: ManagerCandidate[]; selectedTrendId?: string; selectedAt?: string;
  steps: { role: string; status: 'done' | 'review' | 'waiting'; detail: string }[];
};

// Source-backed rules, not an LLM judgement or prediction of virality.
export function buildManagerPlan(id: string, createdAt: string, trends: Trend[]): ManagerPlan | null {
  const now = Date.parse(createdAt);
  const fresh = trends.filter(t => {
    const observed = Date.parse(t.observedAt);
    const published = Date.parse(t.publishedAt);
    return t.source === 'YouTube' &&
      t.url.startsWith('https://www.youtube.com/watch?v=') &&
      Number.isFinite(observed) && observed > now - 7 * 86400000 &&
      observed < now + 300000 && Number.isFinite(published) &&
      published <= observed && Number.isFinite(t.value) && t.value >= 0;
  });
  fresh.sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt) ||
    b.value - a.value || a.title.localeCompare(b.title));
  const unique = new Map<string, Trend>();
  for (const t of fresh) if (!unique.has(t.id)) unique.set(t.id, t);
  const shortlist = [...unique.values()].slice(0, 3);
  if (!shortlist.length) return null;
  return {
    id, createdAt, status: 'awaiting_selection',
    candidates: shortlist.map(t => ({
      trendId: t.id, title: t.title, url: t.url, publishedAt: t.publishedAt,
      observedAt: t.observedAt, views: t.value,
      reason: 'Sorterad efter senaste observation och totalt antal visningar. Inte bevis för pågående trendtillväxt.',
    })),
    steps: [
      { role: 'YouTube Discovery', status: 'done',
        detail: 'Läste ' + fresh.length + ' sparade YouTube-signaler från de senaste sju dagarna. Inget nytt API-anrop.' },
      { role: 'Trend Intelligence', status: 'done',
        detail: 'Valde upp till tre unika videor från ett begränsat popularitetsurval. Ingen kalibrerad viralitetspoäng.' },
      { role: 'Research & Rights', status: 'review',
        detail: 'Originalklippen har inte granskats: fakta, Shorts-format och rättigheter måste kontrolleras.' },
      { role: 'Creative Director', status: 'waiting',
        detail: 'Väntar på ditt val för att börja ett engelskt originalmanus. AI-generering kräver separat medgivande.' },
      { role: 'Quality Control', status: 'waiting',
        detail: 'Ett manus måste granskas av dig. Videoexport och publicering får inte startas automatiskt.' },
    ],
  };
}
