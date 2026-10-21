import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShortsProductionPlan } from '../src/shorts-production-plan.ts';
import { createDraftSrt, createProductionBundle, formatSrtTime, safeProjectFilename } from '../src/subtitle-export.ts';

const script = [
  'Could a new game change everything?',
  Array(20).fill('original').join(' '),
  Array(20).fill('story').join(' '),
  Array(20).fill('visuals').join(' '),
  Array(20).fill('commentary').join(' '),
  Array(20).fill('questions').join(' '),
].join('\n\n');
const create = () => buildShortsProductionPlan({
  projectId: 'project-1',
  revision: 2,
  title: 'A gaming Short',
  script,
  sourceUrl: 'https://www.youtube.com/watch?v=source',
});
test('SRT frames map precisely to HH:MM:SS,mmm and handle minute rollover',()=>{
  assert.equal(formatSrtTime(0,30), '00:00:00,000');
  assert.equal(formatSrtTime(1,30), '00:00:00,033');
  assert.equal(formatSrtTime(1818,30), '00:01:00,600');
  assert.throws(()=>formatSrtTime(-1,30), /Invalid/);
});
test('draft SRT follows scenes and explicitly does not generate speech',()=>{
  const plan=create(), srt=createDraftSrt(plan);
  const cues=srt.trim().split('\r\n\r\n');
  const expected=plan.scenes.reduce((sum,scene)=>sum+scene.captionCues.length,0);
  assert.equal(cues.length,expected);
  assert.match(cues[0], /^1\r\n00:00:00,000 --> /);
  assert.ok(srt.includes('Could a new game'));
  assert.equal(plan.voiceStatus,'not_generated');
});
test('SRT cue timestamps never overlap or lose planned captions',()=>{
  const plan=create();
  const srt=createDraftSrt(plan);
  const times=[...srt.matchAll(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/g)];
  assert.ok(times.length >= 6);
  const decode=t=>{const [h,m,s,ms]=t.split(/[:,]/).map(Number);return h*3600000+m*60000+s*1000+ms;};
  for(let i=0;i<times.length;i++){
    assert.ok(decode(times[i][2])>decode(times[i][1]));
    if(i>0)assert.equal(decode(times[i][1]),decode(times[i-1][2]));
  }
});
test('subtitle export rejects overlap and missing final scene',()=>{
  const plan=create();
  const overlap=structuredClone(plan);
  overlap.scenes[0].captionCues[1].startFrame=0;
  assert.throws(()=>createDraftSrt(overlap),/overlapping/);
  const missing=structuredClone(plan);
  missing.scenes.at(-1).captionCues.pop();
  assert.throws(()=>createDraftSrt(missing),/incomplete/);
});
test('script tags are rendered inert in subtitle output',()=>{
  const plan=create();
  plan.scenes[0].captionCues[0].text='<script>evil</script>';
  const srt=createDraftSrt(plan);
  assert.equal(srt.includes('<script>'),false);
  assert.ok(srt.includes('‹script›'));
});
test('JSON manifest is explicitly not an approved or finished video',()=>{
  const bundle=createProductionBundle(create());
  assert.equal(bundle.notForPublication,true);
  assert.equal(bundle.status,'unapproved_preproduction');
  assert.equal(bundle.subtitlesAreEstimated,true);
  assert.equal(bundle.narration,'not_generated');
  assert.equal(bundle.media,'not_generated');
  assert.equal(bundle.assetRights,'unverified');
  assert.equal(bundle.scenePlan.revision,2);
  assert.doesNotThrow(()=>JSON.parse(JSON.stringify(bundle)));
});
test('manifest refuses to imply clearance or approval',()=>{
  const plan=create();
  plan.needsOwnerApproval=false;
  assert.throws(()=>createProductionBundle(plan),/not a pending/);
  const plan2=create();
  plan2.scenes[0].rightsStatus='approved';
  assert.throws(()=>createProductionBundle(plan2),/not a pending/);
});
test('filenames reject user-supplied path traversal',()=>{
  assert.equal(safeProjectFilename('../private/draft',2,'srt'),'viralos-private-draft-v2-DRAFT.srt');
  assert.equal(safeProjectFilename('',3,'json'),'viralos-short-v3-DRAFT.json');
  assert.throws(()=>safeProjectFilename('a',0,'json'),/Saved revision/);
});
