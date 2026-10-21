/**
 * Turn a user-authored English .txt Short manuscript into a local, unpublished
 * ViralOS production manifest. No network, video model, TTS or AppDeploy calls.
 *
 * Example:
 * node scripts/create_draft_plan.mjs --script script.txt \
 *   --title "An original English Short" \
 *   --source-url https://example.org/topic --out source-DRAFT.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { buildShortsProductionPlan } from '../src/shorts-production-plan.ts';
import { createProductionBundle } from '../src/subtitle-export.ts';

export function makeLocalDraftPlan({ title, script, sourceUrl, projectId='local-draft', revision=1 }) {
  if (typeof title !== 'string' || !title.trim() || title.length > 100)
    throw new Error('Title must contain 1–100 characters.');
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(projectId))
    throw new Error('Project ID must have 1–80 safe characters.');
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new Error('A positive saved revision is required.');
  if (typeof sourceUrl !== 'string' || sourceUrl.length > 1024 ||
      !/^https:\/\//.test(sourceUrl))
    throw new Error('Provide one HTTPS source link. The source is not independently verified.');
  const url = new URL(sourceUrl);
  if (url.username || url.password || !url.hostname.includes('.'))
    throw new Error('Source URL must be a normal HTTPS public reference.');
  const plan = buildShortsProductionPlan({
    projectId, revision, title: title.trim(), script, sourceUrl,
  });
  return createProductionBundle(plan);
}

function readOptions(argv) {
  const opts = {};
  const allowed = new Set(['--script','--title','--source-url','--out','--project-id','--revision']);
  for (let i=0;i<argv.length;i+=2) {
    if (!allowed.has(argv[i]) || i+1>=argv.length || argv[i] in opts)
      throw new Error('Unknown, duplicate or incomplete CLI argument.');
    opts[argv[i]] = argv[i+1];
  }
  if (!opts['--script'] || !opts['--title'] || !opts['--source-url'] || !opts['--out'])
    throw new Error('Required: --script PATH --title TITLE --source-url HTTPS --out NEW-DRAFT.json');
  if (!opts['--out'].endsWith('-DRAFT.json'))
    throw new Error('Filename must end with -DRAFT.json.');
  const revision = opts['--revision']===undefined ? 1 : Number(opts['--revision']);
  if (!Number.isSafeInteger(revision))
    throw new Error('Revision must be an integer.');
  return { ...opts, revision };
}

export function main(argv=process.argv.slice(2)) {
  const opts = readOptions(argv);
  const script = readFileSync(opts['--script'], 'utf8');
  if (Buffer.byteLength(script, 'utf8') > 10000)
    throw new Error('Script input is too large.');
  const bundle = makeLocalDraftPlan({
    title: opts['--title'], script, sourceUrl:opts['--source-url'],
    projectId: opts['--project-id'] || 'local-draft',
    revision: opts.revision,
  });
  // Exclusive file creation: never overwrite a user's manuscript or existing plan.
  writeFileSync(opts['--out'], JSON.stringify(bundle,null,2)+'\n', {flag:'wx'});
  return { output:opts['--out'],projectId:bundle.scenePlan.projectId,
    scenes:bundle.scenePlan.scenes.length,
    words:bundle.scenePlan.totalWords,seconds:bundle.scenePlan.estimatedSeconds,
    status:bundle.status,published:false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(JSON.stringify(main())+'\n');
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : 'Unable to create local draft')+'\n');
    process.exitCode = 1;
  }
}
