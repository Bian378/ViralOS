import { db, json, error, requireAuth, isAppDatabaseError, type RouterResponse, type RouterRoutes } from '@appdeploy/sdk';
import type { State } from '../src/model';
import { canClaim, terminal, retryDelay, type QueueJob, type QueueIndex, type JobStatus } from '../src/queue-model';

type Dependencies = {
  stateFor(owner: string): Promise<State>;
  runCollect(owner: string, body: unknown): Promise<RouterResponse>;
  runDraft(owner: string, body: unknown, beforeDispatch?: () => Promise<boolean>): Promise<RouterResponse>;
};
const JOBS = 'viral_background_jobs';
const INDEX = 'viral_queue_owners';
const SLOTS = 'viral_dispatch_slots';
const SLOT_IDS = Array.from({ length: 16 }, (_, n) => 'slot-' + n);
const timestamp = () => new Date().toISOString();
function object(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}
function knownConflict(err: unknown) {
  return isAppDatabaseError(err) && ['AppDatabaseConflict', 'AppDatabaseConditionFailed'].includes(err.code);
}
async function ownerIndex(owner: string): Promise<QueueIndex> {
  const [old] = await db.get<QueueIndex>(INDEX, [owner], { consistent: true });
  if (old) return old;
  await db.tx.add(INDEX, [{ id: owner, version: 0, stopped: false, history: [], active: [] }]);
  const [created] = await db.get<QueueIndex>(INDEX, [owner], { consistent: true });
  if (!created) throw new Error('Kön kunde inte öppnas.');
  return created;
}
async function readJob(id: string) {
  const [job] = await db.get<QueueJob>(JOBS, [id], { consistent: true });
  return job;
}
function view(job: QueueJob) {
  const { owner: _owner, lease: _lease, slot: _slot, ...publicFields } = job;
  return publicFields;
}
async function patch(job: QueueJob, values: Partial<QueueJob>) {
  const [ok] = await db.tx.update(JOBS, [{
    id: job.id, record: { ...values, version: job.version + 1, updatedAt: timestamp() },
    if: { version: job.version, status: job.status, lease: job.lease }
  }], { patch: true });
  return ok ? { ...job, ...values, version: job.version + 1 } : null;
}
async function finish(job: QueueJob, status: JobStatus, message: string, projectId: string | null = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const index = await ownerIndex(job.owner);
    try {
      await db.transact([
        db.tx.update(JOBS, [{
          id: job.id,
          record: { status, message, projectId, lease: null, leaseUntil: 0, version: job.version + 1, updatedAt: timestamp() },
          if: { version: job.version, status: job.status, lease: job.lease }
        }], { patch: true }),
        db.tx.update(SLOTS, [{ id: job.slot, record: { jobId: null }, if: { jobId: job.id } }], { patch: true }),
        db.tx.update(INDEX, [{
          id: job.owner, record: { version: index.version + 1, active: index.active.filter(id => id !== job.id) },
          if: { version: index.version }
        }], { patch: true })
      ]);
      return true;
    } catch (err) {
      if (knownConflict(err)) {
        const current = await readJob(job.id);
        if (!current || current.version !== job.version) return false;
        continue;
      }
      // Unknown commit outcomes are never repeated blindly; cron will reconcile the receipt.
      throw err;
    }
  }
  throw new Error('Kunde inte avsluta uppgiften efter samtidiga ändringar.');
}
async function enqueue(owner: string, body: unknown, deps: Dependencies) {
  const input = object(body);
  const id = typeof input.requestId === 'string' ? input.requestId : '';
  if (!/^[a-zA-Z0-9-]{8,50}$/.test(id) || !['collect', 'pipeline'].includes(String(input.kind)) ||
      !['hn', 'youtube'].includes(String(input.source))) return error('Ogiltig köförfrågan.', 400);
  const kind = input.kind as 'collect' | 'pipeline';
  const source = input.source as 'hn' | 'youtube';
  const scheduledAt = Number(input.scheduledAt);
  const priority = Number(input.priority);
  if (!Number.isFinite(scheduledAt) || scheduledAt > Date.now() + 7 * 86400000 ||
      ![0, 1].includes(priority)) return error('Välj en starttid inom sju dagar och giltig prioritet.', 400);
  const previous = await readJob(id);
  if (previous) {
    if (previous.owner !== owner || previous.kind !== kind || previous.source !== source ||
        previous.scheduledAt !== scheduledAt || previous.priority !== priority)
      return error('Förfrågans ID hör till en annan uppgift.', 409);
    return json(view(previous));
  }
  const state = await deps.stateFor(owner);
  if (kind === 'pipeline' && (!state.settings.aiTrial || input.acceptUnknownCost !== true))
    return error('AI-provning måste vara aktiverad och ett enda AI-anrop uttryckligen godkänt.', 403);
  const index = await ownerIndex(owner);
  if (index.stopped) return error('Bakgrundskön är stoppad. Återuppta den först.', 409);
  if (index.active.length >= 3) return error('Högst tre väntande eller pågående uppgifter per arbetsyta.', 409);
  let slots = await db.get<{ jobId: string | null }>(SLOTS, SLOT_IDS, { consistent: true });
  const missing = SLOT_IDS.filter((_, n) => !slots[n]);
  if (missing.length) {
    await db.tx.add(SLOTS, missing.map(slot => ({ id: slot, jobId: null })));
    slots = await db.get<{ jobId: string | null }>(SLOTS, SLOT_IDS, { consistent: true });
  }
  const free = SLOT_IDS.find((_, n) => slots[n]?.jobId === null);
  if (!free) return error('Kön är full just nu. Försök igen när en uppgift är klar.', 429);
  const job: QueueJob = {
    id, owner, kind, source, status: 'queued', stage: 'collect', createdAt: timestamp(), updatedAt: timestamp(),
    scheduledAt, nextRun: scheduledAt, priority, attempts: 0, lease: null, leaseUntil: 0, slot: free,
    trendId: null, consent: kind === 'pipeline' && input.acceptUnknownCost === true,
    message: 'Väntar på nästa serverkörning.', projectId: null, version: 0
  };
  try {
    await db.transact([
      db.tx.add(JOBS, [{ ...job }]),
      db.tx.update(SLOTS, [{ id: free, record: { jobId: id }, if: { jobId: null } }], { patch: true }),
      db.tx.update(INDEX, [{
        id: owner, record: { version: index.version + 1, history: [id, ...index.history].slice(0, 40), active: [...index.active, id] },
        if: { version: index.version, stopped: false }
      }], { patch: true })
    ]);
    return json(view(job), 201);
  } catch {
    // The caller must retain requestId after uncertain writes; it may replay this exact intent.
    return error('Registreringen kunde inte bekräftas. Försök igen med samma förfrågan för att kontrollera resultatet.', 409);
  }
}
export function createQueue(deps: Dependencies) {
  async function process(id: string, force = false) {
    let job = await readJob(id);
    if (!job || terminal(job.status)) return;
    const index = await ownerIndex(job.owner);
    let state = await deps.stateFor(job.owner);
    const agent = job.stage === 'draft' ? 'creative' : job.source === 'youtube' ? 'youtube' : 'intelligence';
    if (!canClaim(job, Date.now(), index.stopped, state.paused.includes(agent), force)) return;
    // A lease fences old workers. Paid calls additionally have a stable AI receipt in runDraft.
    const lease = crypto.randomUUID();
    const claimed = await patch(job, { status: 'running', lease, leaseUntil: Date.now() + 10 * 60000, message: 'Bearbetar uppgiften på servern.' });
    if (!claimed) return;
    job = claimed;
    try {
      if (job.stage === 'collect') {
        const control = await ownerIndex(job.owner);
        state = await deps.stateFor(job.owner);
        if (control.stopped || state.paused.includes(agent)) {
          await patch(job, { status: 'waiting', lease: null, leaseUntil: 0, message: 'Pausad före datainsamling.' }); return;
        }
        const response = await deps.runCollect(job.owner, { source: job.source });
        if (response.statusCode >= 400) {
          const data = JSON.parse(response.body);
          const message = String(data.error || data.message || 'Datainsamling misslyckades.');
          const attempts = job.attempts + 1;
          if (response.statusCode === 409) {
            await patch(job, { status: 'waiting', lease: null, leaseUntil: 0, nextRun: Date.now() + 5 * 60000, message }); return;
          }
          if (response.statusCode >= 500 && attempts < 3 && !message.includes('ej anslutet')) {
            await patch(job, { status: 'retry', attempts, lease: null, leaseUntil: 0,
              nextRun: Date.now() + retryDelay(attempts) + Math.floor(Math.random() * 30000), message }); return;
          }
          await finish(job, 'failed', message); return;
        }
        if (job.kind === 'collect') { await finish(job, 'complete', 'Källsignaler är hämtade och sparade i Trendradar.'); return; }
        state = await deps.stateFor(job.owner);
        const selected = state.trends.filter(t => t.source === (job!.source === 'hn' ? 'Hacker News' : 'YouTube'))
          .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || b.value - a.value)[0];
        if (!selected) { await finish(job, 'failed', 'Inga källsignaler fanns att skapa manus från.'); return; }
        const next = await patch(job, { stage: 'draft', trendId: selected.id, message: 'Källsignal sparad. Nästa steg: AI-manus.' });
        if (!next) return;
        job = next;
      }
      const control = await ownerIndex(job.owner);
      state = await deps.stateFor(job.owner);
      if (control.stopped || state.paused.includes('creative')) {
        await patch(job, { status: 'waiting', lease: null, leaseUntil: 0, message: 'Väntar före AI-steget. Inget nytt AI-anrop startas.' }); return;
      }
      if (!job.consent || !state.settings.aiTrial) {
        await finish(job, 'cancelled', 'AI-provning är avstängd eller samtycke saknas.'); return;
      }
      // Stable job ID is also the stable AI receipt: recovery never re-buys an uncertain generation.
      const response = await deps.runDraft(job.owner, {
        requestId: job.id, trendId: job.trendId, acceptUnknownCost: job.consent
      }, async () => {
        const current = await readJob(id);
        const control = await ownerIndex(job!.owner);
        return Boolean(current && current.status === 'running' && current.lease === lease && !control.stopped);
      });
      const data = JSON.parse(response.body);
      if (response.statusCode < 400) {
        await finish(job, 'complete', 'AI-manus skapat och sparat. Manuell granskning och MP4-export återstår.', String(data.id));
      } else {
        await finish(job, 'needs_review', String(data.error || data.message || 'AI-steget kräver granskning. Ingen automatisk ny kostnad.'));
      }
    } catch {
      // Network/commit ambiguity: do not claim success. A future lease reclaim reconciles the same IDs.
      const current = await readJob(id);
      if (current && current.lease === lease && current.status === 'running') {
        await patch(current, { message: 'Körningen avbröts. Nästa serverkörning kontrollerar samma kvitto efter låsets utgång.' });
      }
    }
  }
  const routes: RouterRoutes = {
    'GET /api/queue': [requireAuth(), async ctx => {
      const index = await ownerIndex(ctx.user!.userId);
      const ids = [...new Set([...index.active, ...index.history])];
      const jobs = ids.length ? await db.get<QueueJob>(JOBS, ids, { consistent: true }) : [];
      const [heartbeat] = await db.get<{ at: string; errors: number }>('viral_queue_runtime', ['worker']);
      return json({
        stopped: index.stopped,
        jobs: jobs.filter((j): j is QueueJob => Boolean(j && j.owner === ctx.user!.userId)).map(view),
        heartbeat: heartbeat?.at || null, workerErrors: heartbeat?.errors || 0, intervalMinutes: 5,
        currentTime: Date.now()
      });
    }],
    'POST /api/queue': [requireAuth(), async ctx => enqueue(ctx.user!.userId, ctx.body, deps)],
    'POST /api/queue/control': [requireAuth(), async ctx => {
      const input = object(ctx.body);
      if (typeof input.stopped !== 'boolean') return error('Ogiltig inställning.', 400);
      const index = await ownerIndex(ctx.user!.userId);
      const [ok] = await db.tx.update(INDEX, [{ id: ctx.user!.userId,
        record: { stopped: input.stopped, version: index.version + 1 },
        if: { version: index.version }
      }], { patch: true });
      return ok ? json({ stopped: input.stopped }) : error('Samtidig ändring. Försök igen.', 409);
    }],
    'POST /api/queue/:id/cancel': [requireAuth(), async ctx => {
      const job = await readJob(ctx.params.id);
      if (!job || job.owner !== ctx.user!.userId) return error('Uppgiften finns inte.', 404);
      if (terminal(job.status)) return json(view(job));
      if (job.status === 'running') return error('En pågående uppgift kan inte återkallas. Stoppa kön för att hindra nästa steg.', 409);
      const cancelled = await finish(job, 'cancelled', 'Avbruten av användaren.');
      return cancelled ? json({ ok: true }) : error('Uppgiften ändrades samtidigt. Uppdatera kön.', 409);
    }],
    'POST /api/queue/:id/run': [requireAuth(), async ctx => {
      const job = await readJob(ctx.params.id);
      if (!job || job.owner !== ctx.user!.userId) return error('Uppgiften finns inte.', 404);
      await process(job.id, true);
      const current = await readJob(job.id);
      return json(current ? view(current) : null);
    }]
  };
  async function tick() {
    const slots = await db.get<{ jobId: string | null }>(SLOTS, SLOT_IDS, { consistent: true });
    const ids = slots.flatMap(slot => slot?.jobId ? [slot.jobId] : []);
    const jobs = ids.length ? await db.get<QueueJob>(JOBS, ids, { consistent: true }) : [];
    const eligible = [];
    for (const job of jobs) {
      if (!job || terminal(job.status)) continue;
      const index = await ownerIndex(job.owner);
      const state = await deps.stateFor(job.owner);
      const agent = job.stage === 'draft' ? 'creative' : job.source === 'youtube' ? 'youtube' : 'intelligence';
      if (canClaim(job, Date.now(), index.stopped, state.paused.includes(agent))) eligible.push(job);
    }
    eligible.sort((a, b) => b.priority - a.priority || a.nextRun - b.nextRun);
    // Only two small, explicitly requested jobs per tick; no self-generating AI loop.
    const results = await Promise.allSettled(eligible.slice(0, 2).map(job => process(job.id)));
    await db.tx.update('viral_queue_runtime', [{
      id: 'worker', record: { at: timestamp(), errors: results.filter(r => r.status === 'rejected').length }
    }]);
    return { statusCode: 200 };
  }
  return { routes, tick };
}
