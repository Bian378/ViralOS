/**
 * Explicitly opt-in to an OFFLINE four-agent → draft MP4 → integrity check run.
 * No YouTube upload, public release, paid APIs, AppDeploy deployment or scheduler.
 * Works with locally installed Ollama only; CI injects deterministic mock inference.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runLocalAgents } from './local_agent_pipeline.mjs';

function validateOptions(args) {
  if (args.explicitLocalConsent !== true)
    throw new Error('Explicit consent for four local inference calls required.');
  if (args.silentPreview !== true && !args.narration)
    throw new Error('Choose a silent preview or a licensed narration WAV.');
  if (args.silentPreview === true && args.narration)
    throw new Error('Choose exactly one audio option.');
  if (args.narration && args.audioRightsChecked !== true)
    throw new Error('Explicit audio rights check required.');
  if (typeof args.destination !== 'string' || !args.destination.trim())
    throw new Error('New output directory required.');
  const destination=resolve(args.destination);
  if (destination === resolve('/') || !existsSync(dirname(destination)) ||
      existsSync(destination))
    throw new Error('Output folder must not already exist and parent must exist.');
  return destination;
}

function offlinePython(args) {
  const result=spawnSync('python3',args,{
    cwd:resolve('.'),encoding:'utf8',timeout:240000,
    maxBuffer:512*1024,
    env:{...process.env, PYTHONUNBUFFERED:'1'},
  });
  if (result.error || result.status!==0)
    throw new Error('Offline video generation/verification failed: ' +
      String(result.stderr||result.error?.message||result.status).slice(0,600));
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('Offline worker returned an invalid result.'); }
}

export async function buildAgentVideoPreview({
  topic,sourceUrl,model, destination,
  explicitLocalConsent=false,
  silentPreview=false,
  narration=null, audioRightsChecked=false,
  inference,
  pythonRunner=offlinePython,
}){
  // Fail before AI inference if the final output location and audio authorizations are invalid.
  const root=validateOptions({
    destination,explicitLocalConsent,silentPreview,narration,audioRightsChecked,
  });
  const {report,draftManifest}=await runLocalAgents({
    topic,sourceUrl,model,explicitLocalConsent,
    ...(inference?{inference}:{}),
  });
  mkdirSync(root);  // Exclusive reservation, no overwriting existing work.
  try {
    writeFileSync(join(root,'agent-proposals-UNVERIFIED.json'),
      JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    writeFileSync(join(root,'source-DRAFT.json'),
      JSON.stringify(draftManifest,null,2)+'\n',{flag:'wx'});
    const preview=join(root,'preview');
    const create=[
      'worker/build_short_draft.py',join(root,'source-DRAFT.json'),preview,
      ...(silentPreview?['--silent-preview']:
        ['--narration',resolve(narration),'--audio-rights-checked']),
    ];
    const renderReceipt=pythonRunner(create);
    if(!renderReceipt||renderReceipt.status!=='UNAPPROVED_DRAFT_LOCAL_ONLY')
      throw new Error('Renderer did not return an unapproved draft receipt.');
    const validation=pythonRunner(['worker/verify_draft.py',preview]);
    if(!validation||validation.result!=='DRAFT_INTEGRITY_CHECK_PASSED'||
       validation.uploadAllowed!==false||validation.publicReleaseAllowed!==false)
      throw new Error('Draft integrity or publication safety check failed.');
    return {
      directory:root,
      agentCount:report.rolesRun.length,
      realModelUsed:report.realModelUsed,
      outputVideo:join(preview,'short-DRAFT.mp4'),
      draftSha256:validation.sha256,
      status:'UNVERIFIED_DRAFT_REQUIRES_HUMAN_REVIEW',
      factsChecked:false,licensedMediaVerified:false,
      audioGeneratedByAI:false,
      captionsSynchronizedToSpeech:false,
      uploadAllowed:false,publicReleaseAllowed:false,
      appDeployCreditsUsed:0,
    };
  }catch(error){
    rmSync(root,{recursive:true,force:true});
    throw error;
  }
}

function options(argv){
  const options={};
  const flags=new Set(['--allow-local-inference','--silent-preview','--audio-rights-checked']);
  const values=new Set(['--topic','--source-url','--model','--out-dir','--narration']);
  for(let i=0;i<argv.length;i++){
    const k=argv[i];
    if(!(flags.has(k)||values.has(k))||k in options)
      throw new Error('Unknown or duplicate argument.');
    if(flags.has(k)){options[k]=true;continue;}
    if(++i===argv.length||argv[i].startsWith('--'))
      throw new Error('Missing argument value.');
    options[k]=argv[i];
  }
  if(!options['--topic']||!options['--source-url']||
     !options['--model']||!options['--out-dir'])
    throw new Error('Required: --topic --source-url --model --out-dir.');
  return options;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const a=options(process.argv.slice(2));
    const result=await buildAgentVideoPreview({
      topic:a['--topic'],sourceUrl:a['--source-url'],
      model:a['--model'],destination:a['--out-dir'],
      explicitLocalConsent:a['--allow-local-inference']===true,
      silentPreview:a['--silent-preview']===true,
      narration:a['--narration']||null,
      audioRightsChecked:a['--audio-rights-checked']===true,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(e){
    process.stderr.write((e instanceof Error?e.message:'Unspecified failure')+'\n');
    process.exitCode=1;
  }
}
