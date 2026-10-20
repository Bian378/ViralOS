export type JobStatus = 'queued' | 'running' | 'waiting' | 'retry' | 'complete' | 'cancelled' | 'failed' | 'needs_review';
export type QueueJob = {
  id: string; owner: string; kind: 'collect' | 'pipeline'; source: 'hn' | 'youtube';
  status: JobStatus; stage: 'collect' | 'draft'; createdAt: string; updatedAt: string;
  scheduledAt: number; nextRun: number; priority: number; attempts: number;
  lease: string | null; leaseUntil: number; slot: string; trendId: string | null;
  consent: boolean; message: string; projectId: string | null; version: number;
};
export type QueueIndex = {
  version: number; stopped: boolean; history: string[]; active: string[];
};
export function terminal(status: string): boolean {
  return ['complete', 'cancelled', 'failed', 'needs_review'].includes(status);
}
export function canClaim(job: QueueJob, time: number, stopped: boolean, paused: boolean, force = false): boolean {
  if (stopped || paused || terminal(job.status)) return false;
  if (job.status === 'running') return job.leaseUntil < time;
  return force || job.nextRun <= time;
}
export function retryDelay(attempt: number): number {
  return Math.min(30 * 60000, 60000 * Math.pow(2, Math.max(0, attempt - 1)));
}
