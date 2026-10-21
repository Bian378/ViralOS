import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLocalReviewPacket} from '../scripts/review_queue_packet.mjs';
import {makeLocalDraftPlan} from '../scripts/create_draft_plan.mjs';
import {
  importVerifiedLocalReviewPacket,applyOwnerReviewDecision,listOwnerReviews,
} from '../src/review-inbox.ts';

const script=readFileSync(new URL('./fixtures/qwen25-real-response.txt',import.meta.url),'utf8')
  .trim().split('\n').map(s=>s.trim()).filter(Boolean).join('\n\n');
const manifest=makeLocalDraftPlan({
  title:'Fictional Game World',script,sourceUrl:'https://example.org/fiction',
});
const originalReport={
  rolesExecuted:['creative','research','quality'],
  modelCalls:3,managerModelCallSkipped:true,
  realModelUsed:false,
  selectedDraftRole:'creative',
  publicReleaseAuthorized:false,humanApproved:false,published:false,
  provider:'injected_test_provider',manuscriptFormatPassed:true,
};
const digest='a'.repeat(64);
const packet=createLocalReviewPacket({
  topic:'Imaginary fictional game',
  sourceUrl:'https://example.org/fiction',
  manifest,report:originalReport,
  videoSha256:digest,visualStyle:'kinetic_procedural'
});
const owner='verified-user-12345',other='other-owner-98765';
const ctx={
  authenticatedOwnerId:owner,queueId:'review-queue-01',
  storedMp4Sha256:digest,exactByteVerificationPassed:true,
  importedAt:'2026-10-21T19:00:00Z'
};
const reviewArgs=(item)=>({
 authenticatedOwnerId:owner,
 expectedVersion:item.version,expectedVideoSha256:item.video.storedSha256,
 explicitOwnerAction:true,reviewedAt:'2026-10-21T19:05:00Z'
});
const allTrue={
 factsChecked:true,originalAndMediaRightsChecked:true,
 voiceRightsChecked:true,captionsSyncedToSpokenAudio:true,
 finalVideoWatched:true
};
const blank={...allTrue,voiceRightsChecked:false};

