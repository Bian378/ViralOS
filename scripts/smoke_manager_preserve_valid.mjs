/**
 * True FFmpeg MP4 verification with the 3-call preserve-valid manager policy.
 * The creative text is from an ARCHIVED earlier real Qwen2.5 model response,
 * but ALL three stage responses in THIS smoke test are injected MOCKS.
 * No new Ollama calls, YouTube API, uploads, or paid AppDeploy calls.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runFourRealAgents,MODEL} from './four_real_agents.mjs';
import {buildAgentVideoPreview} from './agent_to_video_preview.mjs';

const archived=readFileSync(new URL('../tests/fixtures/qwen25-real-response.txt',import.meta.url),'utf8');
const root=mkdtempSync(join(tmpdir(),'viralos-preserve-valid-'));
const stages=[];
try{
  const result=await buildAgentVideoPreview({
    topic:'Could an imaginary gaming city change?',
    sourceUrl:'https://example.org/original-fiction',
    model:MODEL,destination:join(root,'preview'),
    explicitLocalConsent:true,realChatAgents:true,
    managerPolicy:'preserve-valid',
    silentPreview:true,kineticPreview:true,
    chatAgentRunner:args=>runFourRealAgents({
      ...args,
      invoke:async({role})=>{
        stages.push(role);
        if(role==='creative')return archived;
        if(role==='research')return 'NO_VERIFIED_FACTS. HUMAN_REVIEW_REQUIRED';
        return 'An unsuitable tiny quality-stage rewrite.';
      },
    }),
  });
  assert.deepEqual(stages,['creative','research','quality']);
  assert.equal(result.modelCalls,3);
  assert.equal(result.agentCount,3);
  assert.equal(result.realModelUsed,false);
  assert.equal(result.managerModelCallSkipped,true);
  assert.equal(result.selectedDraftRole,'creative');
  assert.equal(result.manuscriptFormatPassed,true);
  assert.ok(existsSync(result.outputVideo));
  assert.match(result.draftSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.visualStyle,'kinetic_procedural');
  assert.equal(result.uploadAllowed,false);
  assert.equal(result.publicReleaseAllowed,false);
  const report=JSON.parse(readFileSync(join(result.directory,'agent-proposals-UNVERIFIED.json'),'utf8'));
  assert.equal(report.managerDecision,'deterministic_preserve_valid_draft');
  assert.equal(report.modelCalls,3);
  assert.equal(report.realModelUsed,false);
  assert.equal(report.published,false);
  process.stdout.write(JSON.stringify({
    result:'PRESERVE_VALID_THREE_MOCK_STAGES_REAL_MP4',
    source:'ARCHIVED_QWEN25_GENERATED_MANUSCRIPT',
    actualNeuralModelCallsDuringThisTest:0,
    simulatedAgentResponses:3,
    managerGenerativeCallSkipped:true,
    draftVideoExists:true,videoSha256:result.draftSha256,
    sourceFootageReused:false,publicReleaseAuthorized:false,
    appDeployCreditsUsed:0
  })+'\n');
}finally{rmSync(root,{recursive:true,force:true});}
