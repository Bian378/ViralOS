/**
 * Opt-in hourly YouTube signals; no TTS, model calls or publication.
 * One official videos.list mostPopular request per enabled owner per UTC hour.
 * Owner count bounded to 3 to cap total expected API reads at 72 per day.
 */
import { db, json, error, requireAuth, isAppDatabaseError, type RouterResponse, type RouterRoutes } from '@appdeploy/sdk';

const OWNERS = 'viral_auto_trend_owners';
const INDEX = 'viral_auto_trend_index';
const MAX_OWNERS = 3;

type ActiveIndex = { id: 'active'; version: number; owners: string[] };
type Preference = {
  id: string;
  version: number;
  enabled: boolean;
  lastBucket: string;
  lastAttempt: string | null;
  lastSuccess: string | null;
  lastCount: number;
  lastError: string | null;
  cooldownUntil: string | null;
};
type Dependencies = {
  runCollect(owner: string, body: unknown): Promise<RouterResponse>;
  stateFor(owner: string): Promise<{ paused: string[] }>;
};
const initial = (owner: string): Preference => ({
  id: owner, version: 0, enabled: false, lastBucket: '',
  lastAttempt: null, lastSuccess: null, lastCount: 0,
  lastError: null, cooldownUntil: null,
});
async function readOwner(owner: string) {
  const [row] = await db.get<Preference>(OWNERS, [owner], { consistent: true });
  return row && row.id === owner ? row : null;
}
async function readIndex() {
  const [row] = await db.get<ActiveIndex>(INDEX, ['active'], { consistent: true });
  if (row && (!Array.isArray(row.owners) || row.owners.length > MAX_OWNERS ||
              row.owners.some(id => typeof id !== 'string'))) {
    throw Error('Invalid scheduler index.');
  }
  return row;
}
async function ensureOwner(owner: string) {
  let row = await readOwner(owner);
  if (row) return row;
  await db.tx.add(OWNERS, [initial(owner)]);
  row = await readOwner(owner);
  if (!row) throw Error('Unable to initialize trend preferences.');
  return row;
}
async function ensureIndex() {
  let row = await readIndex();
  if (row) return row;
  await db.tx.add(INDEX, [{ id: 'active', version: 0, owners: [] }]);
  row = await readIndex();
  if (!row) throw Error('Unable to initialize scheduler index.');
  return row;
}
const format = (row: Preference | null) => ({
  enabled: Boolean(row?.enabled),
  intervalMinutes: 60,
  lastAttempt: row?.lastAttempt || null,
  lastSuccess: row?.lastSuccess || null,
  lastCount: row?.lastCount || 0,
  lastError: row?.lastError || null,
  cooldownUntil: row?.cooldownUntil || null,
  scansAutomaticallyProduceVideos: false,
  publishesAutomatically: false,
});
function knownConflict(e: unknown) {
  return isAppDatabaseError(e) && ['AppDatabaseConflict', 'AppDatabaseConditionFailed'].includes(e.code);
}

export function createAutoTrendCollector(deps: Dependencies) {
  const routes: RouterRoutes = {
    'GET /api/auto-trends': [requireAuth(), async ctx => {
      try {
        return json(format(await readOwner(ctx.user!.userId)));
      } catch {
        return error('Kunde inte läsa status för automatisk insamling.', 503);
      }
    }],
    'POST /api/auto-trends': [requireAuth(), async ctx => {
      const body = ctx.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          typeof (body as { enabled?: unknown }).enabled !== 'boolean') {
        return error('Ange explicit på eller av för YouTube-insamling.', 400);
      }
      const enabled = (body as { enabled: boolean }).enabled;
      const owner = ctx.user!.userId;
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          const row = await ensureOwner(owner);
          const index = await ensureIndex();
          if (row.enabled === enabled && index.owners.includes(owner) === enabled) {
            return json(format(row));
          }
          const owners = index.owners.filter(id => id !== owner);
          if (enabled) {
            if (owners.length >= MAX_OWNERS) return error('Automatisk radar är full för denna app.', 409);
            owners.push(owner);
          }
          try {
            await db.transact([
              db.tx.update(OWNERS, [{
                id: owner, record: { enabled, version: row.version + 1, cooldownUntil: enabled ? row.cooldownUntil : null },
                if: { version: row.version, enabled: row.enabled },
              }], { patch: true }),
              db.tx.update(INDEX, [{
                id: 'active', record: { owners, version: index.version + 1 },
                if: { version: index.version },
              }], { patch: true }),
            ]);
            return json(format({ ...row, enabled, version: row.version + 1 }));
          } catch (e) {
            if (knownConflict(e)) continue;
            // Unknown DB commit outcome must be re-read, never blindly repeated.
            const actual = await readOwner(owner);
            const after = await readIndex();
            if (actual && actual.enabled === enabled && after?.owners.includes(owner) === enabled) {
              return json(format(actual));
            }
            return error('Status kan inte bekräftas. Uppdatera innan du försöker igen.', 503);
          }
        }
        return error('Inställningen ändrades samtidigt. Uppdatera och försök igen.', 409);
      } catch {
        return error('Automatisk insamling kunde inte sparas.', 503);
      }
    }],
  };

  async function tick() {
    const active = await readIndex();
    if (!active || active.owners.length === 0) return { statusCode: 200 };
    const now = new Date();
    const bucket = now.toISOString().slice(0, 13);
    for (const owner of active.owners.slice(0, MAX_OWNERS)) {
      try {
        const preference = await readOwner(owner);
        if (!preference?.enabled || preference.lastBucket === bucket ||
            (preference.cooldownUntil && Date.parse(preference.cooldownUntil) > now.getTime())) continue;
        const state = await deps.stateFor(owner);
        if (state.paused.includes('youtube')) continue;
        // Single hourly lease in durable DB, claimed BEFORE the API request.
        const [claimed] = await db.tx.update(OWNERS, [{
          id: owner,
          record: { lastBucket: bucket, lastAttempt: now.toISOString(),
                    version: preference.version + 1, lastError: null },
          if: { version: preference.version, enabled: true, lastBucket: preference.lastBucket },
        }], { patch: true });
        if (!claimed) continue;
        const response = await deps.runCollect(owner, { source: 'youtube' });
        const success = response.statusCode < 400;
        let message = '';
        let count = 0;
        try {
          const payload = JSON.parse(response.body) as { error?: string; count?: number };
          message = String(payload.error || '');
          count = success ? Number(payload.count) || 0 : 0;
        } catch {
          message = 'YouTube svarade i ett oväntat format.';
        }
        // Quota or access failures pause new calls until next UTC day.
        const restricted = !success && /\b403\b|\b429\b|quota|kvot/i.test(message);
        const midnight = new Date(now);
        midnight.setUTCHours(24, 0, 0, 0);
        await db.tx.update(OWNERS, [{
          id: owner,
          record: {
            lastSuccess: success ? new Date().toISOString() : preference.lastSuccess,
            lastCount: success ? count : preference.lastCount,
            lastError: success ? null : message.slice(0, 300) || 'Hämtningen misslyckades.',
            cooldownUntil: restricted ? midnight.toISOString() : null,
          },
          if: { lastBucket: bucket, enabled: true },
        }], { patch: true });
      } catch {
        // Fail closed: another scheduled run should not double-charge this hour.
        continue;
      }
    }
    return { statusCode: 200 };
  }
  return { routes, tick };
}
