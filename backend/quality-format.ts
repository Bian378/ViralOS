import type { QualityReport } from '../src/script-quality';
export const qualityReviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hookFeedback: { type:'string', minLength:1, maxLength:700 },
    structureFeedback: { type:'string', minLength:1, maxLength:700 },
    factFlags: { type:'array', maxItems:5, items:{ type:'string', minLength:1, maxLength:220 } },
    revisedParagraphs: {
      type:'array', minItems:3, maxItems:8,
      items:{ type:'string', minLength:1, maxLength:750 },
    },
  },
  required:['hookFeedback','structureFeedback','factFlags','revisedParagraphs'],
};
export function parseQualityReview(raw: string): Pick<QualityReport, 'hookFeedback'|'structureFeedback'|'factFlags'|'revisedScript'> {
  const r = JSON.parse(raw) as Record<string, unknown>;
  if (!r || Array.isArray(r) || typeof r !== 'object' ||
      typeof r.hookFeedback !== 'string' || !r.hookFeedback.trim() ||
      typeof r.structureFeedback !== 'string' || !r.structureFeedback.trim() ||
      !Array.isArray(r.factFlags) || !Array.isArray(r.revisedParagraphs) ||
      r.revisedParagraphs.length < 3 || r.revisedParagraphs.length > 8 ||
      !r.factFlags.every(s => typeof s === 'string') ||
      !r.revisedParagraphs.every(p => typeof p === 'string' && p.trim()))
    throw new Error('AI-granskningen hade felaktigt format.');
  const revisedScript = (r.revisedParagraphs as string[])
    .map(p => p.trim().replace(/\s+/g,' ')).join('\n\n');
  const wordCount = revisedScript.trim().split(/\s+/).length;
  if (wordCount < 40 || wordCount > 180 || revisedScript.length > 3500)
    throw new Error('Det föreslagna manuset har olämplig längd.');
  return {
    hookFeedback: r.hookFeedback.trim().slice(0,700),
    structureFeedback: r.structureFeedback.trim().slice(0,700),
    factFlags: (r.factFlags as string[]).slice(0,5).map(s => s.slice(0,220)),
    revisedScript,
  };
}
