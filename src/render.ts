import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { prepareNarration, encodeNarration } from './narration-audio';
import { makeVideoTimeline, createRenderedDraftSrt, type VideoStyle } from './video-timeline';
import { drawShortFrame } from './kinetic-scenes';
import { inspectMp4Tracks } from './mp4-proof';

/**
 * Local HTML Canvas/WebCodecs Short production.
 * All displayed timings and subtitle cues match the MP4 frame positions,
 * but do not claim word-level alignment to any narration recording.
 */
export async function renderMP4(
  script: string,
  onProgress: (value: number) => void,
  narrationFile?: File | null,
  style: VideoStyle = 'cinematic'
) {
  if (typeof VideoEncoder === 'undefined') {
    throw Error('Webbläsaren kan inte koda MP4. Använd aktuell Chrome eller Edge på dator.');
  }
  if (style !== 'cinematic' && style !== 'bold') {
    throw Error('Okänd videostil.');
  }
  const config: VideoEncoderConfig = {
    codec: 'avc1.420028',
    width: 1080,
    height: 1920,
    bitrate: 3500000,
    framerate: 30,
    avc: { format: 'avc' },
  };
  if (!(await VideoEncoder.isConfigSupported(config)).supported) {
    throw Error('Enheten stöder inte H.264 1080 × 1920 i 30 FPS.');
  }
  const narration = narrationFile ? await prepareNarration(narrationFile) : null;
  const estimatedCount = script.trim().split(/\s+/u).length;
  const fallbackDuration = Math.max(15, Math.min(45, estimatedCount / 175 * 60));
  const duration = narration ? Math.ceil(narration.duration * 30) / 30 : fallbackDuration;
  const timeline = makeVideoTimeline(script, duration);
  const subtitles = createRenderedDraftSrt(timeline);

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw Error('Videoytan kunde inte startas.');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: 1080, height: 1920, frameRate: 30 },
    ...(narration ? {
      audio: { codec: 'aac' as const, numberOfChannels: 1, sampleRate: 48000 },
    } : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encodingError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
    error: err => { encodingError = err; },
  });
  encoder.configure(config);
  try {
    for (let index = 0; index < timeline.frames; index++) {
      if (encodingError) throw encodingError;
      drawShortFrame(context, timeline, index, style);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(index * 1000000 / 30),
        duration: Math.round(1000000 / 30),
      });
      try {
        encoder.encode(frame, { keyFrame: index % 60 === 0 });
      } finally {
        frame.close();
      }
      if (index % 30 === 0) {
        onProgress(Math.round(index / timeline.frames * 95));
        await encoder.flush();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    await encoder.flush();
    if (encodingError) throw encodingError;
    if (narration) {
      await encodeNarration(narration, (chunk, metadata) => muxer.addAudioChunk(chunk, metadata));
    }
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    if (blob.size < 1024) throw Error('Videofilen är ofullständig.');
    onProgress(97);
    const mp4Proof = await inspectMp4Tracks(blob);
    if (mp4Proof.videoTracks !== 1 || mp4Proof.audioTracks !== (narration ? 1 : 0) ||
        Math.abs(mp4Proof.displayWidth - 1080) > 0.5 ||
        Math.abs(mp4Proof.displayHeight - 1920) > 0.5 ||
        Math.abs(mp4Proof.durationSeconds - timeline.duration) > 0.25) {
      throw Error('MP4-containerns verifierade värden stämmer inte (förväntat ' +
        timeline.duration.toFixed(2) + ' s, faktiskt ' +
        Math.round(mp4Proof.displayWidth) + ' × ' + Math.round(mp4Proof.displayHeight) +
        ', ' + mp4Proof.durationSeconds.toFixed(2) + ' s, ' +
        mp4Proof.videoTracks + ' bildspår och ' + mp4Proof.audioTracks + ' ljudspår.');
    }
    onProgress(98);
    const url = URL.createObjectURL(blob);
    try {
      // Some browsers report padded H.264 codec dimensions (1088 rather than
      // 1080) or transient metadata values before the first frame is decoded.
      // Validate the file's actual tkhd/mvhd fields above; wait for decoded
      // video data instead of rejecting prematurely on loadedmetadata.
      await new Promise<void>((resolve, reject) => {
        const element = document.createElement('video');
        let finished = false;
        const timeout = window.setTimeout(() => {
          complete(Error('Videon kunde inte avkodas i webbläsaren inom 20 sekunder.'));
        }, 20000);
        const complete = (problem?: Error) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timeout);
          element.onloadeddata = null;
          element.onerror = null;
          element.removeAttribute('src');
          element.load();
          problem ? reject(problem) : resolve();
        };
        element.preload = 'auto';
        element.muted = true;
        element.playsInline = true;
        element.onloadeddata = () => {
          const w = element.videoWidth;
          const h = element.videoHeight;
          const browserSeconds = element.duration;
          // Permit only the 8px H.264 macroblock padding of an otherwise
          // independently verified 1080-wide portrait movie.
          const dimensionsOk = (w === 1080 || w === 1088) && h === 1920;
          const secondsOk = Number.isFinite(browserSeconds) &&
            Math.abs(browserSeconds - mp4Proof.durationSeconds) <= 1.5;
          if (!dimensionsOk || !secondsOk) {
            complete(Error('Videon kunde avkodas men webbläsaren rapporterade ' +
              w + ' × ' + h + ', ' +
              (Number.isFinite(browserSeconds) ? browserSeconds.toFixed(2) : String(browserSeconds)) +
              ' s. MP4-filen innehåller ' + Math.round(mp4Proof.displayWidth) +
              ' × ' + Math.round(mp4Proof.displayHeight) + ', ' +
              mp4Proof.durationSeconds.toFixed(2) + ' s.'));
          } else {
            complete();
          }
        };
        element.onerror = () => complete(Error('Videofilen gick inte att avkoda i webbläsaren.'));
        element.src = url;
        element.load();
      });
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
    onProgress(100);
    return {
      blob, url, duration: timeline.duration, bytes: blob.size,
      withNarration: Boolean(narration),
      mp4Proof,
      style,
      subtitles,
      scenes: timeline.scenes.length,
      captionsEstimated: true as const,
    };
  } finally {
    encoder.close();
  }
}
