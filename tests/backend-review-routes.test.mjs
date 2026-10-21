/**
 * Offline integration-style test of the ACTUAL AppDeploy review routes using
 * a tiny isolated transactional DB adapter. The real AppDeploy SDK is mocked.
 * No network / hosted account / real auth or media storage is used.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLocalReviewPacket} from '../scripts/review_queue_packet.mjs';
import {makeLocalDraftPlan} from '../scripts/create_draft_plan.mjs';

const owner='authenticated-owner-123',stranger='authenticated-other-456';
const sha='c'.repeat(64);
const fixture=readFileSync(new URL('./fixtures/qwen25-real-response.txt',import.meta.url),'utf8')
  .trim().split('\n').map(x=>x.trim()).filter(Boolean).join('\n\n');
const packet=createLocalReviewPacket({
 topic:'An original fictional game city',
 sourceUrl:'https://example.org/fiction',
 manifest:makeLocalDraftPlan({
  title:'Imaginary Game City',script:fixture,sourceUrl:'https://example.org/fiction'
 }),
 report:{
  rolesExecuted:['creative','research','quality'],
  modelCalls:3,managerModelCallSkipped:true,
  selectedDraftRole:'creative',realModelUsed:false,
  publicReleaseAuthorized:false,humanApproved:false,published:false,
 },
 videoSha256:sha,visualStyle:'kinetic_procedural'
});

function fakeDatabase(){
 const tables=new Map();
 const table=name=>{
   if(!tables.has(name))tables.set(name,new Map());
   return tables.get(name);
 };
 const clone=()=>new Map([...tables].map(([name,rows])=>
   [name,new Map([...rows].map(([key,value])=>[key,structuredClone(value)]))]));
 const op=(kind,name,rows,opts={})=>{
  const candidate={kind,name,rows,opts,
   then(resolve,reject){
    try {resolve(apply([candidate]));}catch(e){reject(e);}
   }};
  return candidate;
 };
 const apply=ops=>{
  const shadow=clone();
  const t=name=>{
    if(!shadow.has(name))shadow.set(name,new Map());
    return shadow.get(name);
  };
  const responses=[];
  for(const current of ops){
    const rows=t(current.name);
    let count=0;
    for(const r of current.rows){
      const existing=rows.get(r.id);
      if(current.kind==='add'){
        if(existing)throw Error('duplicate-record');
        rows.set(r.id,structuredClone(r));count++;
      }else if(current.kind==='update'){
        if(!existing)throw Error('missing-record');
        for(const [key,value] of Object.entries(r.if??{}))
          if(existing[key]!==value)throw Error('conflicting-version');
        rows.set(r.id,{...existing,...structuredClone(r.record)});count++;
      }else throw Error('unknown DB operation');
    }
    responses.push(Array(count).fill(true));
  }
  tables.clear();
  for(const [name,rows] of shadow)tables.set(name,rows);
  return ops.length===1?responses[0]:responses;
 };
 return {
  tx:{
    add:(name,rows)=>op('add',name,rows),
    update:(name,rows,opts)=>op('update',name,rows,opts),
  },
  get:async(name,ids)=>ids.map(id=>structuredClone(table(name).get(id)??null)),
  transact:async ops=>apply(ops),
  testTamper:(name,id,data)=>table(name).set(id,data),
 };
}

const tmp=mkdtempSync(join(tmpdir(),'viralos-routes-'));
const fake=fakeDatabase();
globalThis.__viralReviewDb=fake;
const bundle=join(tmp,'review-routes-bundled.mjs');
await build({
 entryPoints:['backend/review-routes.ts'],
 bundle:true,platform:'node',format:'esm',target:'node22',
 outfile:bundle,logLevel:'silent',
 plugins:[{
  name:'mock-appdeploy-sdk',
  setup(buildTool){
   buildTool.onResolve({filter:/^@appdeploy\/sdk$/},()=>({path:'mock',namespace:'mock-sdk'}));
   buildTool.onLoad({filter:/.*/,namespace:'mock-sdk'},()=>({
    contents:[
      'export const db=globalThis.__viralReviewDb;',
      'export const requireAuth=()=>({requiredAuth:true});',
      'export const json=(value,status=200)=>({statusCode:status,body:JSON.stringify(value)});',
      'export const error=(message,status=400)=>({statusCode:status,body:JSON.stringify({error:message})});',
      'export const isAppDatabaseError=()=>false;'
    ].join('\n'),
    loader:'js'
   }));
  }
 }]
});
const {createReviewInboxRoutes,trustedAddStoredReview}=await import(pathToFileURL(bundle).href);
const routes=createReviewInboxRoutes();
const context=(who=owner,id='secure-review-123')=>({
 authenticatedOwnerId:who,queueId:id,storedMp4Sha256:sha,
 exactByteVerificationPassed:true,importedAt:'2026-10-21T20:00:00Z'
});
const endpoint=(name,who=owner,id='secure-review-123',body={})=>
  routes[name][1]({user:{userId:who},params:{id},body});
