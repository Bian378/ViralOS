/** Validate the ISO BMFF container's track types after WebCodecs muxing. */
export type Mp4TrackProof = {
  videoTracks: number;
  audioTracks: number;
  bytes: number;
  sha256: string;
};
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
  const handlers: string[] = [];
  const children = new Set(['moov', 'trak', 'mdia']);
  function walk(start: number, stop: number, depth: number) {
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
      if (type === 'hdlr' && depth >= 2 && length >= 20) {
        const handler = code(offset + 16);
        if (handler === 'vide' || handler === 'soun') handlers.push(handler);
      }
      if (children.has(type)) walk(offset + 8, end, depth + 1);
      offset = end;
    }
    if (offset !== stop) throw Error('En MP4-box är inte komplett.');
  }
  walk(0, bytes.byteLength, 0);
  const videoTracks = handlers.filter(type => type === 'vide').length;
  const audioTracks = handlers.filter(type => type === 'soun').length;
  if (!fileType || !movie || videoTracks !== 1 || audioTracks > 1) {
    throw Error('MP4 saknar korrekt videospår eller containerdata.');
  }
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    videoTracks, audioTracks, bytes: blob.size,
    sha256: [...hash].map(v => v.toString(16).padStart(2, '0')).join(''),
  };
}
