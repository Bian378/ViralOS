/**
 * CI demonstration: synthetic snapshots -> explicitly selected topic ->
 * FOUR mocked agent suggestions -> ACTUAL H.264 MP4 -> integrity check.
 * Not real trend discovery, not real LLM inference, not public release.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runSavedTrendToPreview} from './run_saved_trend_to_preview.mjs';

const earlier=JSON.parse(readFileSync(new URL('../tests/fixtures/yt-snapshot-earlier.json',import.meta.url)));
const latest=JSON.parse(readFileSync(new URL('../tests/fixtures/yt-snapshot-later.json',import.meta.url)));
const script=readFileSync(new URL('../tests/fixtures/short_script_en.txt',import.meta.url),'utf8');
const mock=async({role})=>JSON.stringify({
  summary:'Synthetic original English proposal. Facts still unchecked.',
  ...(role==='research'?{}:{proposedScript:script}),
  claimsToVerify:['Check all outside sources before publication'],
});
const root=mkdtempSync(join(tmpdir(),'viralos-radar-demo-'));
try{
  const result=await runSavedTrendToPreview({
    latest,earlier,asOf:'2026-10-21T19:10:00Z',
    videoId:'ABCDEFGHIJK',model:'ci-synthetic-no-model',
    destination:join(root,'draft'),silentPreview:true,
    allowLocalInference:true,inference:mock,
  });
  assert.equal(result.measuredViewsPerHour,3700);
  assert.equal(result.realModelUsed,false);
  assert.ok(existsSync(result.outputVideo));
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  process.stdout.write(JSON.stringify({
    verified:'SYNTHETIC_TREND_TO_MOCK_AGENTS_TO_REAL_MP4',
    videoFileSha256:result.draftSha256,
    measuredVelocityFromSyntheticCounters:3700,
    realTrendDataUsed:false,realNeuralInference:false,
    shortsClassificationVerified:false,publicRelease:false,
    appDeployCreditsUsed:0,youtubeApiCalls:0,
  })+'\n');
}finally{rmSync(root,{recursive:true,force:true});}
