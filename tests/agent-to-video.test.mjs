import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildAgentVideoPreview} from '../scripts/agent_to_video_preview.mjs';

const fixture=readFileSync(new URL('./fixtures/short_script_en.txt',import.meta.url),'utf8');
const base=(root)=>({
  topic:'A fictional open-world game idea',
  sourceUrl:'https://example.org/fictional-world',
  model:'llama3.2:3b',
  destination:join(root,'new-draft'),
  explicitLocalConsent:true,
  silentPreview:true,
});
const fakeInfer=()=>{
  const order=[];
  return {
    order,
    inference:async ({role})=>{
      order.push(role);
      return JSON.stringify({
        summary:'Unverified editorial review. Do not publish.',
        ...(role==='research'?{}:{proposedScript:fixture}),
        claimsToVerify:['Confirm any factual content in the story'],
      });
    },
  };
};
function simulatePython(steps, fail=false){
  return (args)=>{
    steps.push(args);
    if(fail)throw new Error('Encoder intentionally failed');
    return args[0].includes('build_short_draft')
      ? {status:'UNAPPROVED_DRAFT_LOCAL_ONLY'}
      : {result:'DRAFT_INTEGRITY_CHECK_PASSED',sha256:'a'.repeat(64),
          uploadAllowed:false,publicReleaseAllowed:false};
  };
}
async function inFolder(fn){
  const root=mkdtempSync(join(tmpdir(),'viral-pipe-'));
  try{await fn(root);}
  finally{rmSync(root,{recursive:true,force:true});}
}

test('operator approved simulation binds four mock agents to unapproved video pipeline',()=>inFolder(async root=>{
  const mock=fakeInfer(),steps=[];
  const result=await buildAgentVideoPreview({
    ...base(root),inference:mock.inference,pythonRunner:simulatePython(steps),
  });
  assert.deepEqual(mock.order,['creative','research','quality','manager']);
  assert.equal(steps.length,2);
  assert.equal(steps[0][0],'worker/build_short_draft.py');
  assert.equal(steps[1][0],'worker/verify_draft.py');
  assert.ok(steps[0].includes('--silent-preview'));
  assert.equal(result.agentCount,4);
  assert.equal(result.realModelUsed,false);
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  assert.equal(result.audioGeneratedByAI,false);
  assert.equal(result.captionsSynchronizedToSpeech,false);
  const manifest=JSON.parse(readFileSync(join(result.directory,'source-DRAFT.json'),'utf8'));
  assert.equal(manifest.notForPublication,true);
}));

test('explicit consent is checked before any model calls',()=>inFolder(async root=>{
  const mock=fakeInfer(),steps=[];
  await assert.rejects(buildAgentVideoPreview({
    ...base(root), explicitLocalConsent:false,
    inference:mock.inference,pythonRunner:simulatePython(steps),
  }),/Explicit consent/);
  assert.equal(mock.order.length,0);
  assert.equal(steps.length,0);
}));

test('refuses existing output folder without starting model',()=>inFolder(async root=>{
  const mock=fakeInfer();
  await assert.rejects(buildAgentVideoPreview({
    ...base(root),destination:root,inference:mock.inference,
    pythonRunner:simulatePython([]),
  }),/must not already exist/);
  assert.deepEqual(mock.order,[]);
}));

test('licensed audio is mandatory, and silent/audio options are mutually exclusive',()=>inFolder(async root=>{
  const mock=fakeInfer();
  await assert.rejects(buildAgentVideoPreview({
    ...base(root),silentPreview:false,narration:'voice.wav',
    inference:mock.inference,pythonRunner:simulatePython([]),
  }),/rights check/);
  await assert.rejects(buildAgentVideoPreview({
    ...base(root),silentPreview:true,narration:'voice.wav',
    audioRightsChecked:true,inference:mock.inference,pythonRunner:simulatePython([]),
  }),/exactly one audio option/);
  assert.equal(mock.order.length,0);
}));

test('failed encoder leaves no partial draft and no publishing',()=>inFolder(async root=>{
  const mock=fakeInfer(),steps=[];
  const args={...base(root),inference:mock.inference,pythonRunner:simulatePython(steps,true)};
  await assert.rejects(buildAgentVideoPreview(args),/Encoder intentionally failed/);
  assert.equal(existsSync(args.destination),false);
  assert.equal(steps.length,1);
}));

test('integrity verification rejects upload safety bypass and removes incomplete bundle',()=>inFolder(async root=>{
  const mock=fakeInfer();
  const args={...base(root),inference:mock.inference,pythonRunner:(params)=>
    params[0].includes('build_short_draft') ? {status:'UNAPPROVED_DRAFT_LOCAL_ONLY'}:
      {result:'DRAFT_INTEGRITY_CHECK_PASSED',uploadAllowed:true,publicReleaseAllowed:false},
  };
  await assert.rejects(buildAgentVideoPreview(args),/integrity or publication safety/);
  assert.equal(existsSync(args.destination),false);
}));

test('no silent publishing or implicit voice generation is represented in report',()=>inFolder(async root=>{
  const mock=fakeInfer();
  const result=await buildAgentVideoPreview({
    ...base(root),inference:mock.inference,pythonRunner:simulatePython([]),
  });
  assert.equal(result.status,'UNVERIFIED_DRAFT_REQUIRES_HUMAN_REVIEW');
  assert.equal(result.factsChecked,false);
  assert.equal(result.licensedMediaVerified,false);
  assert.equal(result.appDeployCreditsUsed,0);
}));


test('optional procedural motion flag reaches offline video worker without changing publication rules',()=>inFolder(async root=>{
  const mock=fakeInfer(),steps=[];
  const result=await buildAgentVideoPreview({
    ...base(root),
    kineticPreview:true,
    inference:mock.inference,pythonRunner:simulatePython(steps),
  });
  assert.ok(steps[0].includes('--kinetic-preview'));
  assert.equal(result.visualStyle,'kinetic_procedural');
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  assert.equal(result.realModelUsed,false);
}));
