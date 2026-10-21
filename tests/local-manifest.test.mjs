import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeLocalDraftPlan} from '../scripts/create_draft_plan.mjs';

const input=readFileSync(new URL('./fixtures/short_script_en.txt',import.meta.url),'utf8');
const source='https://example.org/original-story';
test('CLI creates no-publication English 9:16 manifest from text',()=>{
  const manifest=makeLocalDraftPlan({title:'A fictional story',script:input,sourceUrl:source});
  assert.equal(manifest.kind,'viralos-draft-production-plan');
  assert.equal(manifest.notForPublication,true);
  assert.equal(manifest.scenePlan.width,1080);
  assert.equal(manifest.scenePlan.height,1920);
  assert.equal(manifest.scenePlan.fps,30);
  assert.ok(manifest.scenePlan.scenes.length>=3);
  assert.equal(manifest.scenePlan.mediaStatus,'not_generated');
  assert.equal(manifest.scenePlan.voiceStatus,'not_generated');
});
test('rejects unsupported, non-HTTPS, embedded credential or untrusted source',()=>{
  for(const url of ['http://example.org','https://name:pass@example.org/a','ftp://example.org','https://localhost/a']){
    assert.throws(()=>makeLocalDraftPlan({title:'Video',script:input,sourceUrl:url}),/HTTPS|public reference|credentials|normal/);
  }
});
test('refuses invalid title and unsafe project identifiers',()=>{
  assert.throws(()=>makeLocalDraftPlan({title:'',script:input,sourceUrl:source}),/Title/);
  assert.throws(()=>makeLocalDraftPlan({title:'Video',script:input,sourceUrl:source,projectId:'../private'}),/safe/);
});
test('refuses unsaved revision, short script and poor hook',()=>{
  assert.throws(()=>makeLocalDraftPlan({title:'Video',script:input,sourceUrl:source,revision:0}),/positive/);
  assert.throws(()=>makeLocalDraftPlan({title:'Video',script:'too short',sourceUrl:source}),/80–150/);
});
test('real Node CLI creates plan once and refuses to overwrite it',()=>{
  const dir=mkdtempSync(join(tmpdir(),'viralos-plan-'));
  try{
    const file=join(dir,'new-DRAFT.json');
    const args=['--script',new URL('./fixtures/short_script_en.txt',import.meta.url).pathname,
      '--title','Original Story','--source-url',source,'--out',file];
    const cli=resolve('scripts/create_draft_plan.mjs');
    const first=spawnSync(process.execPath,['--experimental-strip-types',cli,...args],{encoding:'utf8'});
    assert.equal(first.status,0,first.stderr);
    assert.ok(existsSync(file));
    const data=JSON.parse(readFileSync(file,'utf8'));
    assert.equal(data.notForPublication,true);
    const before=readFileSync(file,'utf8');
    const second=spawnSync(process.execPath,['--experimental-strip-types',cli,...args],{encoding:'utf8'});
    assert.notEqual(second.status,0);
    assert.equal(readFileSync(file,'utf8'),before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
