/** Authenticated, content-addressed, bounded private review MP4 upload.
 * Storage receives individually hashed binary chunks, never an authorization.
 * Server verifies all stored bytes before creating a review inbox item.
 * No YouTube integration or public media URL is available in these routes.
 */
import { db, json, error, requireAuth, storage } from '@appdeploy/sdk';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { validateLocalReviewPacketForUpload, type SafeReviewItem } from '../src/review-inbox';
import { trustedAddStoredReview } from './review-routes';

const TABLE = 'viral_review_upload_sessions';
const SLOT = 'viral_review_upload_active';
const REVIEW = 'viral_review_inbox_items';
const PIECE = 40 * 1024;
const LEGACY_PIECE = 256 * 1024;
const MAX_VIDEO = 24 * 1024 * 1024;
const MAX_PARTS = Math.ceil(MAX_VIDEO / PIECE);
const LIMIT_TIME = 60 * 60 * 1000;
const IDENTIFIER = /^[A-Za-z0-9_-]{10,128}$/;
const SHA = /^[0-9a-f]{64}$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

type StoredSession = {
  id: string;
  ownerId: string;
  status: 'receiving' | 'finalizing' | 'done' | 'cancelled' | 'failed';
  version: number;
  packet: Record<string, unknown>;
  sha: string;
  bytes: number;
  parts: number;
  pieceBytes?: number; // absent only in previously created 256 KiB sessions
  hashes: Record<string, string>;
  createdAt: string;
  expiresAt: number;
};
type Active = { id: string; uploadId: string | null; expiresAt: number; version: number };
const dict = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const pathFor = (s: StoredSession, n: number, hash: string) =>
  'private-reviews/' + encodeURIComponent(s.ownerId) + '/' + s.id + '/' +
  String(n).padStart(3, '0') + '-' + hash + '.part';
const partSize = (s: StoredSession) => s.pieceBytes ?? LEGACY_PIECE;
const totalPartBytes = (s: StoredSession, n: number) =>
  Math.min(partSize(s), s.bytes - n * partSize(s));

async function readSession(owner: string, id: unknown): Promise<StoredSession | null> {
  if (typeof id !== 'string' || !IDENTIFIER.test(id)) return null;
  const [value] = await db.get<StoredSession>(TABLE, [id], { consistent: true });
  return value && value.id === id && value.ownerId === owner ? value : null;
}
async function usable(owner: string, id: unknown) {
  const session = await readSession(owner, id);
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}
async function matchingReview(owner: string, id: string, s: StoredSession) {
  const [item] = await db.get<SafeReviewItem>(REVIEW, [id], { consistent: true });
  if (!item || item.id !== id || item.ownerId !== owner ||
      item.kind !== 'viralos-server-review-inbox-item' ||
      item.video.storedSha256 !== s.sha) return null;
  return item;
}
async function ownerReview(owner: string, id: string, s: StoredSession) {
  return s.status === 'done' ? matchingReview(owner, id, s) : null;
}
async function readPiece(s: StoredSession, n: number): Promise<Uint8Array> {
  const hash = s.hashes[String(n)];
  if (!hash || !SHA.test(hash)) throw Error('Stored media piece is missing.');
  const path = pathFor(s, n, hash);
  const [item] = await storage.read([path]);
  if (!item || typeof item.content !== 'string' || !B64.test(item.content)) {
    throw Error('Private file could not be read securely.');
  }
  const bytes = Buffer.from(item.content, 'base64');
  if (bytes.byteLength !== totalPartBytes(s, n) || sha256(bytes) !== hash) {
    throw Error('Private media piece failed independent verification.');
  }
  return bytes;
}
async function * privateBytes(s: StoredSession): AsyncIterable<Uint8Array> {
  for (let i = 0; i < s.parts; i++) yield await readPiece(s, i);
}
async function releaseSlot(owner: string, id: string) {
  const [current] = await db.get<Active>(SLOT, [owner], { consistent: true });
  if (current && current.uploadId === id) {
    const [released] = await db.tx.update(SLOT, [{
      id: owner,
      record: { version: current.version + 1, uploadId: null, expiresAt: 0 },
      if: { version: current.version, uploadId: id },
    }], { patch: true });
    if (!released) {
      const [latest] = await db.get<Active>(SLOT, [owner], { consistent: true });
      if (latest?.uploadId === id) throw Error('Could not release finalized upload slot.');
    }
  }
}

/**
 * Repair ONLY an existing, independently verified, durable review receipt.
 * Never rerun a possibly committed media import after an unknown outcome.
 */
