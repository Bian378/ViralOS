/** Browser-local neural voice, intentionally isolated from cloud AI and publishing. */
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const SAMPLE_RATE = 24000;
type Voice = 'af_heart' | 'am_michael' | 'bm_george';
type RawSpeech = { toBlob: () => Blob | Promise<Blob> };
type Model = { generate: (text: string, opt: { voice: Voice; speed: number }) => Promise<RawSpeech> };
let cached: Promise<Model> | null = null;

async function getModel(): Promise<Model> {
  if (!cached) {
    cached = (async () => {
      const { KokoroTTS } = await import('kokoro-js');
      return await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: 'q8',
        device: 'wasm',
      }) as Model;
    })().catch(error => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

export async function synthesizeStory(
  script: string, voice: Voice, progress: (message: string) => void,
): Promise<File> {
  const words = script.trim().split(/\s+/u).filter(Boolean);
  if (words.length < 50 || words.length > 150) {
    throw Error('Använd ett sparat engelskt manus med 50–150 ord.');
  }
  if (!['af_heart', 'am_michael', 'bm_george'].includes(voice)) {
    throw Error('Okänd AI-berättarröst.');
  }
  const parts: string[] = [];
  for (const paragraph of script.split(/\n+/u).map(p => p.trim()).filter(Boolean)) {
    const tokens = paragraph.split(/\s+/u);
    for (let i = 0; i < tokens.length; i += 28) {
      parts.push(tokens.slice(i, i + 28).join(' '));
    }
  }
  if (!parts.length || parts.length > 12) throw Error('För många röstscener.');
  progress('Hämtar Kokoro-röstmodellen, cirka 90 MB första gången.');
  let model: Model;
  try { model = await getModel(); }
  catch { throw Error('Kokoro kunde inte laddas. Kontrollera nätverk/Hugging Face och försök igen.'); }
  const samples: Float32Array[] = [];
  let length = 0;
  const pause = Math.round(SAMPLE_RATE * 0.12);
  for (let i = 0; i < parts.length; i++) {
    progress('AI-rösten läser del ' + (i + 1) + ' av ' + parts.length + '.');
    let blob: Blob;
    try {
      blob = await (await model.generate(parts[i], { voice, speed: 1.22 })).toBlob();
    } catch {
      throw Error('Kunde inte generera tal i del ' + (i + 1) + '. Försök igen.');
    }
    const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.sampleRate !== SAMPLE_RATE || decoded.length < 500) {
      throw Error('AI-rösten returnerade ett ogiltigt WAV-ljud.');
    }
    const channel = new Float32Array(decoded.getChannelData(0));
    samples.push(channel);
    length += channel.length;
    if (length + pause * (samples.length - 1) > 45 * SAMPLE_RATE) {
      throw Error('Berättarrösten överstiger 45 sekunder. Korta manuset och generera igen.');
    }
  }
  const frames = length + pause * (samples.length - 1);
  const seconds = frames / SAMPLE_RATE;
  if (seconds < 15 || seconds > 45) {
    throw Error('Rösten blev ' + seconds.toFixed(1) + ' s. Använd ett manus som ger 15–45 s.');
  }
  const mixed = new Float32Array(frames);
  let offset = 0;
  for (const section of samples) {
    mixed.set(section, offset);
    offset += section.length + pause;
  }
  const output = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(output);
  const tag = (at: number, label: string) => {
    for (let j = 0; j < label.length; j++) view.setUint8(at + j, label.charCodeAt(j));
  };
  tag(0, 'RIFF');
  view.setUint32(4, output.byteLength - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const v = Math.min(1, Math.max(-1, mixed[i]));
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
  }
  progress('AI-röst skapad (' + seconds.toFixed(1) + ' s).');
  return new File([output], 'viralos-kokoro-voice.wav', { type: 'audio/wav' });
}
