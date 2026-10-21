import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseYouTubePopular,fetchYoutubePopular,youtubeDurationSeconds} from '../scripts/youtube_popular_discovery.mjs';

const fixture={
  items:[
    {id:'ABCDEFGHIJK',snippet:{
      title:'An Original Game Trailer Analysis',
      channelTitle:'Sample Channel',publishedAt:'2026-10-21T09:00:00Z'
    },statistics:{viewCount:'10000'},contentDetails:{duration:'PT1M20S'}},
    {id:'LMNOPQRSTUV',snippet:{
      title:'Another Popular Video',
      channelTitle:'Another Channel',publishedAt:'2026-10-20T09:00:00Z'
    },statistics:{viewCount:'1200'},contentDetails:{duration:'PT2H'}},
    {id:'LMNOPQRSTUV',snippet:{
      title:'Same duplicate video',
      channelTitle:'Another Channel',publishedAt:'2026-10-20T09:00:00Z'
    },statistics:{viewCount:'1200'},contentDetails:{duration:'PT2H'}},
  ]
};
const now='2026-10-21T19:20:00Z';
const apiKey='local-mock-example-credential-not-real';

test('duration parser supports ISO days/hours/minutes/seconds',()=>{
  assert.equal(youtubeDurationSeconds('PT59S'),59);
  assert.equal(youtubeDurationSeconds('PT2H3M10S'),7390);
  assert.equal(youtubeDurationSeconds('P1DT1H'),90000);
  assert.equal(youtubeDurationSeconds('invalid'),null);
});
test('popular API data is labelled as popularity, not viral growth or Shorts proof',()=>{
  const result=parseYouTubePopular(fixture,now,'US');
  assert.equal(result.candidates.length,2);
  assert.equal(result.costEstimateYouTubeQuotaUnits,1);
  assert.equal(result.viewGrowthStatus,'NO_SECOND_OBSERVATION');
  assert.ok(result.candidates.every(x=>x.shortsConfirmed===false));
  assert.ok(result.candidates.every(x=>x.perHourGrowthMeasured===false));
  assert.ok(result.candidates.every(x=>x.rightsVerified===false));
  assert.equal(result.candidates[0].durationSeconds,80);
  assert.equal(result.candidates[0].sourceUrl,'https://www.youtube.com/watch?v=ABCDEFGHIJK');
});
test('exactly one API request on pre-approved local key, with no key in output',async()=>{
  let count=0, url;
  const result=await fetchYoutubePopular({
    apiKey,now,region:'US',maxResults:12,explicitQuotaConsent:true,
    fetchImpl:async (input,opts)=>{
      count++;
      url=new URL(input);
      assert.equal(opts.method,'GET');
      return {ok:true,text:async()=>JSON.stringify(fixture)};
    },
  });
  assert.equal(count,1);
  assert.equal(url.hostname,'www.googleapis.com');
  assert.equal(url.pathname,'/youtube/v3/videos');
  assert.equal(url.searchParams.get('chart'),'mostPopular');
  assert.equal(url.searchParams.get('maxResults'),'12');
  assert.equal(url.searchParams.get('part'),'snippet,statistics,contentDetails');
  assert.equal(url.searchParams.get('key'),apiKey);
  assert.ok(!JSON.stringify(result).includes(apiKey));
  assert.equal(result.candidates.length,2);
});
test('without user consent or API key, no request can occur',async()=>{
  let calls=0;
  const fake=async()=>{calls++;return {ok:true,text:async()=>JSON.stringify(fixture)};};
  await assert.rejects(fetchYoutubePopular({apiKey,now,explicitQuotaConsent:false,fetchImpl:fake}),/consent/);
  await assert.rejects(fetchYoutubePopular({apiKey:'',now,explicitQuotaConsent:true,fetchImpl:fake}),/key/);
  assert.equal(calls,0);
});
test('invalid region and excessive batch size rejected without requests',async()=>{
  let calls=0;
  const fake=async()=>{calls++;throw Error('request should not be sent');};
  await assert.rejects(fetchYoutubePopular({apiKey,now,region:'../bad',explicitQuotaConsent:true,fetchImpl:fake}),/invalid/);
  await assert.rejects(fetchYoutubePopular({apiKey,now,maxResults:100,explicitQuotaConsent:true,fetchImpl:fake}),/invalid/);
  assert.equal(calls,0);
});
test('failed API request does not leak credential or repeat',async()=>{
  let calls=0;
  await assert.rejects(fetchYoutubePopular({
    apiKey,now,explicitQuotaConsent:true,
    fetchImpl:async()=>{calls++;throw Error('Contains secret '+apiKey);},
  }),error=>{
    assert.ok(!error.message.includes(apiKey));
    return true;
  });
  assert.equal(calls,1);
});
test('malformed response fails safely rather than claiming trends',async()=>{
  await assert.rejects(fetchYoutubePopular({
    apiKey,now,explicitQuotaConsent:true,
    fetchImpl:async()=>({ok:true,text:async()=>'{malformed'}),
  }),/not valid JSON/);
  assert.throws(()=>parseYouTubePopular({items:'not-array'},now,'US'),/Unrecognized/);
});
test('unusable and missing public video metadata are filtered out',()=>{
  const broken={
    items:[{id:'BAD',snippet:{title:'oops',channelTitle:'n',publishedAt:now},
      statistics:{viewCount:'99'},contentDetails:{duration:'PT2M'}}],
  };
  assert.equal(parseYouTubePopular(broken,now,'US').candidates.length,0);
});
