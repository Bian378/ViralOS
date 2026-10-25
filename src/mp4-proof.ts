/** Independently validate MP4 box structure, actual display size and duration. */
export type Mp4TrackProof = {
  videoTracks: number;
  audioTracks: number;
  displayWidth: number;
  displayHeight: number;
  durationSeconds: number;
  bytes: number;
  sha256: string;
};

type TrackDetails = { kind: string; width: number; height: number };

export async function inspectMp4Tracks(blob: Blob): Promise<Mp4TrackProof> {
  if (blob.type !== 'video/mp4' || blob.size < 1024 ||
      blob.size > 100 * 1048576) {
    throw Error('Testresultatet är inte en MP4-fil med rimlig storlek.');
  }
  const bytes = await blob.arrayBuffer();
  const view = new DataView(bytes);
  const decoder = new TextDecoder('ascii');
  const code = (offset: number) =>
    decoder.decode(new Uint8Array(bytes, offset, 4));
  let movie = false;
  let fileType = false;
  let durationSeconds = NaN;
  const tracks: TrackDetails[] = [];
  const children = new Set(['moov', 'mdia']);

  function walk(start: number, stop: number, depth: number, track?: TrackDetails) {
    if (depth > 6 || start < 0 || stop > bytes.byteLength) {
      throw Error('MP4-strukturen är ogiltig.');
    }
    let offset = start;
    while (offset + 8 <= stop) {
      const length = view.getUint32(offset, false);
      const type = code(offset + 4);
      if (length === 1) throw Error('För stora MP4-boxar stöds inte här.');
      const end = length === 0 ? stop : offset + length;
      if (end <= offset + 7 || end > stop) {
        throw Error('Skadad MP4-container. Exportera igen.');
      }
      if (depth === 0 && type === 'ftyp') fileType = true;
      if (depth === 0 && type === 'moov') movie = true;

      if (type === 'mvhd' && depth === 1) {
        const version = view.getUint8(offset + 8);
        if (![0, 1].includes(version)) throw Error('Okänd MP4-tidskod.');
        const scaleAt = offset + (version === 1 ? 28 : 20);
        const durationAt = offset + (version === 1 ? 32 : 24);
        if (durationAt + (version === 1 ? 8 : 4) > end) {
          throw Error('MP4 saknar fullständig tidsinformation.');
        }
        const timescale = view.getUint32(scaleAt, false);
        const units = version === 1
          ? Number(view.getBigUint64(durationAt, false))
          : view.getUint32(durationAt, false);
        if (timescale > 0 && Number.isSafeInteger(units)) {
          durationSeconds = units / timescale;
        }
      }
      if (track && type === 'tkhd') {
        if (length < 92) throw Error('MP4 saknar videomått.');
        track.width = view.getUint32(end - 8, false) / 65536;
        track.height = view.getUint32(end - 4, false) / 65536;
      }
      if (track && type === 'hdlr' && depth >= 3 && length >= 20) {
        track.kind = code(offset + 16);
      }

      if (type === 'trak' && depth === 1) {
        const child: TrackDetails = { kind: '', width: 0, height: 0 };
        walk(offset + 8, end, depth + 1, child);
        tracks.push(child);
      } else if (children.has(type)) {
        walk(offset + 8, end, depth + 1, track);
      }
      offset = end;
    }
    if (offset !== stop) throw Error('En MP4-box är inte komplett.');
  }

  walk(0, bytes.byteLength, 0);
  const videoTracks = tracks.filter(t => t.kind === 'vide');
  const audioTracks = tracks.filter(t => t.kind === 'soun');
  const video = videoTracks[0];
  if (!fileType || !movie || videoTracks.length !== 1 || audioTracks.length > 1 ||
      !video || !Number.isFinite(video.width) || !Number.isFinite(video.height) ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw Error('MP4 saknar verifierbara bild-, ljud- eller tidsdata.');
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    videoTracks: videoTracks.length,
    audioTracks: audioTracks.length,
    displayWidth: video.width,
    displayHeight: video.height,
    durationSeconds,
    bytes: blob.size,
    sha256: [...hash].map(v => v.toString(16).padStart(2, '0')).join(''),
  };
}
