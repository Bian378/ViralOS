import type { ShortsProductionPlan } from './shorts-production-plan';

/**
 * Read-only exports based on ESTIMATED scene times.
 * These files are planning aids, not timed final voice subtitles or licensed media.
 */
export function formatSrtTime(frames: number, fps: number): string {
  if (!Number.isSafeInteger(frames) || frames < 0 ||
      !Number.isSafeInteger(fps) || fps <= 0 || fps > 120)
    throw new Error('Invalid frame-based timestamp.');
  const ms = Math.round(frames * 1000 / fps);
  if (!Number.isSafeInteger(ms) || ms >= 360000000)
    throw new Error('Subtitle duration exceeds 100 hours.');
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor(ms / 60000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  const millis = ms % 1000;
  return String(hours).padStart(2, '0') + ':' +
    String(minutes).padStart(2, '0') + ':' +
    String(seconds).padStart(2, '0') + ',' +
    String(millis).padStart(3, '0');
}

function sanitizedSubtitleText(value: string): string {
  // SRT is text; do not interpret embedded HTML tags from an untrusted script.
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/</g, '‹').replace(/>/g, '›').trim();
}

export function createDraftSrt(plan: ShortsProductionPlan): string {
  const fps = plan.fps;
  if (!Number.isSafeInteger(fps) || fps <= 0)
    throw new Error('Invalid FPS.');
  const scenes = plan.scenes;
  if (!Array.isArray(scenes) || scenes.length < 1)
    throw new Error('Missing subtitle scenes.');
  const lines: string[] = [];
  let cueNumber = 0;
  let lastEnd = 0;
  for (const scene of scenes) {
    for (const cue of scene.captionCues) {
      if (!Number.isSafeInteger(cue.startFrame) ||
          !Number.isSafeInteger(cue.durationFrames) ||
          cue.durationFrames < 1 || cue.startFrame < lastEnd ||
          cue.startFrame < scene.startFrame ||
          cue.startFrame + cue.durationFrames > scene.startFrame + scene.durationFrames)
        throw new Error('Invalid or overlapping cue timing.');
      if (cue.startFrame > lastEnd && cueNumber > 0)
        throw new Error('Missing caption interval.');
      const caption = sanitizedSubtitleText(cue.text);
      if (!caption) throw new Error('Empty caption segment.');
      cueNumber++;
      lines.push(
        String(cueNumber),
        formatSrtTime(cue.startFrame, fps) + ' --> ' +
          formatSrtTime(cue.startFrame + cue.durationFrames, fps),
        caption,
        '',
      );
      lastEnd = cue.startFrame + cue.durationFrames;
    }
  }
  if (!cueNumber || lastEnd !== plan.totalFrames)
    throw new Error('Caption sequence is incomplete.');
  return lines.join('\r\n') + '\r\n';
}

export type ProductionBundle = {
  schemaVersion: 1;
  kind: 'viralos-draft-production-plan';
  status: 'unapproved_preproduction';
  notForPublication: true;
  subtitlesAreEstimated: true;
  narration: 'not_generated';
  media: 'not_generated';
  export: 'not_rendered';
  assetRights: 'unverified';
  scenePlan: ShortsProductionPlan;
};

export function createProductionBundle(plan: ShortsProductionPlan): ProductionBundle {
  if (!plan.projectId.trim() || !Number.isSafeInteger(plan.revision) ||
      plan.revision < 1 || !plan.needsOwnerApproval ||
      plan.subtitlesStatus !== 'estimated_not_synced' ||
      plan.exportStatus !== 'not_rendered' ||
      plan.scenes.some(s => s.rightsStatus !== 'unverified'))
    throw new Error('This is not a pending preproduction plan.');
  // JSON serialization is safe and deterministic; never includes actual media data.
  return {
    schemaVersion: 1,
    kind: 'viralos-draft-production-plan',
    status: 'unapproved_preproduction',
    notForPublication: true,
    subtitlesAreEstimated: true,
    narration: 'not_generated',
    media: 'not_generated',
    export: 'not_rendered',
    assetRights: 'unverified',
    scenePlan: plan,
  };
}

export function safeProjectFilename(projectId: string, revision: number, extension: 'srt'|'json'): string {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error('Saved revision required.');
  const name = projectId.normalize('NFKD').replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 48) || 'short';
  return 'viralos-' + name + '-v' + revision + '-DRAFT.' + extension;
}
