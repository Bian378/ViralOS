/**
 * Explicitly run local Ollama agents; never starts on scheduler or page load.
 * Requires installed Ollama + model. Writes UNAPPROVED, local JSON files only.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runLocalAgents } from './local_agent_pipeline.mjs';

function cliArgs(argv) {
  const opts = {};
  const flags = new Set(['--allow-local-inference']);
  const values = new Set(['--topic','--source-url','--model','--out-dir']);
  for (let i=0;i<argv.length;i++) {
    const key = argv[i];
    if (key in opts || (!flags.has(key) && !values.has(key)))
      throw new Error('Invalid or duplicate argument.');
    if (flags.has(key)) {
      opts[key] = true;
    } else {
      if (++i >= argv.length || argv[i].startsWith('--'))
        throw new Error('Missing argument value.');
      opts[key] = argv[i];
    }
  }
  if (!opts['--allow-local-inference'])
    throw new Error('Add --allow-local-inference to authorize exactly four local Ollama calls.');
  if (!opts['--topic'] || !opts['--source-url'] ||
      !opts['--model'] || !opts['--out-dir'])
    throw new Error('Required: --topic --source-url --model --out-dir and --allow-local-inference');
  return opts;
}

export async function main(argv = process.argv.slice(2), executor = runLocalAgents) {
  const args = cliArgs(argv);
  // Do not reserve output folder until the whole four-agent run validated.
  const { report, draftManifest } = await executor({
    topic:args['--topic'], sourceUrl:args['--source-url'],
    model:args['--model'], explicitLocalConsent:true,
  });
  const directory = resolve(args['--out-dir']);
  mkdirSync(directory, { recursive:false });
  try {
    writeFileSync(resolve(directory,'agent-proposals-UNVERIFIED.json'),
      JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    writeFileSync(resolve(directory,'source-DRAFT.json'),
      JSON.stringify(draftManifest,null,2)+'\n',{flag:'wx'});
  } catch(e) {
    rmSync(directory,{recursive:true,force:true});
    throw e;
  }
  return {
    directory,
    agentCount:report.rolesRun.length,
    status:report.status,
    publication:'DISABLED',
    AppDeployCreditsUsed:0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(JSON.stringify(await main()) + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : 'Local agent run failed')+'\n');
    process.exitCode=1;
  }
}
