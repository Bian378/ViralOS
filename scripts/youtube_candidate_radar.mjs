/**
 * Offline YouTube candidate radar from previously saved official snapshots.
 * This ranks observed view-count changes; it NEVER asserts viral trend,
 * YouTube Shorts classification, factual accuracy, or media reuse rights.
 * No network requests, secret keys, inference, file writes, or publication.
 */
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const SNAPSHOT_KIND='viralos-youtube-popularity-snapshot';
const MIN_INTERVAL=15*60*1000;
const MAX_INTERVAL=24*60*60*1000;

function cleanSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object'||snapshot.kind!==SNAPSHOT_KIND||
     !/^[A-Z]{2}$/.test(snapshot.region||'')||
     !Array.isArray(snapshot.candidates)||snapshot.candidates.length>50)
    throw new Error('Expected bounded official YouTube popularity snapshot.');
  const time=Date.parse(snapshot.observedAt);
  if(!Number.isFinite(time))throw new Error('Snapshot observation timestamp required.');
  const candidates=new Map();
  for(const c of snapshot.candidates){
    if(!c||typeof c!=='object'||!VIDEO_ID.test(c.id||'')||
       c.sourceUrl!=='https://www.youtube.com/watch?v='+c.id||
       typeof c.title!=='string'||!c.title.trim()||c.title.length>300||
       !Number.isSafeInteger(c.totalViews)||c.totalViews<0||
       !Number.isInteger(c.durationSeconds)||c.durationSeconds<1||
       c.durationSeconds>86400||!Number.isFinite(Date.parse(c.publishedAt))||
       Date.parse(c.publishedAt)>time||
       typeof c.observedAt!=='string'||Date.parse(c.observedAt)!==time||
       candidates.has(c.id)){
      throw new Error('Invalid, duplicated or mismatched candidate data.');
    }
    candidates.set(c.id,{
      videoId:c.id,title:c.title.trim(),sourceUrl:c.sourceUrl,
      publishedAt:c.publishedAt,totalViews:c.totalViews,
      durationSeconds:c.durationSeconds,
    });
  }
  return {observedAt:snapshot.observedAt,time,region:snapshot.region,candidates};
}

/**
 * Need two saved real observations of the SAME video.
 * Caller cannot infer VPH for newly appeared videos or counter corrections.
 */
export function buildCandidateRadar({
  latest,earlier=null,asOf=latest?.observedAt,maxItems=10,
}={}){
  const current=cleanSnapshot(latest);
  const now=Date.parse(asOf);
  if(!Number.isFinite(now)||now<current.time||
     now-current.time>24*60*60*1000)
    throw new Error('Latest popularity snapshot is not current enough.');
  if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>25)
    throw new Error('Invalid maximum candidate count.');
  const previous=earlier===null?null:cleanSnapshot(earlier);
  let intervalHours=null;
  if(previous){
    if(previous.region!==current.region)
      throw new Error('Snapshots must use the same region.');
    const delta=current.time-previous.time;
    if(delta<MIN_INTERVAL||delta>MAX_INTERVAL)
      throw new Error('Two observations must be 15 minutes to 24 hours apart.');
    intervalHours=delta/3600000;
  }
  const candidates=[...current.candidates.values()].map(c=>{
    const old=previous?.candidates.get(c.videoId);
    const valid=old&&old.publishedAt===c.publishedAt&&
      c.totalViews>=old.totalViews;
    const added=valid?c.totalViews-old.totalViews:null;
    const vph=valid?added/intervalHours:null;
    return {
      ...c,region:current.region,observedAt:current.observedAt,
      ...(valid?{
        measuredAddedViews:added,
        measuredViewsPerHour:vph,
        measuredIntervalHours:intervalHours,
      }:{}),
      observationType:valid?'TWO_MATCHING_PUBLIC_COUNTERS':'POPULARITY_ONLY',
      shortsConfirmed:false,rightsVerified:false,factualClaimsVerified:false,
    };
  });
  candidates.sort((a,b)=>
    Number(b.observationType==='TWO_MATCHING_PUBLIC_COUNTERS')-
    Number(a.observationType==='TWO_MATCHING_PUBLIC_COUNTERS')||
    (b.measuredViewsPerHour??0)-(a.measuredViewsPerHour??0)||
    b.totalViews-a.totalViews||
    a.videoId.localeCompare(b.videoId));
  const autoChoice=candidates.find(c=>c.observationType==='TWO_MATCHING_PUBLIC_COUNTERS'&&
    c.measuredAddedViews>0)||null;
  return {
    kind:'viralos-offline-candidate-radar',
    region:current.region,observedAt:current.observedAt,
    observationStatus:previous?'TWO_SNAPSHOTS':'ONE_SNAPSHOT',
    claimsStatus:'NOT_FACT_CHECKED',
    shortsStatus:'UNVERIFIED',rightsStatus:'UNVERIFIED',
    selectionRequiresOwnerAuthorization:true,
    automaticallySuggestedVideoId:autoChoice?.videoId??null,
    candidates:candidates.slice(0,maxItems),
  };
}

/** Human intentionally chooses candidate ID. No source video reused. */
export function selectOriginalCommentaryTopic(radar,videoId){
  if(!radar||radar.kind!=='viralos-offline-candidate-radar'||
     !Array.isArray(radar.candidates)||!VIDEO_ID.test(videoId||''))
    throw new Error('Valid radar and explicit candidate ID required.');
  const selected=radar.candidates.find(c=>c.videoId===videoId);
  if(!selected)throw new Error('Video ID not found in this radar shortlist.');
  if(!selected.sourceUrl||
     selected.sourceUrl!=='https://www.youtube.com/watch?v='+videoId)
    throw new Error('Video source URL mismatch.');
  return {
    videoId,
    topic:('Original English commentary inspired by the topic: '+selected.title)
      .slice(0,180),
    sourceUrl:selected.sourceUrl,
    evidence: selected.observationType,
    measuredViewsPerHour:selected.measuredViewsPerHour??null,
    shortsConfirmed:false,
    rightsVerified:false,
    factsVerified:false,
    sourceFootageToReuse:false,
  };
}
