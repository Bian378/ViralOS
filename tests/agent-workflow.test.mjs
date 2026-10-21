import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentWorkflow, authorizeAgentStage, claimAgentStage,
  completeAgentStage, flagAgentCallFailure, cancelAgentWorkflow, AGENT_STAGE_ORDER,
} from '../src/agent-workflow.ts';
const make = () => createAgentWorkflow({
  workflowId: 'run-a', projectId: 'script-a', projectRevision: 1,
  sourceUrl: 'https://www.youtube.com/watch?v=example',
  createdAt: '2026-10-21T17:00:00Z',
});
const consent = (role = 'creative', claimId = 'claim-1') => ({
  role, claimId, expectedRevision: 1, ownerConsented: true,
  quotedCredits: 1, ownerLimitCredits: 2,
});
const result = (role, claimId) => ({
  role, claimId, expectedRevision: 1,
  finding: { summary: 'Draft complete, facts require checking.', claimsToVerify: ['Trailer release date'] },
});

test('new workflow has four ordered waiting roles and no publish status', () => {
  const run = make();
  assert.deepEqual(run.stages.map(s => s.role), AGENT_STAGE_ORDER);
  assert.ok(run.stages.every(s => s.status === 'waiting'));
  assert.equal(run.status, 'planning');
  assert.equal('published' in run, false);
});
test('owner consent and known cost are mandatory', () => {
  const run = make();
  assert.throws(() => authorizeAgentStage(run, {...consent(), ownerConsented: false}), /consent/);
  assert.throws(() => authorizeAgentStage(run, {...consent(), quotedCredits: null}), /Known cost/);
  assert.throws(() => authorizeAgentStage(run, {...consent(), ownerLimitCredits: null}), /Known cost/);
  assert.throws(() => authorizeAgentStage(run, {...consent(), quotedCredits: 3}), /Known cost/);
  assert.throws(() => authorizeAgentStage(run, {...consent(), rolePaused: true}), /paused/);
});
test('revision pin and strict order prevent stale or premature stages', () => {
  const run = make();
  assert.throws(() => authorizeAgentStage(run, {...consent(), expectedRevision: 2}), /version changed/);
  assert.throws(() => authorizeAgentStage(run, consent('research')), /in order/);
});
test('reserved call cannot be claimed twice and is immutable', () => {
  const original = make();
  const authorized = authorizeAgentStage(original, consent());
  const running = claimAgentStage(authorized, {role:'creative',claimId:'claim-1',expectedRevision:1});
  assert.equal(original.stages[0].status, 'waiting');
  assert.equal(running.stages[0].status, 'running');
  assert.throws(() => claimAgentStage(running, {role:'creative',claimId:'claim-1',expectedRevision:1}), /unused/);
  assert.throws(() => authorizeAgentStage(running, consent()), /already/);
});
test('all four stages yield proposals only, never owner approval or publication', () => {
  let run = make();
  for (const [index,role] of AGENT_STAGE_ORDER.entries()) {
    const id='claim-'+(index+1);
    run=authorizeAgentStage(run,consent(role,id));
    run=claimAgentStage(run,{role,claimId:id,expectedRevision:1});
    run=completeAgentStage(run,result(role,id));
  }
  assert.equal(run.status,'awaiting_owner_review');
  assert.ok(run.stages.every(s=>s.status==='complete'));
  assert.equal('published' in run,false);
  assert.throws(()=>authorizeAgentStage(run,consent()),/not accepting/);
});
test('failed charged-unknown call stops further retries', () => {
  let run=authorizeAgentStage(make(),consent());
  run=claimAgentStage(run,{role:'creative',claimId:'claim-1',expectedRevision:1});
  run=flagAgentCallFailure(run,{role:'creative',claimId:'claim-1',expectedRevision:1});
  assert.equal(run.stages[0].status,'needs_operator_review');
  assert.throws(()=>authorizeAgentStage(run,consent('creative','claim-2')),/already/);
});
test('malformed output is rejected without completing stage', () => {
  let run=authorizeAgentStage(make(),consent());
  run=claimAgentStage(run,{role:'creative',claimId:'claim-1',expectedRevision:1});
  assert.throws(()=>completeAgentStage(run,{...result('creative','claim-1'),finding:{summary:'',claimsToVerify:[]}}),/Invalid/);
  assert.equal(run.stages[0].status,'running');
});
test('cancelled workflow denies later calls', () => {
  const run=cancelAgentWorkflow(make());
  assert.equal(run.status,'cancelled');
  assert.throws(()=>authorizeAgentStage(run,consent()),/not accepting/);
});
