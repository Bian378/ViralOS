/**
 * FREE, deterministic storyboard planning for English YouTube Shorts.
 *
 * No fetch, AI generation, image search, TTS, rendering or upload side effects.
 * All caption timings are estimates and must be realigned to final narration.
 */
export type ShortScene = {
  order: number;
  text: string;
  wordCount: number;
  startFrame: number;
  durationFrames: number;
  captionCues: Array<{ text: string; startFrame: number; durationFrames: number }>;
  assetStatus: 'not_selected';
  rightsStatus: 'unverified';
};
export type ShortsProductionPlan = {
  projectId: string;
  revision: number;
  title: string;
  sourceUrl: string;
  language: 'en';
  fps: 30;
  width: 1080;
  height: 1920;
  format: 'mp4';
  totalWords: number;
  totalFrames: number;
  estimatedSeconds: number;
  scenes: ShortScene[];
  voiceStatus: 'not_generated';
  mediaStatus: 'not_generated';
  subtitlesStatus: 'estimated_not_synced';
  exportStatus: 'not_rendered';
  sourceFootageUsed: false;
  needsOwnerApproval: true;
  factChecking: 'unverified';
  instructions: string[];
};

type Input = {
  projectId: string;
  revision: number;
  title: string;
  script: string;
  sourceUrl?: string;
};

function words(s: string): string[] {
  return s.trim().split(/\s+/u).filter(Boolean);
}

function captionCues(text: string, startFrame: number, durationFrames: number) {
  const chunks: string[] = [];
  const tokens = words(text);
  for (let i = 0; i < tokens.length; i += 7) {
    chunks.push(tokens.slice(i, i + 7).join(' '));
  }
  return chunks.map((chunk, index) => {
    const from = startFrame + Math.floor(index * durationFrames / chunks.length);
    const to = startFrame + Math.floor((index + 1) * durationFrames / chunks.length);
    return { text: chunk, startFrame: from, durationFrames: to - from };
  });
}

export function buildShortsProductionPlan(input: Input): ShortsProductionPlan {
  if (!input.projectId.trim() || !input.title.trim() ||
      !Number.isSafeInteger(input.revision) || input.revision < 1)
    throw new Error('A saved manuscript, title and valid revision are required.');
  if (input.title.length > 160 || input.script.length > 3500)
    throw new Error('Manuscript exceeds input size limits.');
  const paragraphs = input.script.trim().split(/\n\s*\n/u).map(s => s.trim()).filter(Boolean);
  const totalWords = words(input.script).length;
  if (totalWords < 80 || totalWords > 150)
    throw new Error('An English Short script should contain 80–150 words.');
  if (paragraphs.length < 3 || paragraphs.length > 8)
    throw new Error('Use 3–8 paragraphs with one main idea per paragraph.');
  const hookLength = words(paragraphs[0]).length;
  if (hookLength < 3 || hookLength > 8)
    throw new Error('The first 1–3 second hook must contain 3–8 words.');
  if (paragraphs.some(p => words(p).length > 60))
    throw new Error('Split unusually long paragraphs for readable scenes.');
  // A predictable English speaking pace, not an actual audio measurement.
  const spokenWpm = 170;
  let position = 0;
  const scenes: ShortScene[] = paragraphs.map((text, index) => {
    const count = words(text).length;
    const speechSeconds = count / spokenWpm * 60;
    const durationSeconds = index === 0
      ? Math.max(1.5, speechSeconds + 0.12)
      : Math.max(2.5, speechSeconds + 0.4);
    const durationFrames = Math.max(1, Math.round(durationSeconds * 30));
    const scene: ShortScene = {
      order: index + 1,
      text, wordCount: count, startFrame: position, durationFrames,
      captionCues: captionCues(text, position, durationFrames),
      assetStatus: 'not_selected',
      rightsStatus: 'unverified',
    };
    position += durationFrames;
    return scene;
  });
  const totalSeconds = position / 30;
  if (totalSeconds > 60)
    throw new Error('Estimated narration exceeds 60 seconds. Shorten the script.');
  return {
    projectId: input.projectId, revision: input.revision,
    title: input.title, sourceUrl: input.sourceUrl || '',
    language: 'en', fps: 30, width: 1080, height: 1920, format: 'mp4',
    totalWords, totalFrames: position, estimatedSeconds: totalSeconds, scenes,
    voiceStatus: 'not_generated', mediaStatus: 'not_generated',
    subtitlesStatus: 'estimated_not_synced', exportStatus: 'not_rendered',
    sourceFootageUsed: false, needsOwnerApproval: true,
    factChecking: 'unverified',
    instructions: [
      'Verify the original script is English and contains only supported factual claims.',
      'Check source rights before choosing any images, audio, clips or music.',
      'Produce an original soundtrack and voiceover only under explicit budget authorization.',
      'Resynchronize all caption cues against the final voice recording.',
      'Present exact final MP4 with audio to the owner for version-specific approval.',
      'YouTube upload and public release require a separate authorization.',
    ],
  };
}
