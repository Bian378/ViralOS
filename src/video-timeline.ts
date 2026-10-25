/**
 * Shared, deterministic frame timeline for final local MP4 and its DRAFT SRT.
 * This is NOT forced alignment to speech and never claims to be word-accurate.
 */
export type VideoStyle = 'cinematic' | 'bold';
export type Cue = { text: string; startFrame: number; endFrame: number };
export type VideoScene = {
  index: number;
  text: string;
  startFrame: number;
  endFrame: number;
  wordCount: number;
  isHook: boolean;
  captions: Cue[];
};
export type VideoTimeline = {
  fps: 30;
  frames: number;
  duration: number;
  scenes: VideoScene[];
  estimatedNotSpeechAligned: true;
};

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean);

function splitScenes(script: string) {
  const count = words(script).length;
  if (count < 5 || count > 180) throw Error('Använd 5–180 ord i Short-videon.');
  const scenes: string[] = [];
  for (const paragraph of script.split(/\n+/u).map(p => p.trim()).filter(Boolean)) {
    const part = words(paragraph);
    const count = Math.ceil(part.length / 16);
    const width = Math.ceil(part.length / count);
    for (let i = 0; i < part.length; i += width) {
      scenes.push(part.slice(i, i + width).join(' '));
    }
  }
  if (scenes.length > 1 && words(scenes[scenes.length - 1]).length < 4) {
    const last = words(scenes.pop()!);
    const previous = words(scenes.pop()!);
    const joined = [...previous, ...last];
    const split = Math.ceil(joined.length / 2);
    scenes.push(joined.slice(0, split).join(' '), joined.slice(split).join(' '));
  }
  if (!scenes.length || scenes.length > 12) {
    throw Error('Videon kräver högst 12 scener. Korta manusets stycken.');
  }
  return scenes;
}

function appendCues(text: string, startFrame: number, endFrame: number): Cue[] {
  const tokens = words(text);
  const captions: string[] = [];
  for (let i = 0; i < tokens.length; i += 7) {
    captions.push(tokens.slice(i, i + 7).join(' '));
  }
  return captions.map((caption, n) => ({
    text: caption,
    startFrame: startFrame + Math.round(n * (endFrame - startFrame) / captions.length),
    endFrame: startFrame + Math.round((n + 1) * (endFrame - startFrame) / captions.length),
  }));
}

export function makeVideoTimeline(script: string, duration: number): VideoTimeline {
  if (!Number.isFinite(duration) || duration < 15 || duration > 46) {
    throw Error('En Short ska vara mellan 15 och 45 sekunder.');
  }
  const parts = splitScenes(script);
  const frames = Math.round(duration * 30);
  const lengths = parts.map(part => words(part).length);
  const isHook = parts.length > 1 && lengths[0] >= 3 && lengths[0] <= 8;
  const first = isHook
    ? Math.min(90, Math.max(45, Math.round(lengths[0] / 3 * 30)))
    : 0;
  const remaining = frames - first;
  const weights = lengths.map((length, index) => index === 0 && isHook ? 0 : length + 2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const ends: number[] = [];
  let spent = 0;
  let currentWeight = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i === 0 && isHook) {
      spent = first;
    } else {
      currentWeight += weights[i];
      spent = first + Math.round(currentWeight * remaining / sum);
    }
    ends.push(i === parts.length - 1 ? frames : spent);
  }
  const scenes = parts.map((text, index) => {
    const startFrame = index ? ends[index - 1] : 0;
    const endFrame = ends[index];
    if (endFrame <= startFrame) throw Error('Scenen har för kort visningstid.');
    return {
      index, text, startFrame, endFrame,
      wordCount: lengths[index], isHook: index === 0 && isHook,
      captions: appendCues(text, startFrame, endFrame),
    };
  });
  return {
    fps: 30, frames, duration: frames / 30, scenes,
    estimatedNotSpeechAligned: true,
  };
}

function timecode(frame: number): string {
  const ms = Math.round(frame * 1000 / 30);
  const hh = Math.floor(ms / 3600000);
  const mm = Math.floor(ms / 60000) % 60;
  const ss = Math.floor(ms / 1000) % 60;
  const frac = ms % 1000;
  return [hh, mm, ss].map(value => String(value).padStart(2, '0')).join(':') +
    ',' + String(frac).padStart(3, '0');
}

export function createRenderedDraftSrt(timeline: VideoTimeline) {
  const cues = timeline.scenes.flatMap(scene => scene.captions);
  if (!cues.length || cues[0].startFrame !== 0 ||
      cues[cues.length - 1].endFrame !== timeline.frames ||
      cues.some((cue, i) =>
        cue.endFrame <= cue.startFrame ||
        (i > 0 && cue.startFrame !== cues[i - 1].endFrame))) {
    throw Error('Undertexttider matchar inte MP4:ns tidslinje.');
  }
  return cues.map((cue, i) => [
    String(i + 1),
    timecode(cue.startFrame) + ' --> ' + timecode(cue.endFrame),
    cue.text.replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/</g, '‹').replace(/>/g, '›'),
  ].join('\r\n')).join('\r\n\r\n') + '\r\n';
}
