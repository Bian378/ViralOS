import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShortsProductionPlan } from '../src/shorts-production-plan.ts';

const hook = 'What if GTA VI changes gaming forever?';
const fullScript = [
  hook,
  Array(20).fill('The trailer shows an ambitious fictional world').join(' '),
  Array(20).fill('Players are wondering what will come next').join(' '),
  Array(20).fill('Questions about gameplay remain open for everyone').join(' '),
  Array(20).fill('This original commentary does not quote anyone').join(' '),
  Array(20).fill('What do you want from the game').join(' '),
].join('\n\n');
const base = () => ({
  projectId: 'gta-qa', revision: 1, title: 'GTA VI could change gaming',
  sourceUrl: 'https://www.youtube.com/watch?v=example', script: fullScript,
});
test('a stored English script produces 9:16 1080x1920 MP4 planning metadata', () => {
  const plan=buildShortsProductionPlan(base());
  assert.equal(plan.width, 1080);
  assert.equal(plan.height, 1920);
  assert.equal(plan.fps, 30);
  assert.equal(plan.format, 'mp4');
  assert.equal(plan.language, 'en');
  assert.ok(plan.estimatedSeconds <= 60);
});
test('one paragraph becomes one original scene and timing is contiguous', () => {
  const plan=buildShortsProductionPlan(base());
  assert.equal(plan.scenes.length, 6);
  assert.equal(plan.scenes[0].startFrame, 0);
  for (let i=1; i<plan.scenes.length; i++) {
    assert.equal(plan.scenes[i].startFrame,
      plan.scenes[i-1].startFrame+plan.scenes[i-1].durationFrames);
  }
  assert.equal(plan.totalFrames,
    plan.scenes.at(-1).startFrame+plan.scenes.at(-1).durationFrames);
});
test('all captions cover their scene with no gaps or overlaps', () => {
  const plan=buildShortsProductionPlan(base());
  for (const scene of plan.scenes) {
    const words = scene.text.split(/\s+/);
    assert.deepEqual(scene.captionCues.flatMap(c=>c.text.split(/\s+/)), words);
    assert.ok(scene.captionCues.every(c=>c.text.split(/\s+/).length<=7));
    assert.equal(scene.captionCues[0].startFrame, scene.startFrame);
    for(let i=1;i<scene.captionCues.length;i++){
      assert.equal(scene.captionCues[i].startFrame,
        scene.captionCues[i-1].startFrame+scene.captionCues[i-1].durationFrames);
    }
    assert.equal(scene.captionCues.at(-1).startFrame+scene.captionCues.at(-1).durationFrames,
      scene.startFrame+scene.durationFrames);
  }
});
test('hook lasts approximately 1-3 seconds at estimated narration speed',()=>{
  const scene=buildShortsProductionPlan(base()).scenes[0];
  assert.ok(scene.durationFrames >= 30 && scene.durationFrames <= 90);
});
test('plan never pretends to contain generated content or rights approval', () => {
  const plan=buildShortsProductionPlan(base());
  assert.equal(plan.voiceStatus,'not_generated');
  assert.equal(plan.mediaStatus,'not_generated');
  assert.equal(plan.subtitlesStatus,'estimated_not_synced');
  assert.equal(plan.exportStatus,'not_rendered');
  assert.equal(plan.sourceFootageUsed,false);
  assert.equal(plan.needsOwnerApproval,true);
  assert.equal(plan.factChecking,'unverified');
  assert.ok(plan.scenes.every(s=>s.rightsStatus==='unverified'));
});
test('rejects empty project, stale metadata, invalid word count or hook', () => {
  assert.throws(()=>buildShortsProductionPlan({...base(),projectId:''}), /saved manuscript/);
  assert.throws(()=>buildShortsProductionPlan({...base(),revision:0}), /valid revision/);
  assert.throws(()=>buildShortsProductionPlan({...base(),script:'This is too short.'}), /80–150/);
  assert.throws(()=>buildShortsProductionPlan({...base(),script:
    ['This hook has far too many words for the first three seconds of video', ...fullScript.split('\n\n').slice(1)].join('\n\n')
  }), /hook/);
});
test('rejects oversized scenes without silently truncating content',()=>{
  assert.throws(()=>buildShortsProductionPlan({
    ...base(), script:[
      hook,
      Array(61).fill('description').join(' '),
      Array(20).fill('shorts').join(' '),
    ].join('\n\n'),
  }),/Split unusually long paragraphs/);
});
test('planning is deterministic, preserves original script and does no external work',()=>{
  const input=base();
  const before=JSON.stringify(input);
  const x=buildShortsProductionPlan(input);
  const y=buildShortsProductionPlan(input);
  assert.deepEqual(x,y);
  assert.equal(JSON.stringify(input),before);
  assert.equal(x.scenes[0].text,hook);
});
