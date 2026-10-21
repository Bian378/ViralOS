import type { Project } from './model';

export type ScriptReview = {
  id: string;
  ownerId: string;
  actorUserId: string;
  actorType: 'human';
  action: 'script_review';
  decision: 'approved_script' | 'needs_changes' | 'revoked';
  revision: number;
  sha256: string;
  comment: string;
  at: string;
};

export function revisionOf(project: Project) {
  return project.revision ?? 0;
}

export function sameContent(a: Project, b: Pick<Project, 'title' | 'script' | 'sourceUrl'>) {
  return a.title === b.title && a.script === b.script && a.sourceUrl === b.sourceUrl;
}

export function reviewStatus(project: Project) {
  const review = project.review;
  return review && review.revision === revisionOf(project)
    ? review.decision : 'pending';
}

export async function scriptHash(project: Project) {
  const bytes = new TextEncoder().encode(JSON.stringify([
    project.id, revisionOf(project), project.title, project.script, project.sourceUrl,
  ]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function decideScriptReview(
  project: Project,
  input: Record<string, unknown>,
  ownerId: string,
): Promise<ScriptReview> {
  if (!Number.isInteger(input.revision) || input.revision !== revisionOf(project))
    throw new Error('Manuset har ändrats. Uppdatera och granska den nya versionen.');
  if (!['approved_script', 'needs_changes', 'revoked'].includes(String(input.decision)))
    throw new Error('Ogiltigt granskningsbeslut.');
  const hash = await scriptHash(project);
  if (input.expectedSha256 !== hash)
    throw new Error('Innehållet stämmer inte med den granskade versionen. Uppdatera arbetsytan.');
  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 1000) throw new Error('Kommentaren får vara högst 1 000 tecken.');
  if (input.decision === 'needs_changes' && !comment)
    throw new Error('Beskriv vad som behöver ändras.');
  if (input.decision === 'revoked' && reviewStatus(project) !== 'approved_script')
    throw new Error('Det finns inget giltigt manusgodkännande att återkalla.');
  return {
    id: crypto.randomUUID(), ownerId, actorUserId: ownerId, actorType: 'human',
    action: 'script_review', decision: input.decision as ScriptReview['decision'],
    revision: revisionOf(project), sha256: hash, comment,
    at: new Date().toISOString(),
  };
}
