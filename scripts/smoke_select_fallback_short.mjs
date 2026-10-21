/**
 * Evidence-preserving offline smoke test:
 * an archived REAL Qwen2.5 draft (already generated in an earlier run) is
 * presented as CREATIVE, later roles are MOCKED as unfit, and the deterministic
 * fallback makes a REAL local kinetic silent MP4. No neural inference here.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runFourRealAgents,MODEL} from './four_real_agents.mjs';
import {buildAgentVideoPreview} from './agent_to_video_preview.mjs';

const archived=readFileSync(new URL('../tests/fixtures/qwen25-real-response.txt',import.meta.url),'utf8');
const root=mkdtempSync(join(tmpdir(),'viralos-select-fallback-'));
const topic='Could a fictional city change gaming?';
const sourceUrl='https://example.org/original-fiction';
const bad='Nineteen words cannot form a complete YouTube Short, so this option is intentionally rejected without changing any valid previous draft.';

try{
  const result=await buildAgentVideoPreview({
    topic,sourceUrl,model:MODEL,destination:join(root,'draft'),
    explicitLocalConsent:true,silentPreview:true,kineticPreview:true,
    realChatAgents:true,
    chatAgentRunner:args=>runFourRealAgents({
      ...args,
      invoke:async ({role})=>role==='creative'?archived:
        role==='research'?'NO_VERIFIED_FACTS. HUMAN_REVIEW_REQUIRED.':bad,
    }),
  });
  const report=JSON.parse(readFileSync(join(result.directory,'agent-proposals-UNVERIFIED.json'),'utf8'));
  assert.equal(result.realModelUsed,false);
  assert.equal(report.realModelUsed,false);
  assert.equal(report.modelCalls,4);
  assert.equal(report.manuscriptFormatPassed,true);
  assert.equal(result.selectedDraftRole,'creative');
  assert.equal(result.manuscriptFormatPassed,true);
  assert.ok(existsSync(result.outputVideo));
  assert.equal(result.visualStyle,'kinetic_procedural');
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  assert.equal(report.publicReleaseAuthorized,false);
  assert.equal(report.selectedDraftSha256,result.selectedDraftSha256);
  process.stdout.write(JSON.stringify({
    result:'ARCHIVED_REAL_MODEL_DRAFT_TO_VERIFIED_MP4',
    originalCreativeSource:'real_Qwen2.5_first_attempt_from_previous_run',
    fourAgentsInThisRun:'SIMULATED',
    realNeuralInferenceInThisRun:false,
    actualKineticMp4Rendered:true,
    chosenRole:result.selectedDraftRole,
    videoSHA256:result.draftSha256,
    ownerApprovalRequired:true,
    publication:false,appDeployCredits:0,
  })+'\n');
}finally{
  rmSync(root,{recursive:true,force:true});
}