test('unapproved local packet imports only with independent server media checksum',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 assert.equal(item.state,'awaiting_owner_review');
 assert.equal(item.ownerId,owner);
 assert.equal(item.version,1);
 assert.equal(item.manuscript.words,80);
 assert.equal(item.video.storedSha256,digest);
 assert.equal(item.permissions.canPublish,false);
 assert.equal(item.permissions.canUploadToYouTube,false);
 assert.equal(item.permissions.privateUploadAuthorized,false);
 assert.equal(item.reviewHistory.length,0);
 assert.equal(item.checks.finalVideoWatched,false);
});
test('forged local owner identity is ignored; server identity owns queue entry',()=>{
 const untrusted={...packet,ownerId:other,permissions:{...packet.permissions}};
 const item=importVerifiedLocalReviewPacket(untrusted,ctx);
 assert.equal(item.ownerId,owner);
 assert.equal('ownerId' in packet,false);
});
test('import fails closed on unverified media, changed bytes, non-draft or fake permissions',()=>{
 const cases=[
  [packet,{...ctx,storedMp4Sha256:'b'.repeat(64)}],
  [packet,{...ctx,exactByteVerificationPassed:false}],
  [{...packet,permissions:{...packet.permissions,ownerApproved:true}},ctx],
  [{...packet,canBeImportedIntoAuthenticatedQueueAutomatically:true},ctx],
  [{...packet,video:{...packet.video,relativePath:'../video.mp4'}},ctx],
  [{...packet,script:{...packet.script,text:'Changed source words'}},ctx],
  [{...packet,editorial:{...packet.editorial,localModelCalls:4}},ctx],
 ];
 for(const [untrusted,context] of cases)
   assert.throws(()=>importVerifiedLocalReviewPacket(untrusted,context));
});
test('review actions require exact owner, immutable video digest, version and explicit human action',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 const base=reviewArgs(item);
 const invalid=[
  {...base,authenticatedOwnerId:other},
  {...base,expectedVersion:2},
  {...base,expectedVideoSha256:'b'.repeat(64)},
  {...base,explicitOwnerAction:false},
  {...base,reviewedAt:'invalid'},
 ];
 for(const input of invalid)
   assert.throws(()=>applyOwnerReviewDecision(item,input,'mark_video_reviewed',allTrue,'Checked'),/Authenticated/);
});
test('human full checklist required; quality gate cannot be inferred from AI report',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 assert.throws(()=>applyOwnerReviewDecision(item,reviewArgs(item),
   'mark_video_reviewed',blank,'OK'),/All human/);
 const approved=applyOwnerReviewDecision(item,reviewArgs(item),
   'mark_video_reviewed',allTrue,'Personally reviewed');
 assert.equal(approved.state,'video_reviewed_no_upload_permission');
 assert.equal(approved.version,2);
 assert.equal(approved.permissions.canPublish,false);
 assert.equal(approved.permissions.canUploadToYouTube,false);
 assert.equal(approved.permissions.privateUploadAuthorized,false);
 assert.equal(item.state,'awaiting_owner_review'); // immutable state changes
 assert.equal(approved.reviewHistory[0].action,'mark_video_reviewed');
 assert.throws(()=>applyOwnerReviewDecision(approved,reviewArgs(approved),
   'mark_video_reviewed',allTrue,'Repeat'),/already decided/);
});
test('request changes records comment and irrevocably blocks that revision',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 assert.throws(()=>applyOwnerReviewDecision(item,reviewArgs(item),
   'request_changes',blank,'  '),/concrete reviewer comment/);
 const changed=applyOwnerReviewDecision(item,reviewArgs(item),
   'request_changes',blank,'Rewrite factual claim in second scene');
 assert.equal(changed.state,'changes_requested');
 assert.equal(changed.reviewHistory[0].comment,'Rewrite factual claim in second scene');
 assert.equal(changed.permissions.canPublish,false);
 assert.throws(()=>applyOwnerReviewDecision(changed,reviewArgs(changed),
   'mark_video_reviewed',allTrue,'Fixed'),/already decided/);
});
test('stale compare-and-swap version cannot make a second review transition',()=>{
 const first=importVerifiedLocalReviewPacket(packet,ctx);
 const done=applyOwnerReviewDecision(first,reviewArgs(first),
   'request_changes',blank,'Need revision');
 assert.throws(()=>applyOwnerReviewDecision(done,reviewArgs(first),
   'mark_video_reviewed',allTrue,'Try again'),/Authenticated/);
});
test('list projection never shows another owner items or private story text',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 const otherItem=importVerifiedLocalReviewPacket(packet,{
   ...ctx,authenticatedOwnerId:other,queueId:'other-review-queue-2'
 });
 const own=listOwnerReviews([item,otherItem],owner);
 assert.equal(own.length,1);
 assert.equal(own[0].id,item.id);
 assert.equal(own[0].hasPublishPermission,false);
 assert.equal(own[0].hasUploadPermission,false);
 assert.equal('manuscript' in own[0],false);
 assert.deepEqual(listOwnerReviews([item,otherItem],other).map(x=>x.id),[otherItem.id]);
});
test('inbox is not a private upload authorization even after human editorial review',()=>{
 const item=importVerifiedLocalReviewPacket(packet,ctx);
 const approved=applyOwnerReviewDecision(item,reviewArgs(item),
   'mark_video_reviewed',allTrue,'Explicit review');
 const serialized=JSON.stringify(approved);
 assert.ok(!serialized.includes('private_youtube_upload_only'));
 assert.ok(!serialized.includes('public_release_authorized'));
 assert.equal(approved.permissions.canUploadToYouTube,false);
});
