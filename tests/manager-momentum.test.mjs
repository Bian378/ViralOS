import test from 'node:test';
import assert from 'node:assert/strict';
import { measureViewVelocity } from '../src/momentum.ts';
import { buildManagerPlan } from '../src/manager.ts';

const at = '2026-10-21T16:00:00Z';
const source = (id, views, observations = []) => ({
  id: 'yt-' + id,
  source: 'YouTube',
  title: id,
  url: 'https://www.youtube.com/watch?v=' + id,
  region: 'SE',
  metric: 'visningar',
  publishedAt: '2026-10-18T10:00:00Z',
  observedAt: at,
  value: views,
  observations,
});
const sample = (start, end, first, last) => [
  { at: start, value: first }, { at: end, value: last },
];
test('two official observations give measured average VPH, not a virality prediction', () => {
  const t = source('a', 1300, sample('2026-10-21T15:30:00Z', at, 1000, 1300));
  const m = measureViewVelocity(t, at);
  assert.equal(m.viewsPerHour, 600);
  assert.equal(m.addedViews, 300);
  assert.equal(m.hours, 0.5);
});
test('single observation, sub-15 minute samples and stale samples lack evidence', () => {
  assert.equal(measureViewVelocity(source('a', 120, [{ at, value: 120 }]), at), null);
  assert.equal(measureViewVelocity(source('b', 120, sample('2026-10-21T15:53:00Z', at, 100, 120)), at), null);
  assert.equal(measureViewVelocity(source('c', 120,
    sample('2026-10-19T10:00:00Z', '2026-10-19T11:00:00Z', 100, 120)), at), null);
});
test('counter correction never masquerades as upward trend', () => {
  assert.equal(measureViewVelocity(source('a', 99, sample('2026-10-21T15:00:00Z', at, 100, 99)), at), null);
});
test('future, invalid and duplicated readings do not fabricate VPH', () => {
  const t = source('a', 100, [
    { at: 'not-a-date', value: 10 }, { at: '2026-10-22T16:00:00Z', value: 1e9 },
    { at, value: 100 }, { at, value: 100 },
  ]);
  assert.equal(measureViewVelocity(t, at), null);
});
test('faster-growing recent video ranks above high total-view video', () => {
  const viral = source('rising', 1000,
    sample('2026-10-21T15:00:00Z', at, 300, 1000));
  const legacy = source('legacy', 100000000, [{ at, value: 100000000 }]);
  const plan = buildManagerPlan('plan-1', at, [legacy, viral]);
  assert.equal(plan.candidates[0].trendId, 'yt-rising');
  assert.equal(plan.candidates[0].viewsPerHour, 700);
  assert.equal(plan.candidates[1].viewsPerHour, undefined);
  assert.match(plan.candidates[1].reason, /Otillräckliga/);
});
test('plan remains available with one observation and does not assert verified trends', () => {
  const plan = buildManagerPlan('p', at, [source('single', 900, [{ at, value: 900 }])]);
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].viewsPerHour, undefined);
  assert.match(plan.steps[1].detail, /0 av 1/);
});
test('malformed URLs and non-YouTube sources are not admitted into a plan', () => {
  const x = source('a', 120);
  assert.equal(buildManagerPlan('p', at, [{...x,url:'https://malicious.example/x'}, {...x,source:'Hacker News'}]), null);
});
test('shortlist has at most three and preserves caller input and old plan compatibility', () => {
  const items = Array.from({length:6},(_,i)=>source('v'+i, 100+i, [{at, value:100+i}]));
  const originals = JSON.stringify(items);
  const plan = buildManagerPlan('p', at, items);
  assert.equal(plan.candidates.length, 3);
  assert.equal(JSON.stringify(items), originals);
  const oldPlan = { ...plan, candidates: [{...plan.candidates[0], viewsPerHour: undefined}] };
  assert.equal(oldPlan.candidates[0].viewsPerHour, undefined);
});
