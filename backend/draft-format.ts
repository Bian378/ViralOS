export const draftSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 160 },
    paragraphs: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: { type: 'string', minLength: 1 },
    },
  },
  required: ['title', 'paragraphs'],
};

export function parseDraft(raw: string): { title: string; script: string } {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('AI-svaret saknar ett giltigt manus.');
  const draft = value as Record<string, unknown>;
  if (typeof draft.title !== 'string' || !draft.title.trim() ||
      draft.title.trim().length > 160 || !Array.isArray(draft.paragraphs) ||
      draft.paragraphs.length !== 5 ||
      !draft.paragraphs.every(p => typeof p === 'string' && p.trim()))
    throw new Error('AI-svaret måste innehålla en titel och fem stycken.');
  const paragraphs = (draft.paragraphs as string[]).map(p => p.trim().replace(/\s+/g, ' '));
  const script = paragraphs.join('\n\n');
  const lengths = paragraphs.map(paragraph => paragraph.split(/\s+/u).length);
  const words = lengths.reduce((total, length) => total + length, 0);
  if (words < 80 || words > 150 || script.length > 3500 ||
      lengths[0] < 3 || lengths[0] > 8 ||
      lengths.slice(1).some(count => count < 18 || count > 35)) {
    throw new Error('AI-manuset måste ha 80–150 ord, en hook på 3–8 ord och fyra tydliga berättelsescener.');
  }
  return { title: draft.title.trim(), script };
}
