/**
 * Real neural inference feasibility test for free local Ollama.
 * Exactly one call, no uploads, no paid AI provider or scheduling.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {callLocalOllama} from './local_agent_pipeline.mjs';
import {makeLocalDraftPlan} from './create_draft_plan.mjs';

if(!process.argv[2])throw new Error('Explicit new output folder needed.');
const out=resolve(process.argv[2]);
const model='qwen3:0.6b';
const prompt=[
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
const raw=await callLocalOllama({model,prompt});
let parsed;
try { parsed=JSON.parse(raw); }
catch {throw new Error('A real local model replied but not with JSON.');}
const summary=typeof parsed.summary==='string'?parsed.summary:'';
const content=typeof parsed.proposedScript==='string'?parsed.proposedScript:'';
if(!summary.trim()||content.length<40)
  throw Error('Real local model produced an incomplete original English draft.');
const report={
  experiment:'ACTUAL_LOCAL_OLLAMA_MODEL_INFERENCE',
  model,provider:'local_127_0_0_1_only',
  inferencePerformed:true,
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
}catch(e){
  report.storyboardValidation='NEEDS_MANUSCRIPT_REVISION';
  report.storyboardError=String(e?.message||e).slice(0,200);
}
writeFileSync(resolve(out,'actual-ollama-output-UNVERIFIED.json'),
  JSON.stringify(report,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify({
  actualLocalInference:true,model,
  generatedWords:content.trim().split(/\s+/).length,
  storyboardValidation:report.storyboardValidation,
  uploadAuthorized:false,appDeployCredits:0
})+'\n');