async function reconcileCommittedReview(owner: string, session: StoredSession) {
  if (session.status !== 'finalizing' && session.status !== 'done') return null;
  const review = await matchingReview(owner, session.id, session);
  if (!review) return null;
  if (session.status === 'finalizing') {
    const [ok] = await db.tx.update(TABLE, [{
      id: session.id,
      record: { status: 'done', version: session.version + 1 },
      if: { ownerId: owner, status: 'finalizing', version: session.version },
    }], { patch: true });
    if (!ok) {
      const fresh = await readSession(owner, session.id);
      if (!fresh || fresh.status !== 'done') {
        throw Error('Receipt exists but session finalization is not confirmed.');
      }
    }
  }
  await releaseSlot(owner, session.id);
  return review;
}

export function createPrivateReviewUploadRoutes() {
  return {
    'POST /api/review-uploads': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const data = dict(ctx.body);
      const id = data.uploadId;
      const bytes = data.bytes;
      try {
        if (typeof id !== 'string' || !IDENTIFIER.test(id) ||
            !Number.isSafeInteger(bytes) || (bytes as number) < 1024 ||
            (bytes as number) > MAX_VIDEO) {
          return error('Välj en MP4 på högst 24 MiB och ett stabilt import-ID.', 400);
        }
        const packet = validateLocalReviewPacketForUpload(data.packet);
        const sha = dict(packet.video).sha256;
        if (typeof sha !== 'string' || !SHA.test(sha)) return error('Ogiltig MP4-kontrollsumma.', 400);
        const previous = await readSession(owner, id);
        if (previous) {
          if (previous.bytes !== bytes || previous.sha !== sha ||
              JSON.stringify(previous.packet) !== JSON.stringify(packet)) {
            return error('Import-ID tillhör en annan videofil.', 409);
          }
          return previous.status === 'receiving' && previous.expiresAt > Date.now()
            ? json({ uploadId: id, parts: previous.parts, pieceBytes: partSize(previous),
                     alreadyReceived: Object.keys(previous.hashes).map(Number) })
            : error('Importen kan inte återstartas. Kontrollera granskningskön.', 409);
        }
        const [existingReviewIndex] = await db.get<{ items: string[] }>(
          'viral_review_inbox_owner_index', [owner], { consistent: true }
        );
        if (existingReviewIndex && (!Array.isArray(existingReviewIndex.items) ||
          existingReviewIndex.items.length >= 30)) {
          return error('Granskningskön är full. Inga fler MP4-filer lagras.', 409);
        }
        const [active] = await db.get<Active>(SLOT, [owner], { consistent: true });
        if (active?.uploadId) {
          const older = await readSession(owner, active.uploadId);
          if (older && ['receiving', 'finalizing', 'done'].includes(older.status)) {
            return error(
              older.status === 'receiving'
                ? 'En tidigare import finns kvar. Avbryt den i Videostudio först.'
                : 'En tidigare verifiering behöver återhämtas. Klicka Kontrollera avbruten slutverifiering i Videostudio.',
              409
            );
          }
          if (active.expiresAt > Date.now()) {
            return error('En tidigare videoimport håller fortfarande platsen.', 409);
          }
        }
        const session: StoredSession = {
          id, ownerId: owner, status: 'receiving', version: 1,
          packet, sha, bytes: bytes as number,
          parts: Math.ceil((bytes as number) / PIECE), pieceBytes: PIECE, hashes: {},
          createdAt: new Date().toISOString(), expiresAt: Date.now() + LIMIT_TIME,
        };
        if (session.parts > MAX_PARTS) return error('För många videodelar.', 400);
        const slotNext: Active = {
          id: owner, version: (active?.version || 0) + 1,
          uploadId: id, expiresAt: session.expiresAt,
        };
        try {
          await db.transact([
            db.tx.add(TABLE, [session]),
            active
              ? db.tx.update(SLOT, [{
                  id: owner, record: slotNext,
                  if: { version: active.version, uploadId: active.uploadId },
                }], { patch: true })
              : db.tx.add(SLOT, [slotNext]),
          ]);
        } catch {
          const saved = await readSession(owner, id);
          if (!saved || saved.sha !== sha || saved.bytes !== bytes) {
            return error('Importens reservation kunde inte bekräftas. Försök med samma videofil.', 409);
          }
        }
        return json({ uploadId: id, parts: session.parts, pieceBytes: PIECE, alreadyReceived: [] }, 201);
      } catch {
        return error('Videounderlaget uppfyller inte säkerhetskraven för privat import.', 400);
      }
    }],
    'GET /api/review-uploads/active': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const [active] = await db.get<Active>(SLOT, [owner], { consistent: true });
      const session = active?.uploadId ? await readSession(owner, active.uploadId) : null;
      return json(session && ['receiving', 'finalizing', 'done'].includes(session.status) ? {
        uploadId: session.id, sha256: session.sha, bytes: session.bytes,
        status: session.status === 'receiving' && session.expiresAt <= Date.now()
          ? 'expired' : session.status,
        alreadyReceived: Object.keys(session.hashes).map(Number),
      } : { uploadId: null, status: 'none' });
    }],
    'POST /api/review-uploads/active/reconcile': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      try {
        const [active] = await db.get<Active>(SLOT, [owner], { consistent: true });
        if (!active?.uploadId) return json({ resolved: false, status: 'none' });
        const session = await readSession(owner, active.uploadId);
        if (!session) return error('Importens status kunde inte läsas säkert.', 503);
        if (session.status === 'finalizing' || session.status === 'done') {
          const review = await reconcileCommittedReview(owner, session);
          if (review) {
            return json({ resolved: true, status: 'done', reviewId: review.id,
              uploadAuthorized: false, publishAuthorized: false });
          }
          return json({ resolved: false, status: 'unconfirmed',
            message: 'Slutkontrollen är ännu inte bekräftad. Ingen ny import eller publicering startas.' });
        }
        if (session.status === 'receiving') {
          return json({ resolved: false, status: 'receiving',
            message: 'Importen är inte färdig. Fortsätt med exakt samma fil eller avbryt den.' });
        }
        await releaseSlot(owner, session.id);
        return json({ resolved: false, status: session.status });
      } catch {
        return error('Återhämtningen kunde inte bekräftas. Försök igen senare.', 503);
      }
    }],
    'POST /api/review-uploads/active/cancel': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const [active] = await db.get<Active>(SLOT, [owner], { consistent: true });
      if (!active?.uploadId) return json({ cancelled: false });
      const s = await readSession(owner, active.uploadId);
      if (s?.status === 'finalizing') return error('Verifiering pågår. Ingen avbrytning kan göras nu.', 409);
      if (s?.status === 'receiving') {
        const [updated] = await db.tx.update(TABLE, [{
          id: s.id, record: { status: 'cancelled', version: s.version + 1 },
          if: { version: s.version, ownerId: owner, status: 'receiving' },
        }], { patch: true });
        if (!updated) return error('Importen ändrades samtidigt. Uppdatera.', 409);
      }
      await releaseSlot(owner, active.uploadId);
      if (s?.status === 'receiving') {
        const paths = Object.entries(s.hashes).map(([part, hash]) =>
          pathFor(s, Number(part), hash)
        );
        if (paths.length) {
          try { await storage.delete(paths); }
          catch { /* fail closed: cancelled import is never reusable */ }
        }
      }
      return json({ cancelled: true });
    }],
    'POST /api/review-uploads/:id/chunk': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const s = await usable(owner, ctx.params.id);
      if (!s || s.status !== 'receiving') return error('Importen finns inte eller är stängd.', 409);
      const input = dict(ctx.body);
      const n = input.index;
      const data = input.content;
      if (!Number.isSafeInteger(n) || (n as number) < 0 ||
          (n as number) >= s.parts || typeof data !== 'string' ||
          data.length > 4 * Math.ceil(partSize(s) / 3) + 4 || !B64.test(data)) {
        return error('Felaktig videodel.', 400);
      }
      const bytes = Buffer.from(data, 'base64');
      if (bytes.byteLength !== totalPartBytes(s, n as number) ||
          bytes.toString('base64') !== data) return error('Videodelens storlek är fel.', 400);
      const hash = sha256(bytes);
      const prior = s.hashes[String(n)];
      if (prior) return prior === hash
        ? json({ index: n, stored: true })
        : error('Denna videodel hör till en annan fil.', 409);
      const [stored] = await storage.write([{
        path: pathFor(s, n as number, hash),
        content: data,
        contentType: 'application/octet-stream',
      }]);
      if (!stored) return error('Kunde inte lagra videodelen.', 503);
      const [saved] = await db.tx.update(TABLE, [{
        id: s.id,
        record: { hashes: { ...s.hashes, [String(n)]: hash }, version: s.version + 1 },
        if: { version: s.version, ownerId: owner, status: 'receiving' },
      }], { patch: true });
      if (saved) return json({ index: n, stored: true });
      const latest = await readSession(owner, s.id);
      return latest?.hashes[String(n)] === hash ? json({ index: n, stored: true })
        : error('Videodelen ändrades samtidigt. Försök igen.', 409);
    }],
    'POST /api/review-uploads/:id/finish': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const s = await readSession(owner, ctx.params.id);
      if (!s) return error('Importen finns inte på detta konto.', 404);
      if (s.status === 'finalizing' || s.status === 'done') {
        try {
          const settled = await reconcileCommittedReview(owner, s);
          return settled
            ? json({ reviewId: settled.id, state: settled.state,
                uploadAuthorized: false, publishAuthorized: false })
            : error('Slutkontrollen har ännu inget verifierat kvitto. Inget nytt importförsök startades.', 409);
        } catch {
          return error('Ett verifierat kvitto finns men återhämtningen kunde inte slutföras.', 503);
        }
      }
      if (s.status !== 'receiving' || s.expiresAt <= Date.now()) {
        return error('Importen är stängd eller har löpt ut.', 409);
      }
      if (Object.keys(s.hashes).length !== s.parts ||
          Array.from({ length: s.parts }, (_, i) => i)
            .some(i => !SHA.test(s.hashes[String(i)] || ''))) {
        return error('Samtliga videodelar måste lagras före kontrollen.', 409);
      }
      const [claimed] = await db.tx.update(TABLE, [{
        id: s.id, record: { status: 'finalizing', version: s.version + 1 },
        if: { ownerId: owner, status: 'receiving', version: s.version },
      }], { patch: true });
      if (!claimed) return error('Verifieringen är redan påbörjad eller ändrad.', 409);
      try {
        const review = await trustedAddStoredReview(s.packet, {
          authenticatedOwnerId: owner, queueId: s.id, storedMp4Sha256: s.sha,
          exactByteVerificationPassed: true, importedAt: new Date().toISOString(),
        }, () => privateBytes(s));
        const finalizing = await readSession(owner, s.id);
        const settled = finalizing && await reconcileCommittedReview(owner, finalizing);
        if (!settled || settled.id !== review.id) {
          throw Error('The durable verified media receipt could not be reconciled.');
        }
        return json({ reviewId: settled.id, state: settled.state,
          uploadAuthorized: false, publishAuthorized: false });
      } catch {
        // A response or DB commit may have been lost after the verified review
        // was already stored. Only reconcile the SAME signed-in owner receipt.
        try {
          const current = await readSession(owner, s.id);
          const settled = current && await reconcileCommittedReview(owner, current);
          if (settled) {
            return json({ reviewId: settled.id, state: settled.state,
              uploadAuthorized: false, publishAuthorized: false });
          }
        } catch { /* no duplicate import; leave the slot locked for owner recovery */ }
        return error('Slutkontrollen är osäker. Använd Kontrollera avbruten slutverifiering; skapa ingen ny import.', 503);
      }
    }],
    'GET /api/video-reviews/:id/media-info': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const s = await readSession(owner, ctx.params.id);
      if (!s || !(await ownerReview(owner, s.id, s))) return error('Privat video hittades inte.', 404);
      return json({ parts: s.parts, bytes: s.bytes, sha256: s.sha, pieceBytes: partSize(s),
        hasYouTubePermission: false });
    }],
    // Small authenticated read segments also support legacy 256 KiB stored pieces.
    // Each response stays below the AppDeploy JSON body budget.
    'GET /api/video-reviews/:id/media/:index/:segment': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const s = await readSession(owner, ctx.params.id);
      if (!s || !(await ownerReview(owner, s.id, s))) return error('Privat video hittades inte.', 404);
      const n = Number(ctx.params.index);
      const segment = Number(ctx.params.segment);
      if (!Number.isSafeInteger(n) || n < 0 || n >= s.parts ||
          !Number.isSafeInteger(segment) || segment < 0 ||
          segment >= Math.ceil(totalPartBytes(s, n) / PIECE)) {
        return error('Ogiltig videodel.', 400);
      }
      try {
        const bytes = await readPiece(s, n);
        return json({
          index: n, segment, segmentBytes: PIECE,
          content: Buffer.from(bytes.subarray(segment * PIECE, (segment + 1) * PIECE)).toString('base64'),
          hasYouTubePermission: false,
        });
      } catch {
        return error('Den lagrade videodelen kan inte verifieras.', 503);
      }
    }],
    'GET /api/video-reviews/:id/media/:index': [requireAuth(), async ctx => {
      const owner = ctx.user!.userId;
      const s = await readSession(owner, ctx.params.id);
      if (!s || !(await ownerReview(owner, s.id, s))) return error('Privat video hittades inte.', 404);
      const n = Number(ctx.params.index);
      if (!Number.isSafeInteger(n) || n < 0 || n >= s.parts) return error('Ogiltig videodel.', 400);
      try {
        const bytes = await readPiece(s, n);
        return json({ index: n, content: Buffer.from(bytes).toString('base64') });
      } catch {
        return error('Den lagrade videodelen kan inte verifieras.', 503);
      }
    }],
  };
}
