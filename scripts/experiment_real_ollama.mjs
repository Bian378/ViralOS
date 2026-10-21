/**
 * Real neural inference feasibility test for free local Ollama.
 * Exactly one call, no uploads, no paid AI provider or scheduling.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeLocalDraftPlan} from './create_draft_plan.mjs';

if(!process.argv[2])throw new Error('Explicit new output folder needed.');
const out=resolve(process.argv[2]);
const model='smollm2:360m-instruct-q4_K_M';
const prompt=[
'/no_think',
'You are a ViralOS creative agent conducting a PRIVATE TEST only.',
'Return one JSON object ONLY with keys summary, claimsToVerify (array), proposedScript (string).',
'In proposedScript write exactly FIVE paragraphs of original English prose',
'separated by TWO newline characters. Paragraph one must be the hook:',
'Could This City Change Gaming Forever?',
'Paragraphs two through five describe a purely fictional video game world',
'and its possible storytelling potential. Target 105-125 words in total.',
'Do not claim any real product, game or company announced anything.',
'No URLs, no excerpts from existing media, no Markdown, no extra explanation.',
].join('\n');
mkdirSync(out,{recursive:false});
// Qwen3: official Ollama chat endpoint supports explicit non-thinking output.
// SmolLM2 does not expose a reasoning mode. Prompt is untrusted input only.
const response=await fetch('http://127.0.0.1:11434/api/chat',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({
    model,messages:[{role:'user',content:prompt}],
    stream:false,
    options:{num_ctx:2048,num_predict:850,temperature:0.2},
  }),
  signal:AbortSignal.timeout(120000),
});
if(!response.ok)throw Error('Local Ollama chat returned HTTP '+response.status);
const output=await response.json();
const raw=output?.message?.content;
if(typeof raw!=='string'||!raw.trim())
  throw Error('Local Qwen3 chat returned no final text.');
let parsed,validJson=true;
try { parsed=JSON.parse(raw); }
catch {
  validJson=false;
  parsed={summary:'A real local model replied but did not complete structured JSON.',
    proposedScript:raw,claimsToVerify:[]};
}
const summary=typeof parsed.summary==='string'?parsed.summary:'';
const content=typeof parsed.proposedScript==='string'?parsed.proposedScript:'';
if(!raw.trim())throw Error('Local model returned an empty response.');
const report={
  experiment:'ACTUAL_LOCAL_OLLAMA_MODEL_INFERENCE',
  model,provider:'local_127_0_0_1_only',
  inferencePerformed:true,
  validStructuredJson:validJson,
  scriptApproved:false,

  modelOutputVerifiedFactually:false,
  rightsIndependentlyChecked:false,
  publicationApproved:false,uploadAuthorized:false,
  rawScript:content.slice(0,3500),
  claimsToVerify:Array.isArray(parsed.claimsToVerify)
    ?parsed.claimsToVerify.filter(x=>typeof x==='string').slice(0,8):[],
};
try{
  const manifest=makeLocalDraftPlan({
    title:'An imaginary open world - neural model test',
    script:content,sourceUrl:'https://example.org/fictional-world',
  });
  writeFileSync(resolve(out,'source-DRAFT.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  report.storyboardValidation='PASS';
  report.scriptMeetsStoryboardRules=validJson;
}catch(e){
  report.storyboardValidation='NEEDS_MANUSCRIPT_REVISION';
  report.storyboardError=String(e?.message||e).slice(0,200);
}
writeFileSync(resolve(out,'actual-ollama-output-UNVERIFIED.json'),
  JSON.stringify(report,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({
  actualLocalInference:true,model,
  generatedWords:content.trim().split(/\s+/).length,
  validStructuredJson:validJson,
  storyboardValidation:report.storyboardValidation,
  uploadAuthorized:false,appDeployCredits:0
})+'\n');
