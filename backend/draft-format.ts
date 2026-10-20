export const draftSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 160 },
    paragraphs: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
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
      draft.paragraphs.length !== 4 ||
      !draft.paragraphs.every(p => typeof p === 'string' && p.trim()))
    throw new Error('AI-svaret måste innehålla en titel och fyra stycken.');
  const paragraphs = (draft.paragraphs as string[]).map(p => p.trim().replace(/\s+/g, ' '));
  const script = paragraphs.join('\n\n');
  const words = script.split(/\s+/).length;
  if (words < 5 || words > 180 || script.length > 3500)
    throw new Error('AI-manuset ryms inte i en kortvideo.');
  return { title: draft.title.trim(), script };
}
