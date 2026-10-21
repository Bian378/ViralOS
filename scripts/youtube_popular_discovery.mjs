/**
 * One opt-in YouTube Data API v3 popular-videos request; no AppDeploy/AI credits.
 * Reads operator's local YOUTUBE_API_KEY from environment, NEVER stores key.
 * Only popularity chart + public metadata; NOT verified Shorts nor VPH trends.
 * Requires caller to explicitly consent to using ONE YouTube API quota unit.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const REGION = /^[A-Z]{2}$/;

export function youtubeDurationSeconds(value) {
  if (typeof value !== 'string') return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [days,hours,minutes,seconds]=m.slice(1).map(x=>Number(x||0));
  const total=days*86400+hours*3600+minutes*60+seconds;
  return Number.isSafeInteger(total)&&total>0?total:null;
}

function safeCount(n) {
  if (typeof n !== 'string' || !/^\d+$/.test(n)) return null;
  const x=Number(n);
  return Number.isSafeInteger(x) ? x : null;
}

export function parseYouTubePopular(body, now, region) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.items))
    throw new Error('Unrecognized YouTube Data API format.');
  const candidates=[];
  const unique=new Set();
  for (const item of body.items.slice(0,50)) {
    const id=item?.id, snippet=item?.snippet, statistics=item?.statistics;
    const at=snippet?.publishedAt;
    const views=safeCount(statistics?.viewCount);
    const seconds=youtubeDurationSeconds(item?.contentDetails?.duration);
    if (!VIDEO_ID.test(id||'') || unique.has(id) ||
        typeof snippet?.title !== 'string' || !snippet.title.trim() ||
        snippet.title.length>300 || !Number.isFinite(Date.parse(at)) ||
        typeof snippet.channelTitle !== 'string' || views===null ||
        seconds===null) continue;
    unique.add(id);
    candidates.push({
      id, title:snippet.title.trim(),
      channelTitle:snippet.channelTitle.slice(0,140),
      sourceUrl:'https://www.youtube.com/watch?v='+id,
      publishedAt:at,
      observedAt:now,
      totalViews:views,
      durationSeconds:seconds,
      shortsConfirmed:false,
      perHourGrowthMeasured:false,
      rightsVerified:false,
      factualClaimsVerified:false,
    });
  }
  return {
    kind:'viralos-youtube-popularity-snapshot',
    region,
    observedAt:now,
    source:'YouTube Data API videos.list chart=mostPopular',
    costEstimateYouTubeQuotaUnits:1,
    apiKeySaved:false,
    shortsStatus:'UNVERIFIED',
    viewGrowthStatus:'NO_SECOND_OBSERVATION',
    candidates,
  };
}

export async function fetchYoutubePopular({
  apiKey,region='US',maxResults=15,
  explicitQuotaConsent=false,
  fetchImpl=fetch,now=new Date().toISOString(),
}={}) {
  if (explicitQuotaConsent!==true)
    throw new Error('Explicit one-request YouTube quota consent is required.');
  if (typeof apiKey!=='string'||apiKey.length<12||apiKey.length>256||
      /[\s]/.test(apiKey))
    throw new Error('A locally configured YouTube Data API key is required.');
  if (!REGION.test(region)||!Number.isInteger(maxResults)||
      maxResults<1||maxResults>25)
    throw new Error('Region/maxResults invalid. One API call only.');
  if (!Number.isFinite(Date.parse(now)))
    throw new Error('Invalid observation time.');
  const url=new URL(ENDPOINT);
  url.searchParams.set('part','snippet,statistics,contentDetails');
  url.searchParams.set('chart','mostPopular');
  url.searchParams.set('regionCode',region);
  url.searchParams.set('maxResults',String(maxResults));
  url.searchParams.set('key',apiKey);
  // Never retry or log URL: it contains an API credential.
  let response;
  try {
    response=await fetchImpl(url.toString(),{method:'GET',signal:AbortSignal.timeout(20000)});
  }catch {
    throw new Error('YouTube popular-videos request failed; no automatic retry.');
  }
  if (!response?.ok)
    throw new Error('YouTube API refused request (HTTP '+Number(response?.status||0)+').');
  const raw=await response.text();
  if (raw.length>1000000)
    throw new Error('YouTube API response exceeded safe limit.');
  let body;
  try {body=JSON.parse(raw);}
  catch {throw new Error('YouTube response was not valid JSON.');}
  const result=parseYouTubePopular(body,now,region);
  if (result.candidates.length===0)
    throw new Error('No usable public video metadata returned.');
  return result;
}

function parseFlags(argv){
  const args={};
  for(let i=0;i<argv.length;i++){
    const key=argv[i];
    if(key==='--allow-one-api-call'){
      if(key in args)throw new Error('Duplicate consent flag.');
      args[key]=true;continue;
    }
    if(!['--region','--max-results','--out'].includes(key)||key in args||
       ++i>=argv.length||argv[i].startsWith('--'))
      throw new Error('Invalid/missing argument.');
    args[key]=argv[i];
  }
  if(!args['--allow-one-api-call']||!args['--out'])
    throw new Error('Required: --allow-one-api-call --out NEW-SNAPSHOT.json');
  if(!args['--out'].endsWith('.json'))
    throw new Error('Output filename must end in .json.');
  return args;
}

if (process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const a=parseFlags(process.argv.slice(2));
    // Require a never-before-used filename BEFORE consuming API quota.
    const {existsSync}=await import('node:fs');
    if(existsSync(a['--out']))throw new Error('Refusing to overwrite saved YouTube snapshot.');
    const result=await fetchYoutubePopular({
      apiKey:process.env.YOUTUBE_API_KEY,
      region:a['--region']||'US',
      maxResults:a['--max-results']===undefined?15:Number(a['--max-results']),
      explicitQuotaConsent:true,
    });
    writeFileSync(a['--out'],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    process.stdout.write(JSON.stringify({
      output:a['--out'],candidates:result.candidates.length,
      shortsVerified:false,velocityVerified:false,
      youtubeQuotaUnits:1,appDeployCreditsUsed:0
    })+'\n');
  }catch(error) {
    // No URL or API key ever logged.
    process.stderr.write((error instanceof Error?error.message:'Discovery failed')+'\n');
    process.exitCode=1;
  }
}
