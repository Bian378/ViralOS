import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startVideoReview, approveExactVideo,
  authorizeExactPrivateUpload, revokeVideoUploadConsent, canExecutePrivateUpload,
} from '../src/private-upload-gate.ts';

const hash = 'a'.repeat(64);
const owner = 'verified-owner-a';
const proof = () => ({
  projectId: 'project-xyz', manuscriptRevision: 3,
  sha256: hash, bytes: 200000, mimeType: 'video/mp4',
  width: 1080, height: 1920, fps: 30, seconds: 35.5,
  audioPresent: true, captionsSyncedByHuman: true,
  sourceClaimsHumanChecked: true, mediaRightsSelfAttested: true,
});
const approval = () => ({
  authenticatedOwnerId: owner, expectedSha256: hash, expectedRevision: 3,
  explicitHumanApproval: true, timestamp: '2026-10-21T18:00:00Z',
});
const upload = () => ({
  authenticatedOwnerId: owner, expectedSha256: hash, expectedRevision: 3,
  channelId: 'UC'+'X'.repeat(22), title:'Original YouTube Short',
  description:'Original commentary written in English.', privacy:'private',
  explicitSeparateUploadConsent:true, timestamp:'2026-10-21T18:02:00Z',
});
test('only a real verified-format MP4 fingerprint can start review',()=>{
  assert.throws(()=>startVideoReview(owner,{...proof(), sha256:'wrong'}),/Exact saved/);
  assert.throws(()=>startVideoReview(owner,{...proof(), height:1080}),/Exact saved/);
  assert.throws(()=>startVideoReview(owner,{...proof(), seconds:75}),/Exact saved/);
});
test('silent footage and unverified rights or captions cannot enter approval',()=>{
  assert.throws(()=>startVideoReview(owner,{...proof(),audioPresent:false}),/operator fact\/rights/);
  assert.throws(()=>startVideoReview(owner,{...proof(),mediaRightsSelfAttested:false}),/operator fact\/rights/);
  assert.throws(()=>startVideoReview(owner,{...proof(),captionsSyncedByHuman:false}),/operator fact\/rights/);
});
test('starting video review alone permits neither an upload nor public release',()=>{
  const state=startVideoReview(owner,proof());
  assert.equal(state.status,'awaiting_video_review');
  assert.equal(canExecutePrivateUpload(state,owner,3,hash,upload().channelId),false);
  assert.equal('publicUploadAuthorization' in state,false);
});
test('owner identity, exact file digest, revision and physical approval are all required',()=>{
  const r=startVideoReview(owner,proof());
  assert.throws(()=>approveExactVideo(r,{...approval(),authenticatedOwnerId:'attacker'}),/Matching/);
  assert.throws(()=>approveExactVideo(r,{...approval(),expectedSha256:'b'.repeat(64)}),/Matching/);
  assert.throws(()=>approveExactVideo(r,{...approval(),expectedRevision:4}),/Matching/);
  assert.throws(()=>approveExactVideo(r,{...approval(),explicitHumanApproval:false}),/Matching/);
});
test('video approval alone does not authorize private upload',()=>{
  const state=approveExactVideo(startVideoReview(owner,proof()),approval());
  assert.equal(state.status,'video_reviewed');
  assert.equal(canExecutePrivateUpload(state,owner,3,hash,upload().channelId),false);
});
test('only a separate human action for private visibility may authorize upload',()=>{
  const state=approveExactVideo(startVideoReview(owner,proof()),approval());
  assert.throws(()=>authorizeExactPrivateUpload(state,{...upload(),explicitSeparateUploadConsent:false}),/separate/);
  assert.throws(()=>authorizeExactPrivateUpload(state,{...upload(),privacy:'public'}),/separate/);
  assert.throws(()=>authorizeExactPrivateUpload(state,{...upload(),authenticatedOwnerId:'attacker'}),/separate/);
  assert.throws(()=>authorizeExactPrivateUpload(state,{...upload(),channelId:'fake'}),/metadata/);
});
test('grant is bound to exact channel, hash and manuscript revision, never public',()=>{
  const reviewed=approveExactVideo(startVideoReview(owner,proof()),approval());
  const state=authorizeExactPrivateUpload(reviewed,upload());
  assert.equal(state.status,'private_upload_authorized');
  assert.equal(state.privateUploadAuthorization.privacy,'private');
  assert.equal(state.privateUploadAuthorization.action,'private_youtube_upload_only');
  assert.equal(canExecutePrivateUpload(state,owner,3,hash,upload().channelId),true);
  assert.equal(canExecutePrivateUpload(state,owner,4,hash,upload().channelId),false);
  assert.equal(canExecutePrivateUpload(state,owner,3,'b'.repeat(64),upload().channelId),false);
  assert.equal(canExecutePrivateUpload(state,owner,3,hash,'UC'+'A'.repeat(22)),false);
  assert.equal(canExecutePrivateUpload(state,'attacker',3,hash,upload().channelId),false);
});
test('revoke permanently invalidates upload authorization',()=>{
  const original=authorizeExactPrivateUpload(
    approveExactVideo(startVideoReview(owner,proof()),approval()),upload());
  const revoked=revokeVideoUploadConsent(original);
  assert.equal(revoked.status,'revoked');
  assert.equal(revoked.privateUploadAuthorization,undefined);
  assert.equal(canExecutePrivateUpload(revoked,owner,3,hash,upload().channelId),false);
  assert.throws(()=>authorizeExactPrivateUpload(revoked,upload()),/separate/);
});
test('grant never includes a public upload or any API side effect',()=>{
  const granted=authorizeExactPrivateUpload(
    approveExactVideo(startVideoReview(owner,proof()),approval()),upload());
  const json=JSON.stringify(granted);
  assert.ok(!json.includes('public_release_authorized'));
  assert.equal(typeof granted.privateUploadAuthorization.channelId,'string');
  assert.equal(typeof granted.privateUploadAuthorization.authorizedBy,'string');
});
