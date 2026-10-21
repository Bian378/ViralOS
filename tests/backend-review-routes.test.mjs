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
    contents: