/** Browser-only narration decoding and AAC encoding. No remote voice service. */
export type Narration = { samples: Float32Array; duration: number };
const RATE = 48000;

export async function prepareNarration(file: File): Promise<Narration> {
  if (file.size < 128 || file.size > 12 * 1048576 ||
      !/\.(wav|mp3|m4a|aac|ogg)$/i.test(file.name)) {
    throw Error('Välj WAV/MP3/M4A/AAC/OGG, högst 12 MiB.');
  }
  if (typeof OfflineAudioContext === 'undefined') {
    throw Error('Webbläsaren saknar stöd för ljudbearbetning.');
  }
  const decoder = new OfflineAudioContext(1, 1, RATE);
  let sound: AudioBuffer;
  try {
    sound = await decoder.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw Error('Kan inte läsa ljudfilen. Testa PCM-WAV eller MP3.');
  }
  if (!Number.isFinite(sound.duration) || sound.duration < 15 ||
      sound.duration > 45) {
    throw Error('Berättarrösten ska vara 15–45 sekunder.');
  }
  const frames = Math.round(sound.duration * RATE);
  const offline = new OfflineAudioContext(1, frames, RATE);
  const source = offline.createBufferSource();
  source.buffer = sound;
  source.connect(offline.destination);
  source.start();
  const result = await offline.startRendering();
  return { samples: new Float32Array(result.getChannelData(0)), duration: result.duration };
}

export async function encodeNarration(
  narration: Narration,
  sink: (chunk: EncodedAudioChunk, meta: EncodedAudioChunkMetadata) => void
) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    throw Error('AAC-ljudkodning saknas på denna enhet.');
  }
  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2', sampleRate: RATE, numberOfChannels: 1, bitrate: 128000,
  };
  if (!(await AudioEncoder.isConfigSupported(config)).supported) {
    throw Error('AAC till MP4 stöds inte i den här webbläsaren. Testa Chrome eller Edge.');
  }
  let count = 0;
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      // Some AAC WebCodecs implementations emit rounded or reordered DTS after
      // flush(). Rebuild a strictly monotonic 1024-sample output timeline.
      // Encoded AAC bytes are NOT changed; this corrects packet timing only.
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      const startUs = Math.round(count * 1024 * 1000000 / RATE);
      const endUs = Math.round((count + 1) * 1024 * 1000000 / RATE);
      const normalized = new EncodedAudioChunk({
        type: chunk.type,
        timestamp: startUs,
        duration: endUs - startUs,
        data,
      });
      count++;
      sink(normalized, meta);
    },
    error: err => { failure = err instanceof Error ? err : Error(String(err)); },
  });
  encoder.configure(config);
  try {
    for (let offset = 0; offset < narration.samples.length; offset += 1024) {
      if (failure) throw failure;
      const frames = Math.min(1024, narration.samples.length - offset);
      const data = new Float32Array(frames);
      data.set(narration.samples.subarray(offset, offset + frames));
      const audio = new AudioData({
        format: 'f32-planar', sampleRate: RATE, numberOfChannels: 1,
        numberOfFrames: frames, timestamp: Math.round(offset * 1000000 / RATE),
        data,
      });
      try { encoder.encode(audio); } finally { audio.close(); }
      if (offset % (1024 * 48) === 0) await encoder.flush();
    }
    await encoder.flush();
    if (failure) throw failure;
    if (!count) throw Error('Ingen AAC-data skapades.');
  } finally {
    encoder.close();
  }
}
