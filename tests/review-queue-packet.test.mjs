import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {makeLocalDraftPlan} from '../scripts/create_draft_plan.mjs';
import {createLocalReviewPacket} from '../scripts/review_queue_packet.mjs';

const text=readFileSync(new URL('./fixtures/qwen25-real-response.txt',import.meta.url),'utf8');
const raw=text.trim().split('\n').map(x=>x.trim()).filter(Boolean).join('\n\n');
const manifest=makeLocalDraftPlan({
 title:'A Fictional City',script:raw,sourceUrl:'https://example.org/fiction',
});
const scriptSha=createHash('sha256').update(raw,'utf8').digest('hex');
const report={
 selectedDraftSha256:scriptSha,selectedDraftRole:'creative',
 rolesExecuted:['creative','research','quality'],
 modelCalls:3,managerModelCallSkipped:true,
 manuscriptFormatPassed:true,publicReleaseAuthorized:false,
 humanApproved:false,published:false,realModelUsed:false,
 provider:'injected_test_provider'
};
const args={
 topic:'A fictional imaginary world',
 sourceUrl:'https://example.org/fiction',manifest,report,
 videoSha256:'b'.repeat(64),visualStyle:'kinetic_procedural'
};

test('review packet is portable data-only, never a publishing or authentication token',()=>{
 const result=createLocalReviewPacket(args);
 assert.equal(result.schemaVersion,1);
 assert.equal(result.kind,'viralos-local-unapproved-review-item');
 assert.equal(result.state,'LOCAL_DRAFT_AWAITING_OWNER_REVIEW');
 assert.equal(result.source,'offline_file_only_not_authenticated_or_synced');
 assert.equal(result.permissions.ownerApproved,false);
 assert.equal(result.permissions.privateYouTubeUploadAuthorized,false);
 assert.equal(result.permissions.publicYouTubeReleaseAuthorized,false);
 assert.equal(result.permissions.canAutomaticallyPublish,false);
 assert.equal(result.canBeImportedIntoAuthenticatedQueueAutomatically,false);
 assert.equal(result.video.relativePath,'preview/short-DRAFT.mp4');
 assert.equal(result.video.width,1080);
 assert.equal(result.video.height,1920);
 assert.equal(result.video.sha256,'b'.repeat(64));
 assert.equal(result.script.sha256,scriptSha);
 assert.equal(result.editorial.localModelCalls,3);
 assert.equal(result.editorial.realNeuralInferenceUsed,false);
 assert.equal(result.editorial.managerModelCallSkipped,true);
 assert.equal(result.reviewChecks.sourceFacts,'NOT_VERIFIED');
 assert.equal(result.reviewChecks.voiceLicense,'NOT_VERIFIED');
});

test('separate agent and video hashes reject script swaps',()=>{
 const forged={...args,report:{...report,selectedDraftSha256:'a'.repeat(64)}};
 assert.throws(()=>createLocalReviewPacket(forged),/provenance changed/);
 assert.throws(()=>createLocalReviewPacket({...args,videoSha256:'invalid'}),/SHA-256/);
});

test('already approved or published results are never exported as pending review',()=>{
 for(const field of ['humanApproved','published','publicReleaseAuthorized']){
   assert.throws(()=>createLocalReviewPacket({
     ...args,report:{...report,[field]:true}
   }),/authorized/);
 }
});

test('schema refuses non-draft input and falsified model-call count',()=>{
 assert.throws(()=>createLocalReviewPacket({
   ...args,manifest:{...manifest,notForPublication:false}
 }),/unapproved source/);
 assert.throws(()=>createLocalReviewPacket({
   ...args,report:{...report,modelCalls:4}
 }),/does not match/);
});

test('review packet keeps original scene text and relative video paths',()=>{
 const out=createLocalReviewPacket(args);
 assert.equal(out.script.text,raw);
 assert.ok(!JSON.stringify(out).includes('/tmp/'));
 assert.ok(!JSON.stringify(out).includes('appdeploy.ai'));
 assert.equal(out.editorial.rolesActuallyInvoked.length,3);
 assert.equal(out.script.selectedDraftRole,'creative');
});
