import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  runLocalAgents, callLocalOllama, agentRoles,
} from '../scripts/local_agent_pipeline.mjs';
import { main as commandLine } from '../scripts/run_local_agents.mjs';

const fixture = readFileSync(new URL('./fixtures/short_script_en.txt', import.meta.url),'utf8');
const sourceUrl = 'https://example.org/fictional-trend';
const topic = 'Could a fictional city change game stories?';
const mockInference = () => {
  const calls = [];
  return {
    calls,
    inference: async ({role,model,prompt}) => {
      calls.push({role,model,prompt});
      if (role === 'research') {
        return JSON.stringify({
          summary:'No internet browsing. Verify all public factual claims before approval.',
          claimsToVerify:['Check any claimed official feature announcement'],
        });
      }
      return JSON.stringify({
        summary:'Original English Short draft for editorial review.',
        proposedScript:fixture,
        claimsToVerify:role === 'manager' ? ['Review ownership and facts'] : [],
      });
    },
  };
};
const input = {topic,sourceUrl,model:'llama3.2:3b',explicitLocalConsent:true};

test('four editorial agents run strictly creative research quality manager',async()=>{
  const mock=mockInference();
  const result=await runLocalAgents({...input,inference:mock.inference});
  assert.deepEqual(mock.calls.map(x=>x.role),agentRoles);
  assert.equal(result.report.agentFindings.length,4);
  assert.equal(result.report.published,false);
  assert.equal(result.report.uploadAuthorized,false);
  assert.equal(result.report.factsVerified,false);
  assert.equal(result.report.mediaRightsVerified,false);
  assert.equal(result.draftManifest.notForPublication,true);
  assert.equal(result.draftManifest.scenePlan.voiceStatus,'not_generated');
});

test('research never pretends source was visited or claims independently verified',async()=>{
  const mock=mockInference();
  const result=await runLocalAgents({...input,inference:mock.inference});
  assert.ok(result.report.allClaimsToVerify.some(x=>x.includes('official')));
  assert.equal(result.report.status,'UNVERIFIED_DRAFT_REQUIRES_HUMAN_REVIEW');
  assert.equal(result.report.realModelUsed,false);
  assert.equal(result.draftManifest.scenePlan.factChecking,'unverified');
});

test('AI model prompts pass prior proposals in order without browsing',async()=>{
  const mock=mockInference();
  await runLocalAgents({...input,inference:mock.inference});
  const research=JSON.parse(mock.calls[1].prompt);
  assert.equal(research.role,'research');
  assert.equal(research.priorAgentProposalsUntrusted.length,1);
  const manager=JSON.parse(mock.calls[3].prompt);
  assert.equal(manager.priorAgentProposalsUntrusted.length,3);
  assert.equal(manager.sourceReferenceUnverified,sourceUrl);
});

test('denies all four calls unless operator explicitly authorizes local inference',async()=>{
  const mock=mockInference();
  await assert.rejects(runLocalAgents({...input,explicitLocalConsent:false,inference:mock.inference}),/consent/);
  assert.equal(mock.calls.length,0);
});

test('stops without retries if an agent returns malformed or risky structure',async()=>{
  const calls=[];
  const inference=async ({role})=>{
    calls.push(role);
    return role === 'research' ? '{"summary":"bad","claimsToVerify":"wrong"}'
      : JSON.stringify({summary:'new',proposedScript:fixture,claimsToVerify:[]});
  };
  await assert.rejects(runLocalAgents({...input,inference}),/invalid finding/);
  assert.deepEqual(calls,['creative','research']);
});

test('invalid final text is rejected by the real Shorts scene-plan constraints',async()=>{
  const inference=async ({role})=>JSON.stringify({
    summary:'Some draft',claimsToVerify:[],
    ...(role==='research'?{}:{proposedScript:role==='manager'?'Only five words here now.':fixture}),
  });
  await assert.rejects(runLocalAgents({...input,inference}),/80–150/);
});

test('only a fixed localhost Ollama endpoint is used, with bounded JSON inference',async()=>{
  let captured=null;
  const fetchImpl=async (url,request)=>{
    captured={url,request};
    return {ok:true,text:async()=>JSON.stringify({response:'{"summary":"ok","claimsToVerify":[]}'})};
  };
  const result=await callLocalOllama({model:'llama3.2:3b',prompt:'An English original Short',fetchImpl});
  assert.equal(captured.url,'http://127.0.0.1:11434/api/generate');
  assert.equal(result,'{"summary":"ok","claimsToVerify":[]}');
  const data=JSON.parse(captured.request.body);
  assert.equal(data.stream,false);
  assert.equal(data.format,'json');
  assert.equal(data.model,'llama3.2:3b');
});

test('rejects insecure topic reference and invalid model before any inference',async()=>{
  const mock=mockInference();
  await assert.rejects(runLocalAgents({...input,sourceUrl:'http://localhost:9000',inference:mock.inference}),/HTTPS/);
  await assert.rejects(runLocalAgents({...input,model:'https://paid.example/api',inference:mock.inference}),/installed local/);
  assert.equal(mock.calls.length,0);
});

test('CLI refuses to run without --allow-local-inference',()=>{
  const done=spawnSync(process.execPath,
    ['--experimental-strip-types','scripts/run_local_agents.mjs',
      '--topic',topic,'--source-url',sourceUrl,'--model','llama3.2:3b',
      '--out-dir','nobody-writes-here'],{encoding:'utf8'});
  assert.notEqual(done.status,0);
  assert.match(done.stderr,/--allow-local-inference/);
});

test('CLI with mock inference writes only unapproved local artifacts and no publishing',async()=>{
  const mock=mockInference();
  const out=mkdtempSync(join(tmpdir(),'viral-agents-'));
  const destination=join(out,'draft');
  try{
    const result=await commandLine([
      '--topic',topic,'--source-url',sourceUrl,'--model','llama3.2:3b',
      '--out-dir',destination,'--allow-local-inference',
    ],args=>runLocalAgents({...args,inference:mock.inference}));
    assert.equal(result.agentCount,4);
    assert.equal(result.publication,'DISABLED');
    assert.ok(existsSync(join(destination,'source-DRAFT.json')));
    const data=JSON.parse(readFileSync(join(destination,'agent-proposals-UNVERIFIED.json'),'utf8'));
    assert.equal(data.published,false);
    assert.equal(data.realModelUsed,false);
    await assert.rejects(commandLine([
      '--topic',topic,'--source-url',sourceUrl,'--model','llama3.2:3b',
      '--out-dir',destination,'--allow-local-inference',
    ],args=>runLocalAgents({...args,inference:mock.inference})),/EEXIST/);
  } finally {rmSync(out,{recursive:true,force:true});}
});
