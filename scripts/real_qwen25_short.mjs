/**
 * Bounded REAL local model -> original English Shorts script feasibility.
 * Isolated CI runner only; no online source retrieval, paid AI, scheduling,
 * social uploads, approval or public release.
 *
 * At most TWO local Ollama requests; rejected scripts are never rendered.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeLocalDraftPlan } from './create_draft_plan.mjs';

export const MODEL = 'qwen2.5:1.5b-instruct-q4_K_M';
const ENDPOINT = 'http://127.0.0.1:11434/api/chat';
const TITLE = 'Could an imaginary city change gaming?';
const SOURCE = 'https://example.org/original-fiction';

const RULES = [
  'Write a fully ORIGINAL, FICTIONAL English YouTube Short voiceover.',
  'OUTPUT ONLY THE SCRIPT, not JSON, not Markdown, no headings or labels.',
  'Write 100-115 words total. Exactly FIVE paragraphs separated by blank lines.',
  'First paragraph must be this six-word hook: Could This City Change Gaming Forever?',
  'Paragraphs two to five each contain approximately 22-28 English words.',
  'Describe an imaginary city, changing streets, mysterious choices and storytelling.',
  'End with a short question asking the viewer which path they would choose.',
  'Do NOT mention actual games, brands, official announcements, statistics or copied dialogue.',
].join('\n');

export function inspectOriginalScript(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim())
    return {valid:false,reason:'Empty AI response',words:0};
  if (candidate.length>5000)
    return {valid:false,reason:'AI response exceeds 5000 characters',words:0};
  const script=candidate.replace(/\r\n/g,'\n').trim();
  if (script.startsWith(String.fromCharCode(96)) || /^#{1,6}\s|^\s*[-*]\s/m.test(script))
    return {valid:false,reason:'Markdown or list formatting is not accepted',words:0};
  const words=script.split(/\s+/).length;
  try {
    const manifest=makeLocalDraftPlan({
      title:TITLE,script,sourceUrl:SOURCE,projectId:'real-qwen25-evaluation',revision:1,
    });
    return {valid:true,script,words,manifest};
  }catch(e){
    return {valid:false,words,reason:String(e?.message||e).slice(0,200)};
  }
}

export async function askLocalQwen({prompt,fetchImpl=fetch}) {
  const response=await fetchImpl(ENDPOINT,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      model:MODEL,
      messages:[
        {role:'system',content:'You write original concise English narration. Never claim facts are checked or media rights are cleared. Return plain script only.'},
        {role:'user',content:prompt},
      ],
      stream:false,options:{temperature:0.3,num_predict:550,num_ctx:2048},
    }),
    signal:AbortSignal.timeout(120000),
  });
  if(!response?.ok)throw new Error('Local Qwen2.5 returned HTTP '+Number(response?.status||0));
  const raw=await response.text();
  if(raw.length>25000)throw new Error('Local Ollama reply is too large');
  const body=JSON.parse(raw);
  if(typeof body?.message?.content!=='string')throw new Error('Ollama did not provide text');
  return body.message.content;
}

export async function runRealScriptTrial({
  outputDir,invoke=askLocalQwen,attemptLimit=2
}){
  if(!Number.isInteger(attemptLimit)||attemptLimit<1||attemptLimit>2)
    throw new Error('Only one or two local attempts are allowed.');
  if(typeof outputDir!=='string'||!outputDir.trim())
    throw new Error('Explicit new output directory is required.');
  const root=resolve(outputDir);
  mkdirSync(root,{recursive:false});
  const attempts=[];
  let accepted=null;
  for(let i=0;i<attemptLimit;i++){
    const prev=attempts[i-1];
    const prompt=RULES+(prev?'\nPREVIOUS DRAFT WAS REJECTED: '+prev.reason+
      '. Rewrite from scratch, follow all constraints. Do not exceed 115 words.':'');
    let raw;
    try { raw=await invoke({prompt,attempt:i+1}); }
    catch(e) {
      attempts.push({number:i+1,valid:false,words:0,
        reason:'Local inference failed: '+String(e?.message||e).slice(0,200),
        rawScript:''});
      break;
    }
    const checked=inspectOriginalScript(raw);
    attempts.push({number:i+1,valid:checked.valid,words:checked.words,
      reason:checked.valid?null:checked.reason,
      rawScript:typeof raw==='string'?raw.slice(0,5000):''});
    if(checked.valid){ accepted=checked; break; }
  }
  const status=accepted?'DRAFT_READY_FOR_HUMAN_FACT_AND_MEDIA_REVIEW':'DRAFT_REJECTED_BY_FORMAT_GATE';
  const result={
    kind:'viralos-real-neural-short-feasibility',
    model:MODEL,attemptedLocalInference:true,attempts,
    status,englishShortFormatPassed:Boolean(accepted),
    contentFactsVerified:false,licensingVerified:false,
    originalVideoGenerated:false,voiceGenerated:false,
    humanApproved:false,privateUploadAuthorized:false,
    publicReleaseAuthorized:false,published:false,
    appDeployCreditsUsed:0,
  };
  if(accepted){
    writeFileSync(join(root,'source-DRAFT.json'),
      JSON.stringify(accepted.manifest,null,2)+'\n',{flag:'wx'});
  }
  writeFileSync(join(root,'real-language-model-QC.json'),
    JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  return {status,attemptCount:attempts.length,
    acceptedWords:accepted?.words??null,pass:Boolean(accepted),
    model:MODEL,appDeployCreditsUsed:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(!process.argv[2])throw new Error('Usage: node real_qwen25_short.mjs NEW_OUTPUT_DIRECTORY');
  process.stdout.write(JSON.stringify(await runRealScriptTrial({outputDir:process.argv[2]}))+'\n');
}
