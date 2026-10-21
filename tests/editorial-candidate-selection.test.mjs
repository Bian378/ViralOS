import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chooseValidatedEditorialDraft} from '../scripts/editorial_candidate_selection.mjs';
import {runFourRealAgents} from '../scripts/four_real_agents.mjs';

const original=readFileSync(new URL('./fixtures/qwen25-real-response.txt',import.meta.url),'utf8');
const roles=(creative,quality,manager)=>[
  {role:'creative',content:creative},
  {role:'research',content:'NO_VERIFIED_FACTS. HUMAN_REVIEW_REQUIRED'},
  {role:'quality',content:quality},
  {role:'manager',content:manager},
];
const invalid='Only nineteen words will never fill a proper short, no matter who wrote them. A rejection remains necessary.';

test('manager final wins when format-valid (not a factual or rights clearance)',()=>{
  const chosen=chooseValidatedEditorialDraft(roles(original,'short',original));
  assert.equal(chosen.selectedRole,'manager');
  assert.equal(chosen.selectedWasNotManager,false);
  assert.equal(chosen.selectedWords,80);
  assert.equal(chosen.publicReleaseAuthorized,false);
  assert.equal(chosen.independentEnglishReviewPassed,false);
  assert.equal(chosen.mediaRightsVerified,false);
});

test('a manager regression cannot erase a valid earlier creative manuscript',()=>{
  const selected=chooseValidatedEditorialDraft(roles(original,invalid,invalid));
  assert.equal(selected.selectedRole,'creative');
  assert.equal(selected.selectedWords,80);
  assert.equal(selected.selectedWasNotManager,true);
  assert.equal(selected.candidateChecks.find(x=>x.role==='manager').validFormat,false);
  assert.ok(selected.selectedScript.includes('Could This City Change Gaming Forever?'));
  assert.equal(selected.selectedSha256,
    createHash('sha256').update(selected.selectedScript).digest('hex'));
  assert.equal(selected.selectedScript.split(/\s+/).join(' '),
    original.trim().split(/\s+/).join(' '));
});

test('a valid quality revision beats older creative when manager is invalid',()=>{
  const selected=chooseValidatedEditorialDraft(roles(original,original,invalid));
  assert.equal(selected.selectedRole,'quality');
  assert.equal(selected.selectedWasNotManager,true);
});

test('when every script fails, selection produces no renderable draft',()=>{
  const selected=chooseValidatedEditorialDraft(roles(invalid,invalid,invalid));
  assert.equal(selected.selectedRole,null);
  assert.equal(selected.selectedScript,null);
  assert.equal(selected.selectedSha256,null);
  assert.ok(selected.candidateChecks.every(c=>c.validFormat===false));
});

test('research flags must NEVER be interpreted as eligible narration',()=>{
  const selection=chooseValidatedEditorialDraft([
    {role:'creative',content:invalid},
    {role:'research',content:original},
    {role:'quality',content:invalid},
    {role:'manager',content:invalid},
  ]);
  assert.equal(selection.selectedRole,null);
  assert.deepEqual(selection.candidateChecks.map(x=>x.role),
    ['manager','quality','creative']);
});

test('rejects duplicate, unknown and huge candidate stages',()=>{
  assert.throws(()=>chooseValidatedEditorialDraft([
    {role:'creative',content:original},{role:'creative',content:original}
  ]),/Malformed/);
  assert.throws(()=>chooseValidatedEditorialDraft([{role:'uploader',content:original}]),/Malformed/);
  assert.throws(()=>chooseValidatedEditorialDraft([{role:'manager',content:'a'.repeat(4501)}]),/Malformed/);
});

test('selection is deterministic and never modifies preserved original model output',()=>{
  const data=roles(original,invalid,invalid);
  const copy=JSON.stringify(data);
  const a=chooseValidatedEditorialDraft(data),b=chooseValidatedEditorialDraft(data);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify(data),copy);
});

test('real four-role adapter falls back to valid creative, without changing manager output',async()=>{
  const results=await runFourRealAgents({
    topic:'A fictional city that remembers its people',
    sourceUrl:'https://example.org/fiction',
    explicitLocalConsent:true,
    invoke:async ({role})=>role==='creative'?original:
      role==='research'?'HUMAN_REVIEW_REQUIRED':invalid,
  });
  assert.ok(results.draftManifest);
  assert.equal(results.draftManifest.notForPublication,true);
  assert.equal(results.report.selectedDraftRole,'creative');
  assert.equal(results.report.finalWordCount,invalid.split(/\s+/).length);
  assert.equal(results.report.selectedWordCount,80);
  assert.equal(results.report.selectedDraftFromPriorAgent,true);
  assert.equal(results.report.manuscriptFormatPassed,true);
  assert.equal(results.report.stageResults[3].content,invalid);
  assert.equal(results.report.realModelUsed,false);
  assert.equal(results.report.factsIndependentlyVerified,false);
  assert.equal(results.report.publicReleaseAuthorized,false);
});

test('four-role adapter fails closed when all candidate scripts invalid',async()=>{
  const result=await runFourRealAgents({
    topic:'A fictional city that remembers its people',
    sourceUrl:'https://example.org/fiction',
    explicitLocalConsent:true,
    invoke:async ({role})=>role==='research'?'NOT CHECKED':invalid,
  });
  assert.equal(result.draftManifest,null);
  assert.equal(result.report.selectedDraftRole,null);
  assert.equal(result.report.manuscriptFormatPassed,false);
  assert.equal(result.report.status,'MANUSCRIPT_REJECTED_BY_VALIDATOR');
  assert.equal(result.report.publicReleaseAuthorized,false);
});
