import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectOriginalScript, askLocalQwen, runRealScriptTrial, MODEL } from '../scripts/real_qwen25_short.mjs';

const valid=readFileSync(new URL('./fixtures/short_script_en.txt',import.meta.url),'utf8');
function withDirectory(fn){
  const base=mkdtempSync(join(tmpdir(),'viralos-qwen25-'));
  return Promise.resolve().then(()=>fn(base)).finally(()=>rmSync(base,{recursive:true,force:true}));
}
test('the real storyboard determines script validity rather than a mock flag',()=>{
  const good=inspectOriginalScript(valid);
  assert.equal(good.valid,true);
  assert.equal(good.manifest.scenePlan.height,1920);
  assert.equal(good.manifest.notForPublication,true);
  assert.equal(inspectOriginalScript('far too short').valid,false);
  assert.equal(inspectOriginalScript(Array(672).fill('word').join(' ')).valid,false);
  assert.equal(inspectOriginalScript(String.fromCharCode(96,96,96)+'text\n'+valid+'\n').valid,false);
});
test('first valid model proposal stops further calls and writes unapproved draft',()=>withDirectory(async base=>{
  let calls=0;
  const result=await runRealScriptTrial({outputDir:join(base,'one'),invoke:async()=>{calls++;return valid;}});
  assert.equal(result.pass,true);
  assert.equal(calls,1);
  const folder=join(base,'one');
  assert.equal(JSON.parse(readFileSync(join(folder,'source-DRAFT.json'))).notForPublication,true);
  const report=JSON.parse(readFileSync(join(folder,'real-language-model-QC.json')));
  assert.equal(report.publicReleaseAuthorized,false);
  assert.equal(report.humanApproved,false);
  assert.equal(report.contentFactsVerified,false);
}));
test('one rejected proposal gets at most one new request then stops',()=>withDirectory(async base=>{
  let calls=0;
  const result=await runRealScriptTrial({outputDir:join(base,'two'),invoke:async()=>++calls===1?'short script':valid});
  assert.equal(result.pass,true);
  assert.equal(result.attemptCount,2);
  assert.equal(calls,2);
  const r=JSON.parse(readFileSync(join(base,'two','real-language-model-QC.json')));
  assert.equal(r.attempts[0].valid,false);
  assert.equal(r.attempts[1].valid,true);
}));
test('two invalid outputs never produce a renderable manuscript',()=>withDirectory(async base=>{
  const dest=join(base,'invalid');
  const result=await runRealScriptTrial({outputDir:dest,invoke:async()=>Array(180).fill('bad').join(' ')});
  assert.equal(result.pass,false);
  assert.equal(result.attemptCount,2);
  assert.equal(existsSync(join(dest,'source-DRAFT.json')),false);
  assert.equal(JSON.parse(readFileSync(join(dest,'real-language-model-QC.json'))).published,false);
}));
test('local provider failure never retries or claims accepted manuscript',()=>withDirectory(async base=>{
  let calls=0;
  const result=await runRealScriptTrial({outputDir:join(base,'server-fail'),invoke:async()=>{calls++;throw Error('HTTP 500');}});
  assert.equal(result.pass,false);
  assert.equal(calls,1);
  assert.equal(result.attemptCount,1);
}));
test('trial refuses existing output folder and excessive local calls',()=>withDirectory(async base=>{
  await assert.rejects(runRealScriptTrial({outputDir:base,invoke:async()=>valid}),/EEXIST/);
  await assert.rejects(runRealScriptTrial({outputDir:join(base,'excess'),attemptLimit:3,invoke:async()=>valid}),/one or two/);
}));
test('provider request is only localhost, not a paid cloud endpoint',async()=>{
  let seen,body;
  const script=await askLocalQwen({prompt:'Original fiction only',fetchImpl:async(url,opts)=>{
    seen=url;body=JSON.parse(opts.body);
    return {ok:true,text:async()=>JSON.stringify({message:{content:valid}})};
  }});
  assert.equal(seen,'http://127.0.0.1:11434/api/chat');
  assert.equal(body.model,MODEL);
  assert.equal(body.stream,false);
  assert.equal(body.messages[0].role,'system');
  assert.equal(script,valid);
});
