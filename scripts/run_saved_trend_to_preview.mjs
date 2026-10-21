/**
 * SAFE manual offline bridge: saved YouTube snapshots -> human-chosen topic ->
 * local four-agent English script -> draft MP4 -> final integrity verification.
 *
 * No YouTube API calls here (uses SAVED snapshots). No media copying, no
 * scheduled inference, no AppDeploy, no posting and no network except optional
 * loopback Ollama after explicit consent.
 */
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCandidateRadar,selectOriginalCommentaryTopic} from './youtube_candidate_radar.mjs';
import {buildAgentVideoPreview} from './agent_to_video_preview.mjs';

function savedSnapshot(path){
  if(typeof path!=='string'||!path.endsWith('.json'))throw new Error('Saved JSON snapshot required.');
  const filename=resolve(path);
  const stats=statSync(filename);
  if(!stats.isFile()||stats.size>350_000)
    throw new Error('Saved popularity JSON must be a file under 350 kB.');
  return JSON.parse(readFileSync(filename,'utf8'));
}

export async function runSavedTrendToPreview({
  latest,earlier=null,videoId,model,destination,
  allowLocalInference=false,silentPreview=false,kineticPreview=false,
  narration=null,audioRightsChecked=false,
  inference,pythonRunner,asOf=new Date().toISOString(),
}){
  if(allowLocalInference!==true)
    throw new Error('Explicit local inference authorization required.');
  if(typeof videoId!=='string'||!videoId.trim())
    throw new Error('Select one exact video ID from the shortlist.');
  const radar=buildCandidateRadar({latest,earlier,maxItems:25,asOf});
  const candidate=selectOriginalCommentaryTopic(radar,videoId);
  // Explicit owner selection is mandatory even if velocity data suggested an ID.
  const result=await buildAgentVideoPreview({
    topic:candidate.topic,sourceUrl:candidate.sourceUrl,
    model,destination,
    explicitLocalConsent:true,silentPreview,kineticPreview,narration,audioRightsChecked,
    ...(inference?{inference}:{}),
    ...(pythonRunner?{pythonRunner}:{}),
  });
  return {
    ...result,
    sourceVideoId:videoId,
    inspirationOnly:true,
    sourceVideoDownloaded:false,
    youtubeShortsClassificationVerified:false,
    originalSourceReproductionAuthorized:false,
    viewAccelerationEvidence:candidate.evidence,
    measuredViewsPerHour:candidate.measuredViewsPerHour,
    externalFactsVerified:false,
    originalWorkNeedsHumanReview:true,
  };
}

function flags(argv){
  const args={};
  const boolean=new Set(['--allow-local-inference','--silent-preview','--audio-rights-checked','--kinetic-preview']);
  const valued=new Set(['--latest','--earlier','--video-id','--model','--out-dir','--narration']);
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(!(boolean.has(key)||valued.has(key))||key in args)
      throw new Error('Unknown/duplicate CLI option.');
    if(boolean.has(key))args[key]=true;
    else{
      if(++i>=argv.length||argv[i].startsWith('--'))throw new Error('Option value missing.');
      args[key]=argv[i];
    }
  }
  for(const key of ['--latest','--video-id','--model','--out-dir'])
    if(!args[key])throw new Error('Required parameter missing: '+key);
  if(!args['--allow-local-inference'])
    throw new Error('Must pass --allow-local-inference for 4 local model calls.');
  return args;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const args=flags(process.argv.slice(2));
    const result=await runSavedTrendToPreview({
      latest:savedSnapshot(args['--latest']),
      earlier:args['--earlier']?savedSnapshot(args['--earlier']):null,
      videoId:args['--video-id'],
      model:args['--model'],
      destination:args['--out-dir'],
      allowLocalInference:args['--allow-local-inference']===true,
      silentPreview:args['--silent-preview']===true,
      kineticPreview:args['--kinetic-preview']===true,
      narration:args['--narration']??null,
      audioRightsChecked:args['--audio-rights-checked']===true,
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){
    process.stderr.write((error instanceof Error?error.message:'Manual offline run failed')+'\n');
    process.exitCode=1;
  }
}