const body=result=>JSON.parse(result.body);
const checks={
 factsChecked:true,originalAndMediaRightsChecked:true,voiceRightsChecked:true,
 captionsSyncedToSpokenAudio:true,finalVideoWatched:true
};

test('all routes require authentication and expose no untrusted import/upload operation',()=>{
 assert.deepEqual(Object.keys(routes).sort(),[
  'GET /api/video-reviews','GET /api/video-reviews/:id',
  'POST /api/video-reviews/:id/decision'
 ].sort());
 for(const handlers of Object.values(routes))assert.equal(handlers[0].requiredAuth,true);
});
test('server-only trusted import creates owner-index and refuses mismatched media hash',async()=>{
 await assert.rejects(trustedAddStoredReview(packet,{...context(),storedMp4Sha256:'b'.repeat(64)}),/changed/);
 const created=await trustedAddStoredReview(packet,context());
 assert.equal(created.ownerId,owner);
 assert.equal(created.version,1);
 const list=await endpoint('GET /api/video-reviews');
 assert.equal(list.statusCode,200);
 assert.equal(body(list).items.length,1);
 assert.equal(body(list).items[0].hasUploadPermission,false);
 assert.equal(body(list).publishingEnabled,false);
 assert.equal(body(list).storageEnabled,false);
});
test('another user cannot list, retrieve or decide foreign reviews',async()=>{
 const list=await endpoint('GET /api/video-reviews',stranger);
 assert.equal(list.statusCode,200);
 assert.deepEqual(body(list).items,[]);
 const detail=await endpoint('GET /api/video-reviews/:id',stranger);
 assert.equal(detail.statusCode,404);
 const modify=await endpoint('POST /api/video-reviews/:id/decision',stranger,undefined,{
  decision:'mark_video_reviewed',expectedVersion:1,expectedVideoSha256:sha,
  explicitOwnerAction:true,checks,comment:'all checked'
 });
 assert.equal(modify.statusCode,404);
});
test('exact version and SHA plus complete owner checklist are required',async()=>{
 const invalidInputs=[
  {expectedVersion:1,expectedVideoSha256:sha,checks:{...checks,voiceRightsChecked:false}},
  {expectedVersion:0,expectedVideoSha256:sha,checks},
  {expectedVersion:1,expectedVideoSha256:'b'.repeat(64),checks},
 ];
 for(const invalid of invalidInputs){
  const result=await endpoint('POST /api/video-reviews/:id/decision',owner,undefined,{
    decision:'mark_video_reviewed',explicitOwnerAction:true,comment:'Checked',...invalid
  });
  assert.equal(result.statusCode,409);
 }
});
test('owner can request changes once; CAS prevents concurrent override and upload',async()=>{
 const result=await endpoint('POST /api/video-reviews/:id/decision',owner,undefined,{
  decision:'request_changes',expectedVersion:1,expectedVideoSha256:sha,
  explicitOwnerAction:true,checks:{...checks,voiceRightsChecked:false},
  comment:'Voice rights not verified'
 });
 assert.equal(result.statusCode,200);
 assert.equal(body(result).state,'changes_requested');
 assert.equal(body(result).version,2);
 assert.equal(body(result).permissions.canPublish,false);
 assert.equal(body(result).permissions.canUploadToYouTube,false);
 const repeat=await endpoint('POST /api/video-reviews/:id/decision',owner,undefined,{
  decision:'mark_video_reviewed',expectedVersion:1,expectedVideoSha256:sha,
  explicitOwnerAction:true,checks,comment:'Second reviewer'
 });
 assert.equal(repeat.statusCode,409);
 const stored=await endpoint('GET /api/video-reviews/:id');
 assert.equal(body(stored).reviewHistory.length,1);
 assert.equal(body(stored).ownerId,owner);
});
test('trusted import refuses duplicate IDs without replacing existing review',async()=>{
 await assert.rejects(trustedAddStoredReview(packet,context()),/duplicate-record/);
 const list=await endpoint('GET /api/video-reviews');
 assert.equal(body(list).items.length,1);
});
test.after(()=>{delete globalThis.__viralReviewDb;rmSync(tmp,{recursive:true,force:true});});
