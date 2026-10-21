/**
 * GitHub CI offline integration smoke test:
 * mocked AI agents -> real original typography MP4 via FFmpeg -> SHA-256 verify.
 *
 * NO local neural model; simulation intentionally marked realModelUsed:false.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildAgentVideoPreview} from './agent_to_video_preview.mjs';

const mockScript=readFileSync(new URL('../tests/fixtures/short_script_en.txt',import.meta.url),'utf8');
const mock=async ({role})=>JSON.stringify({
  summary:'Simulated offline editorial proposal; no independent fact verification.',
  ...(role==='research'?{}:{proposedScript:mockScript}),
  claimsToVerify:['Any claimed official announcement must be independently verified'],
});

const root=mkdtempSync(join(tmpdir(),'viralos-agent-mp4-'));
try{
  const result=await buildAgentVideoPreview({
    topic:'A fictional open-world game story',
    sourceUrl:'https://example.org/fiction',
    model:'test-no-neural-model',
    destination:join(root,'agent-video'),
    explicitLocalConsent:true,
    silentPreview:true,
    inference:mock,
  });
  assert.equal(result.agentCount,4);
  assert.equal(result.realModelUsed,false);
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  assert.ok(existsSync(result.outputVideo));
  assert.match(result.draftSha256,/^[a-f0-9]{64}$/);
  const report=JSON.parse(readFileSync(join(result.directory,'agent-proposals-UNVERIFIED.json'),'utf8'));
  assert.equal(report.realModelUsed,false);
  assert.equal(report.factsVerified,false);
  process.stdout.write(JSON.stringify({
    verified:'SIMULATED_AGENT_TO_REAL_OFFLINE_MP4',
    fourMockAgents:true,
    mp4Verified:true,
    realNeuralInference:false,
    published:false,
    appDeployCreditsUsed:0,
  })+'\n');
}finally{
  rmSync(root,{recursive:true,force:true});
}
