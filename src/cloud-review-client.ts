/** Explicit owner-initiated private review upload. No API credentials or publish calls. */
import { api } from '@appdeploy/client';

const PIECE = 40 * 1024;
const LEGACY_PIECE = 256 * 1024;
const MAX = 24 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;

const digest = async (bytes: ArrayBuffer) => {
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...raw].map(n => n.toString(16).padStart(2, '0')).join('');
};
function toBase64(bytes: Uint8Array): string {
  let output = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    output += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(output);
}
export async function uploadLocalReviewDraft(
  video: Blob,
  packet: { video: { sha256: string } },
  onProgress: (n: number) => void
) {
  if (video.size < 1024 || video.size > MAX || !SHA.test(packet.video.sha256)) {
    throw Error('Privat uppladdning stöder MP4-filer mellan 1 kB och 24 MiB.');
  }
  const observed = await digest(await video.arrayBuffer());
  if (observed !== packet.video.sha256) {
    throw Error('Videon ändrades efter att granskningsfilen skapades.');
  }
  const existing = (await api.get('/api/review-uploads/active')).data;
  if (existing?.uploadId && existing.status !== 'receiving') {
    throw Error('Tidigare import måste avbrytas eller återhämtas först under Videostudio.');
  }
  if (existing?.uploadId &&
      (existing.sha256 !== observed || existing.bytes !== video.size)) {
    throw Error('En annan import pågår. Avbryt den tidigare importen i Videostudio först.');
  }
  const uploadId = existing?.uploadId || crypto.randomUUID();
  const begin = (await api.post('/api/review-uploads', {
    uploadId, bytes: video.size, packet,
  })).data;
  if (begin.pieceBytes === LEGACY_PIECE) {
    throw Error('En äldre uppladdning använder för stora videodelar. Avbryt den gamla importen i Videostudio och starta sedan en ny.');
  }
  if (begin.parts !== Math.ceil(video.size / PIECE) || begin.pieceBytes !== PIECE) {
    throw Error('Servern accepterade inte förväntad videostorlek.');
  }
  const done = new Set<number>(begin.alreadyReceived || []);
  for (let n = 0; n < begin.parts; n++) {
    if (!done.has(n)) {
      const slice = new Uint8Array(await video.slice(n * PIECE, (n + 1) * PIECE).arrayBuffer());
      await api.post('/api/review-uploads/' + encodeURIComponent(uploadId) + '/chunk', {
        index: n,
        content: toBase64(slice),
      });
    }
    onProgress(Math.round(((n + 1) / begin.parts) * 95));
  }
  const result = (await api.post('/api/review-uploads/' +
    encodeURIComponent(uploadId) + '/finish', {})).data;
  if (result.uploadAuthorized !== false || result.publishAuthorized !== false ||
      typeof result.reviewId !== 'string') {
    throw Error('Servern returnerade ett osäkert granskningsbesked.');
  }
  onProgress(100);
  return result.reviewId as string;
}

export async function reconcileStoredReviewUpload(): Promise<{
  resolved: boolean;
  status: string;
  reviewId?: string;
  message?: string;
  uploadAuthorized?: false;
  publishAuthorized?: false;
}> {
  const response = (await api.post('/api/review-uploads/active/reconcile', {})).data;
  if (response.resolved === true && (
    typeof response.reviewId !== 'string' ||
    response.uploadAuthorized !== false ||
    response.publishAuthorized !== false
  )) {
    throw Error('Återhämtningen returnerade ett osäkert kvitto.');
  }
  return response;
}

export async function clearIncompleteReviewUpload() {
  return (await api.post('/api/review-uploads/active/cancel', {})).data;
}

export async function retrievePrivateReviewMP4(id: string, expectedSha: string) {
  const info = (await api.get('/api/video-reviews/' +
    encodeURIComponent(id) + '/media-info')).data;
  if (!SHA.test(info.sha256) || info.sha256 !== expectedSha ||
      !Number.isSafeInteger(info.parts) || info.parts < 1 ||
      (info.pieceBytes !== PIECE && info.pieceBytes !== LEGACY_PIECE) ||
      info.parts > Math.ceil(MAX / info.pieceBytes) ||
      info.hasYouTubePermission !== false || info.bytes > MAX) {
    throw Error('Det privata videoindexet klarade inte säkerhetskontrollen.');
  }
  const parts: Uint8Array[] = [];
  for (let i = 0; i < info.parts; i++) {
    const pieceLength = Math.min(info.pieceBytes, info.bytes - i * info.pieceBytes);
    const segments = Math.ceil(pieceLength / PIECE);
    for (let segment = 0; segment < segments; segment++) {
      const piece = (await api.get('/api/video-reviews/' +
        encodeURIComponent(id) + '/media/' + i + '/' + segment)).data;
      const expectedLength = Math.min(PIECE, pieceLength - segment * PIECE);
      if (piece.index !== i || piece.segment !== segment ||
          piece.segmentBytes !== PIECE || piece.hasYouTubePermission !== false ||
          typeof piece.content !== 'string') {
        throw Error('Den lagrade videon kunde inte läsas säkert.');
      }
      const binary = atob(piece.content);
      if (binary.length !== expectedLength) {
        throw Error('En privat videodel hade oväntad längd.');
      }
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      parts.push(bytes);
    }
  }
  const combined = new Blob(parts as BlobPart[], { type: 'video/mp4' });
  if (combined.size !== info.bytes || await digest(await combined.arrayBuffer()) !== expectedSha) {
    throw Error('Den privata videon matchar inte originalfilens SHA-256.');
  }
  return URL.createObjectURL(combined);
}
