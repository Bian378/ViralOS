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
import { runFourRealAgents, MODEL as REAL_CHAT_MODEL } from './four_real_agents.mjs';
import {createHash} from 'node:crypto';

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
  silentPreview=false, kineticPreview=false,
  narration=null, audioRightsChecked=false,
  inference,
  realChatAgents=false,
  chatAgentRunner=runFourRealAgents,
  pythonRunner=offlinePython,
}){
  // Fail before AI inference if the final output location and audio authorizations are invalid.
  const root=validateOptions({
    destination,explicitLocalConsent,silentPreview,narration,audioRightsChecked,
  });
  if(realChatAgents&&(inference||model!==REAL_CHAT_MODEL))
    throw new Error('The real chat path uses exactly Qwen2.5 1.5B and no legacy inference adapter.');
  const {report,draftManifest}=realChatAgents
    ?await chatAgentRunner({topic,sourceUrl,explicitLocalConsent})
    :await runLocalAgents({
      topic,sourceUrl,model,explicitLocalConsent,
      ...(inference?{inference}:{}),
    });
  if(!draftManifest||draftManifest.notForPublication!==true)
    throw new Error('Four-agent manager draft failed validation; no video can be rendered.');
  if(realChatAgents){
    // Bind the exact accepted script bytes to the saved manager/agent report
    // BEFORE starting FFmpeg. Report cannot describe one agent while the video
    // silently renders another's content.
    const selected=report?.selectedDraftRole;
    const expected=report?.selectedDraftSha256;
    const scenes=draftManifest.scenePlan?.scenes;
    if(!['creative','quality','manager'].includes(selected)||
       typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected)||
       !Array.isArray(scenes)||!scenes.length||
       report.manuscriptFormatPassed!==true||
       report.publicReleaseAuthorized!==false||report.published!==false){
      throw new Error('Four-agent draft provenance or approval gate is invalid.');
    }
    const actualScript=scenes.map(s=>s.text).join('\n\n');
    const actual=createHash('sha256').update(actualScript,'utf8').digest('hex');
    if(actual!==expected)
      throw new Error('Four-agent accepted script SHA-256 does not match storyboard.');
  }
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
      ...(kineticPreview?['--kinetic-preview']:[]),
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
      agentCount:(report.rolesExecuted||report.rolesRun).length,
      realModelUsed:report.realModelUsed,
      selectedDraftRole:report.selectedDraftRole??null,
      selectedDraftSha256:report.selectedDraftSha256??null,
      manuscriptFormatPassed:report.manuscriptFormatPassed??true,
      outputVideo:join(preview,'short-DRAFT.mp4'),
      draftSha256:validation.sha256,
      status:'UNVERIFIED_DRAFT_REQUIRES_HUMAN_REVIEW',
      factsChecked:false,licensedMediaVerified:false,
      audioGeneratedByAI:false,
      captionsSynchronizedToSpeech:false,
      visualStyle:kineticPreview?'kinetic_procedural':'typography_static',
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
  const flags=new Set(['--allow-local-inference','--silent-preview','--audio-rights-checked','--kinetic-preview','--real-four-chat']);
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
      kineticPreview:a['--kinetic-preview']===true,
      realChatAgents:a['--real-four-chat']===true,
      narration:a['--narration']||null,
      audioRightsChecked:a['--audio-rights-checked']===true,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(e){
    process.stderr.write((e instanceof Error?e.message:'Unspecified failure')+'\n');
    process.exitCode=1;
  }
}
