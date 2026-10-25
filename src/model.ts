import type { ScriptReview } from './review';
import type { ManagerPlan } from './manager';
import type { EditorialRun } from './editorial';

export type Agent = {
  id: string;
  name: string;
  role: string;
  implemented: boolean;
};
export const agents: Agent[] = [
  {
    id: 'tiktok',
    name: 'TikTok Trend Hunter',
    role: 'Trender och format på TikTok',
    implemented: false,
  },
  {
    id: 'instagram',
    name: 'Instagram Trend Hunter',
    role: 'Reels och engagemangssignaler',
    implemented: false,
  },
  {
    id: 'youtube',
    name: 'YouTube Trend Hunter',
    role: 'Populära videor via officiellt API',
    implemented: true,
  },
  {
    id: 'facebook',
    name: 'Facebook Trend Hunter',
    role: 'Facebook-sidor och Reels',
    implemented: false,
  },
  {
    id: 'intelligence',
    name: 'Global Trend Intelligence',
    role: 'Källor, observationer och tillväxt',
    implemented: true,
  },
  {
    id: 'creative',
    name: 'AI Creative Director',
    role: 'Originella manus och öppningar',
    implemented: true,
  },
  {
    id: 'studio',
    name: 'AI Video Production Studio',
    role: 'Typografisk MP4 i webbläsaren',
    implemented: true,
  },
  {
    id: 'quality',
    name: 'Quality Control & Safety',
    role: 'Teknisk kontroll och manuell granskning',
    implemented: true,
  },
  {
    id: 'publishing',
    name: 'Publishing & Distribution',
    role: 'Publicering kräver plattformsanslutning',
    implemented: false,
  },
  {
    id: 'growth',
    name: 'Growth & Performance Optimizer',
    role: 'Analys av publicerade videor',
    implemented: false,
  },
];
export type Observation = { at: string; value: number };
export type Trend = {
  id: string;
  title: string;
  url: string;
  source: 'Hacker News' | 'YouTube';
  region: string;
  metric: string;
  value: number;
  observedAt: string;
  publishedAt: string;
  observations: Observation[];
};
export type Candidate = {
  id: string; title: string; url: string; source: Trend['source'];
  region: string; metric: string; value: number; publishedAt: string;
  observedAt: string; addedAt: string; stage: 'new' | 'research' | 'ready'; note: string;
};
export type Project = {
  id: string;
  title: string;
  script: string;
  sourceUrl: string;
  origin: 'manual' | 'ai';
  revision?: number;
  review?: ScriptReview;
  createdAt: string;
  updatedAt: string;
};
export type Settings = {
  dailyBudget: number;
  monthlyBudget: number;
  maxVideos: number;
  stop: boolean;
  aiTrial: boolean;
  language: 'sv' | 'en';
  contentFocus?: 'social-trends';
  theme?: 'dark' | 'light';
  region: string;
};
export type State = {
  version: number;
  paused: string[];
  trends: Trend[];
  candidates?: Candidate[];
  managerPlans?: ManagerPlan[];
  editorialRuns?: EditorialRun[];
  projects: Project[];
  events: { at: string; text: string }[];
  settings: Settings;
};
export const initialState: State = {
  version: 0,
  paused: [],
  trends: [],
  candidates: [],
  managerPlans: [],
  editorialRuns: [],
  projects: [],
  events: [],
  settings: {
    dailyBudget: 0,
    monthlyBudget: 0,
    maxVideos: 3,
    stop: true,
    aiTrial: false,
    language: 'en',
    contentFocus: 'social-trends',
    theme: 'dark',
    region: 'SE',
  },
};
export function signalGrowth(t: Trend): number | null {
  if (t.source === 'YouTube') return null;
  const a = t.observations[0];
  const b = t.observations[t.observations.length - 1];
  if (!a || !b || Date.parse(b.at) - Date.parse(a.at) < 15 * 60000) return null;
  return (
    (b.value - a.value) / ((Date.parse(b.at) - Date.parse(a.at)) / 3600000)
  );
}
