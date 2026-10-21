import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MODEL,ROLES,requestRealLocalAgent,runFourRealAgents,stagePrompt} from '../scripts/four_real_agents.mjs';
import {saveFourAgentReview} from '../scripts/run_four_real_agents.mjs';

const script=readFileSync(new URL('./fixtures/qwen25-real-response.txt',import.meta.url),'utf8');
const topic='An original imagined game city storyline';
const sourceUrl='https://example.org/fiction';
function fake(){
  const calls=[];
  return {calls,invoke:async({role,prompt})=>{
    calls.push({role,prompt});
    if(role==='research')return 'NO_VERIFIED_FACTS. HUMAN_REVIEW_REQUIRED.';
    return script;
  }};
}
async function sandbox(fn){
  const root=mkdtempSync(join(tmpdir(),'viralos-4-'));
  try {return await fn(root);}finally{rmSync(root,{recursive:true,force:true});}
}
test('exact creative research quality manager order with actual storyboard acceptance',async()=>{
  const {calls,invoke}=fake();
  const output=await runFourRealAgents({topic,sourceUrl,explicitLocalConsent:true,invoke});
  assert.deepEqual(calls.map(x=>x.role),ROLES);
  assert.equal(output.report.modelCalls,4);
  assert.equal(output.report.status,'UNVERIFIED_MANUSCRIPT_READY_FOR_HUMAN_REVIEW');
  assert.equal(output.report.finalWordCount,80);
  assert.equal(output.report.finalFormattingNormalized,true);
  assert.equal(output.draftManifest.notForPublication,true);
  assert.equal(output.draftManifest.scenePlan.scenes.length,5);
  assert.equal(output.report.researchBrowsedInternet,false);
  assert.equal(output.report.realModelUsed,false);
  assert.equal(output.report.factsIndependentlyVerified,false);
  assert.equal(output.report.humanApproved,false);
  assert.equal(output.report.publicReleaseAuthorized,false);
});
test('intermediate source is marked untrusted and research stage receives the first draft',async()=>{
  const {calls,invoke}=fake();
  await runFourRealAgents({topic,sourceUrl,explicitLocalConsent:true,invoke});
  assert.match(calls[1].prompt,/NO web, browser or research access/);
  assert.match(calls[1].prompt,/DRAFT TEXT EXCERPT \(untrusted\):/);
  assert.match(calls[2].prompt,/NO_VERIFIED_FACTS/);
  assert.match(calls[3].prompt,/Revision excerpt \(untrusted\)/);
});
test('cannot run without consent or valid HTTPS metadata',async()=>{
  const f=fake();
  await assert.rejects(runFourRealAgents({topic,sourceUrl,invoke:f.invoke}),/consent/);
  await assert.rejects(runFourRealAgents({topic,sourceUrl:'http://example.org',explicitLocalConsent:true,invoke:f.invoke}),/HTTPS/);
  await assert.rejects(runFourRealAgents({topic,sourceUrl,projectId:'../bad',explicitLocalConsent:true,invoke:f.invoke}),/safe project/);
  assert.equal(f.calls.length,0);
});
test('overlong but bounded draft is rejected after all four role boundaries',async()=>{
  const f=fake();
  const result=await runFourRealAgents({
    topic,sourceUrl,explicitLocalConsent:true,
    invoke:async x=>x.role==='manager'?Array(200).fill('notready').join(' '):f.invoke(x),
  });
  assert.equal(result.draftManifest,null);
  assert.equal(result.report.status,'MANUSCRIPT_REJECTED_BY_VALIDATOR');
  assert.equal(result.report.publicReleaseAuthorized,false);
});
test('failure at research stops later model calls and never claims review completed',async()=>{
  const calls=[];
  await assert.rejects(runFourRealAgents({topic,sourceUrl,explicitLocalConsent:true,
    invoke:async({role})=>{calls.push(role);if(role==='research')throw Error('local crash');return script;},
  }),/local crash/);
  assert.deepEqual(calls,['creative','research']);
});
test('hard-coded local Ollama chat endpoint and bounded request',async()=>{
  let captured;
  const answer=await requestRealLocalAgent({role:'creative',prompt:'Write original fictional short',fetchImpl:async(url,opt)=>{
    captured={url,body:JSON.parse(opt.body)};
    return {ok:true,text:async()=>JSON.stringify({message:{content:script}})};
  }});
  assert.equal(captured.url,'http://127.0.0.1:11434/api/chat');
  assert.equal(captured.body.model,MODEL);
  assert.equal(captured.body.stream,false);
  assert.equal(answer,script.trim());
});
test('failed Ollama HTTP never repeats automatically',async()=>{
  let calls=0;
  await assert.rejects(requestRealLocalAgent({role:'creative',prompt:'test',fetchImpl:async()=>{
    calls++;return {ok:false,status:500};
  }}),/HTTP 500/);
  assert.equal(calls,1);
});
test('local output saves only review, plus draft if format passes',()=>sandbox(async root=>{
  const f=fake();
  const destination=join(root,'review');
  const saved=await saveFourAgentReview({outputDir:destination,topic,sourceUrl,
    explicitLocalConsent:true,run:arg=>runFourRealAgents({...arg,invoke:f.invoke})});
  assert.equal(saved.validDraft,true);
  const report=JSON.parse(readFileSync(join(destination,'four-agent-review-UNVERIFIED.json'),'utf8'));
  assert.equal(report.publicReleaseAuthorized,false);
  assert.ok(existsSync(join(destination,'source-DRAFT.json')));
  await assert.rejects(saveFourAgentReview({outputDir:destination,topic,sourceUrl,
    explicitLocalConsent:true,run:arg=>runFourRealAgents({...arg,invoke:f.invoke})}),/EEXIST/);
}));
test('rejected final script saves review, never a renderable manifest',()=>sandbox(async root=>{
  const destination=join(root,'invalid');
  await saveFourAgentReview({outputDir:destination,topic,sourceUrl,explicitLocalConsent:true,
    run:arg=>runFourRealAgents({...arg,invoke:async({role})=>
      role==='manager'?'incomplete script':role==='research'?'claims unverified':script})});
  assert.equal(existsSync(join(destination,'source-DRAFT.json')),false);
  assert.equal(JSON.parse(readFileSync(join(destination,'four-agent-review-UNVERIFIED.json'),'utf8')).published,false);
}));
test('a stage failure leaves no half-written approval or output directory',()=>sandbox(async root=>{
  const destination=join(root,'fail');
  await assert.rejects(saveFourAgentReview({outputDir:destination,topic,sourceUrl,
    explicitLocalConsent:true,run:async()=>{throw Error('model crashed');}}),/model crashed/);
  assert.equal(existsSync(destination),false);
}));
test('prompts refuse unknown stage roles',()=>{
  assert.throws(()=>stagePrompt({role:'publisher',topic,sourceUrl}),/Unknown/);
});


