/**
 * Explicit, local MP4+AAC test. The demo audio is a synthetic tone,
 * NOT an AI voice and not a transcription of the on-screen words.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, ShieldCheck, TestTube2 } from 'lucide-react';
import { renderMP4 } from './render';
import { inspectMp4Tracks, type Mp4TrackProof } from './mp4-proof';
import { buildLocalReviewPacket } from './local-review-packet';
import type { VideoStyle } from './video-timeline';

const DEMO_TITLE = 'A tiny experiment in creative focus';
const DEMO_SCRIPT = [
  'Could one small change spark creativity?',
  'Imagine a creator staring at a blank screen, convinced the next idea has to be enormous. Instead, the creator picks one ordinary detail and asks a strange question about it.',
  'A quiet room becomes a mystery. A familiar sound becomes a pattern. The important part is not that the question has a perfect answer, but that it begins a story.',
  'Now the creator turns that simple thought into five short scenes, adds a bold opening line, and gives every idea just enough space to be understood.',
  'There is no magic formula and no promise of going viral. This is only a small demonstration of how a beginning, a few connected moments, and a clear ending can become a Short.',
].join('\n\n');
type Result = {
  url: string;
  blob: Blob;
  proof: Mp4TrackProof;
  seconds: number;
  scenes: number;
  srt: string;
  packetValid: boolean;
};
const SAMPLE_SECONDS = 21;

function demoTone(): File {
  // A low-volume, pulsing, original 440Hz sine wave, 24kHz mono PCM16 WAV.
  const sampleRate = 24000;
  const frames = SAMPLE_SECONDS * sampleRate;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => {
    for (let n = 0; n < value.length; n++) view.setUint8(offset + n, value.charCodeAt(n));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const time = i / sampleRate;
    const fade = Math.min(1, time * 7, (SAMPLE_SECONDS - time) * 7);
    const pulse = Math.sin(time * Math.PI * 1.0) > 0 ? 1 : 0.18;
    const tone = 0.12 * fade * pulse * Math.sin(2 * Math.PI * 440 * time);
    view.setInt16(44 + i * 2, Math.round(tone * 32767), true);
  }
  return new File([buffer], 'viralos-self-test.wav', { type: 'audio/wav' });
}

export default function VideoSelfTest({ disabled, style }: {
  disabled: boolean;
  style: VideoStyle;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  async function run() {
    if (running || disabled) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setResult(null);
    setFailure('');
    setProgress(0);
    setRunning(true);
    let url: string | null = null;
    try {
      const words = DEMO_SCRIPT.trim().split(/\s+/u).length;
      if (words < 80 || words > 150) {
        throw Error('Demomanuset matchar inte Shorts-formatet.');
      }
      const output = await renderMP4(DEMO_SCRIPT, setProgress, demoTone(), style);
      url = output.url;
      const proof = await inspectMp4Tracks(output.blob);
      if (!output.withNarration || proof.audioTracks !== 1 || proof.videoTracks !== 1 ||
          Math.abs(output.duration - SAMPLE_SECONDS) > 1 ||
          !output.subtitles.includes('-->')) {
        throw Error('Ljud-/videospår, längd eller SRT från demot stämmer inte.');
      }
      const packet = await buildLocalReviewPacket(output.blob, {
        title: DEMO_TITLE, script: DEMO_SCRIPT, sourceUrl: '', origin: 'manual',
      }, { narrationPresent: true });
      const packetValid = packet.video.sha256 === proof.sha256 &&
        packet.permissions.ownerApproved === false &&
        packet.permissions.canAutomaticallyPublish === false &&
        packet.permissions.publicYouTubeReleaseAuthorized === false;
      if (!packetValid) throw Error('SHA-256 eller granskningsspärren kunde inte verifieras.');
      urlRef.current = url;
      setResult({
        url, blob: output.blob, proof, seconds: output.duration,
        scenes: output.scenes, srt: output.subtitles, packetValid,
      });
      url = null;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Det lokala MP4-testet misslyckades.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      setRunning(false);
    }
  }

  function saveText(filename: string, body: string, mime: string) {
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="panel" style={{ marginTop: 20 }}>
    <div className="panel-header">
      <h2><TestTube2 size={17} style={{ display: 'inline', marginRight: 7 }} />
        Lokal MP4 + ljudkontroll
      </h2>
      <span className="badge">Utan AI-krediter</span>
    </div>
    <div className="panel-body">
      <p className="smallprint">
        Producera en separat 21-sekunders engelsk Short med syntetiskt demoljud.
        Testet kontrollerar videospår, ljudspår, SRT-tider, SHA-256 och ett utkast
        med blockerad publicering. Det använder inte ditt sparade manus, lagrar
        inte testvideon på servern och är inte en AI-röst.
      </p>
      <button className="primary" disabled={running || disabled} onClick={() => void run()}>
        {running ? 'Testar MP4 och ljud ' + progress + ' %' : 'Skapa och verifiera lokal testvideo'}
      </button>
      {running && <p className="smallprint" role="status">Webbläsaren kodar 1080 × 1920 i 30 FPS. Håll fliken öppen.</p>}
      {failure && <div className="notice error" role="alert">Testet misslyckades: {failure}.
        Inga externa AI-anrop eller publiceringar har gjorts.</div>}
      {result && <>
        <div className="notice">
          <ShieldCheck size={15} style={{ display: 'inline', marginRight: 7 }} />
          Verifierad lokal H.264 MP4: {Math.round(result.proof.displayWidth)} ×
          {Math.round(result.proof.displayHeight)}, {result.proof.durationSeconds.toFixed(2)} sekunder,
          {result.proof.videoTracks} videospår, {result.proof.audioTracks} ljudspår och
          {result.scenes} scener. Första videobilden har avkodats och granskningsspärren är aktiv.
        </div>
        <p className="smallprint">
          SHA-256: <code>{result.proof.sha256}</code>
        </p>
        <video controls playsInline src={result.url}
          style={{ maxWidth: 250, maxHeight: 380, width: '100%' }} />
        <p className="smallprint">
          Lyssna själv: tonens närvaro och ljudkvaliteten måste verifieras av dig.
          Denna kontroll bevisar inte att framtida AI-berättarröster fungerar.
        </p>
        <div className="actions">
          <a href={result.url} download="viralos-audio-self-test-DRAFT.mp4">
            <button className="small"><Download size={14} style={{ display: 'inline' }} /> Ladda ner test-MP4</button>
          </a>
          <button className="small" onClick={() =>
            saveText('viralos-self-test-estimated-DRAFT.srt', result.srt,
              'application/x-subrip;charset=utf-8')}>
            Ladda ner test-SRT
          </button>
        </div>
      </>}
    </div>
  </section>;
}
