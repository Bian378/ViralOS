import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

function lines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const result: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      result.push(current);
      current = word;
    } else current = test;
  }
  if (current) result.push(current);
  return result;
}
function scenesFor(script: string) {
  const words = script.trim().split(/\s+/);
  if (words.length < 5 || words.length > 180)
    throw new Error('Använd 5–180 ord för en tydlig kortvideo.');
  const scenes: string[] = [];
  for (const paragraph of script.split(/\n+/).filter(s => s.trim())) {
    const part = paragraph.split(/\s+/);
    for (let i = 0; i < part.length; i += 18)
      scenes.push(part.slice(i, i + 18).join(' '));
  }
  if (scenes.length > 12)
    throw new Error('Högst 12 scener. Slå ihop eller korta manusets stycken.');
  return scenes;
}
export async function renderMP4(
  script: string,
  onProgress: (value: number) => void
) {
  if (typeof VideoEncoder === 'undefined')
    throw new Error(
      'MP4-kodning saknas i webbläsaren. Använd en uppdaterad Chrome eller Edge på dator.'
    );
  const config: VideoEncoderConfig = {
    codec: 'avc1.420028',
    width: 1080,
    height: 1920,
    bitrate: 3500000,
    framerate: 24,
    avc: { format: 'avc' },
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported)
    throw new Error(
      'Den här enheten stöder inte H.264 i 1080 × 1920. Prova Chrome eller Edge på dator.'
    );
  const scenes = scenesFor(script);
  const duration = Math.max(15, Math.min(45, scenes.length * 5));
  const frames = duration * 24;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kunde inte skapa renderingsyta.');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: 1080, height: 1920 },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let encodingError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: e => {
      encodingError = e;
    },
  });
  encoder.configure(config);
  try {
    for (let frameNumber = 0; frameNumber < frames; frameNumber++) {
      if (encodingError) throw encodingError;
      const time = frameNumber / 24;
      const position = (time / duration) * scenes.length;
      const sceneIndex = Math.min(scenes.length - 1, Math.floor(position));
      const progress = position - sceneIndex;
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1920);
      gradient.addColorStop(0, '#0a1925');
      gradient.addColorStop(1, '#080a12');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.save();
      ctx.translate(
        540 + Math.sin(time / 3) * 120,
        650 + Math.cos(time / 4) * 170
      );
      for (let r = 220; r < 900; r += 150) {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(95,239,192,0.08)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#69e5b2';
      ctx.fillRect(100, 320, 60, 6);
      ctx.font = '500 27px sans-serif';
      ctx.fillText(
        String(sceneIndex + 1).padStart(2, '0') +
          ' / ' +
          String(scenes.length).padStart(2, '0'),
        100,
        390
      );
      ctx.globalAlpha = Math.min(1, progress * 8 + 0.15);
      ctx.fillStyle = '#f4f7fa';
      ctx.font = 'bold 70px sans-serif';
      const wrapped = lines(ctx, scenes[sceneIndex], 850);
      const top =
        860 - wrapped.length * 45 + (1 - Math.min(1, progress * 6)) * 30;
      wrapped.forEach((line, i) => ctx.fillText(line, 100, top + i * 92));
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1e3340';
      ctx.fillRect(100, 1570, 880, 5);
      ctx.fillStyle = '#69e5b2';
      ctx.fillRect(100, 1570, (880 * time) / duration, 5);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1000000),
        duration: Math.round(1000000 / 24),
      });
      encoder.encode(frame, { keyFrame: frameNumber % 48 === 0 });
      frame.close();
      if (frameNumber % 24 === 0) {
        onProgress(Math.round((frameNumber / frames) * 95));
        await encoder.flush();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    await encoder.flush();
    if (encodingError) throw encodingError;
    muxer.finalize();
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    if (blob.size < 1000) throw new Error('Videofilen är ofullständig.');
    onProgress(98);
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const video = document.createElement('video');
        const timer = setTimeout(
          () => reject(new Error('Kunde inte verifiera MP4-filen.')),
          10000
        );
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          if (
            video.videoWidth === 1080 &&
            video.videoHeight === 1920 &&
            Math.abs(video.duration - duration) < 1
          )
            resolve();
          else reject(new Error('Videons mått eller längd stämmer inte.'));
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('MP4-filen kunde inte spelas upp.'));
        };
        video.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    onProgress(100);
    return { blob, url, duration, bytes: blob.size };
  } finally {
    encoder.close();
  }
}
