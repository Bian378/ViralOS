import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildCandidateRadar,selectOriginalCommentaryTopic} from '../scripts/youtube_candidate_radar.mjs';
import {runSavedTrendToPreview} from '../scripts/run_saved_trend_to_preview.mjs';

const original=JSON.parse(readFileSync(new URL('./fixtures/yt-snapshot-earlier.json',import.meta.url)));
const later=JSON.parse(readFileSync(new URL('./fixtures/yt-snapshot-later.json',import.meta.url)));
const now='2026-10-21T19:10:00Z';
const draft=readFileSync(new URL('./fixtures/short_script_en.txt',import.meta.url),'utf8');
const selected='ABCDEFGHIJK';
const clean=()=>structuredClone(later);
const mock=()=>{
  const calls=[];
  return {calls,inference:async({role})=>{
    calls.push(role);
    return JSON.stringify({
      summary:'Synthetic proposal, independent facts remain unverified.',
      ...(role==='research'?{}:{proposedScript:draft}),
      claimsToVerify:['Verify external product details before any use'],
    });
  }};
};
const fakePython=a=>a[0].includes('build_short_draft')
  ?{status:'UNAPPROVED_DRAFT_LOCAL_ONLY'}
  :{result:'DRAFT_INTEGRITY_CHECK_PASSED',sha256:'a'.repeat(64),
    uploadAllowed:false,publicReleaseAllowed:false};

test('two independent matched readings yield measured views/hour, not a Shorts certification',()=>{
  const radar=buildCandidateRadar({latest:later,earlier:original,asOf:now});
  assert.equal(radar.observationStatus,'TWO_SNAPSHOTS');
  assert.equal(radar.automaticallySuggestedVideoId,selected);
  assert.equal(radar.candidates[0].videoId,selected);
  assert.equal(radar.candidates[0].measuredAddedViews,3700);
  assert.equal(radar.candidates[0].measuredViewsPerHour,3700);
  assert.equal(radar.candidates[0].shortsConfirmed,false);
  assert.equal(radar.rightsStatus,'UNVERIFIED');
  assert.equal(radar.selectionRequiresOwnerAuthorization,true);
});

test('one snapshot produces a popular shortlist but no measured acceleration or automatic choice',()=>{
  const radar=buildCandidateRadar({latest:later,asOf:now});
  assert.equal(radar.observationStatus,'ONE_SNAPSHOT');
  assert.equal(radar.automaticallySuggestedVideoId,null);
  assert.ok(radar.candidates.every(x=>x.observationType==='POPULARITY_ONLY'));
  assert.ok(radar.candidates.every(x=>x.measuredViewsPerHour===undefined));
});

test('counter corrections are not counted as growth',()=>{
  const modified=clean();
  modified.candidates[0].totalViews=2;
  const radar=buildCandidateRadar({latest:modified,earlier:original,asOf:now});
  assert.equal(radar.candidates.find(x=>x.videoId===selected).measuredViewsPerHour,undefined);
  assert.equal(radar.automaticallySuggestedVideoId,null);
});

test('reject mismatched country, invalid interval, stale data and forged source links',()=>{
  assert.throws(()=>buildCandidateRadar({latest:{...later,region:'GB'},earlier:original,asOf:now}),/same region/);
  const tooClose=structuredClone(original);
  tooClose.observedAt='2026-10-21T18:55:00Z';
  tooClose.candidates.forEach(c=>{c.observedAt=tooClose.observedAt;});
  assert.throws(()=>buildCandidateRadar({latest:later,earlier:tooClose,asOf:now}),/15 minutes/);
  assert.throws(()=>buildCandidateRadar({latest:later,earlier:original,asOf:'2026-10-23T20:00:00Z'}),/not current enough/);
  const changed=clean();
  changed.candidates[0].sourceUrl='https://evil.example/ABCDEFGHIJK';
  assert.throws(()=>buildCandidateRadar({latest:changed,asOf:now}),/mismatched candidate/);
});

test('manual selection keeps original commentary only, rejects unknown video',()=>{
  const radar=buildCandidateRadar({latest:later,earlier:original,asOf:now});
  const selection=selectOriginalCommentaryTopic(radar,selected);
  assert.ok(selection.topic.startsWith('Original English commentary'));
  assert.equal(selection.sourceFootageToReuse,false);
  assert.equal(selection.factsVerified,false);
  assert.equal(selection.sourceUrl,'https://www.youtube.com/watch?v='+selected);
  assert.throws(()=>selectOriginalCommentaryTopic(radar,'ZZZZZZZZZZZ'),/not found/);
});

test('four agent actions cannot begin before selected video and explicit consent',async()=>{
  const t=mock();
  await assert.rejects(runSavedTrendToPreview({
    latest:later,earlier:original,videoId:selected,model:'test-model',
    destination:'temporary-unused-folder',allowLocalInference:false,
    inference:t.inference,asOf:now,silentPreview:true,
  }),/authorization/);
  await assert.rejects(runSavedTrendToPreview({
    latest:later,earlier:original,videoId:'ZZZZZZZZZZZ',model:'test-model',
    destination:'temporary-unused-folder',allowLocalInference:true,
    inference:t.inference,asOf:now,silentPreview:true,
  }),/not found/);
  assert.equal(t.calls.length,0);
});

test('explicitly picked candidate drives local agent-to-video builder; no rights or upload asserted',async()=>{
  const root=mkdtempSync(join(tmpdir(),'viralos-radar-'));
  try{
    const calls=mock();
    const report=await runSavedTrendToPreview({
      latest:later,earlier:original,videoId:selected,model:'test-model',
      destination:join(root,'preview'),allowLocalInference:true,
      inference:calls.inference,pythonRunner:fakePython,
      asOf:now,silentPreview:true,
    });
    assert.deepEqual(calls.calls,['creative','research','quality','manager']);
    assert.equal(report.sourceVideoId,selected);
    assert.equal(report.viewAccelerationEvidence,'TWO_MATCHING_PUBLIC_COUNTERS');
    assert.equal(report.measuredViewsPerHour,3700);
    assert.equal(report.sourceVideoDownloaded,false);
    assert.equal(report.originalSourceReproductionAuthorized,false);
    assert.equal(report.realModelUsed,false);
    assert.equal(report.uploadAllowed,false);
    assert.equal(report.publicReleaseAllowed,false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