test('long creative and quality text is excerpted to prevent model echo loops',async()=>{
  const veryLong=Array(300).fill('story').join(' ');
  const calls=[];
  const final=script;
  await runFourRealAgents({topic,sourceUrl,explicitLocalConsent:true,invoke:async({role,prompt})=>{
    calls.push({role,prompt});
    return role==='creative'||role==='quality'?veryLong:
      role==='research'?'HUMAN REVIEW REQUIRED':final;
  }});
  const qualityPrompt=calls.find(c=>c.role==='quality').prompt;
  const managerPrompt=calls.find(c=>c.role==='manager').prompt;
  assert.match(qualityPrompt,/EXCERPT ONLY/);
  assert.match(managerPrompt,/EXCERPT ONLY/);
  assert.ok(qualityPrompt.split(/story/g).length<145);
  assert.ok(managerPrompt.split(/story/g).length<145);
});
test('research inference has a smaller local token budget than script stages',async()=>{
  const responses=[];
  for(const role of ROLES){
    let args;
    await requestRealLocalAgent({role,prompt:'Original English story',fetchImpl:async(url,req)=>{
      args=JSON.parse(req.body);
      return {ok:true,text:async()=>JSON.stringify({message:{content:'safe'}})};
    }});
    responses.push({role,tokens:args.options.num_predict});
  }
  assert.equal(responses.find(x=>x.role==='research').tokens,120);
  assert.ok(responses.filter(x=>x.role!=='research').every(x=>x.tokens===260));
});
