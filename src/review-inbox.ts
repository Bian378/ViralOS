/**
 * ViralOS review inbox domain contract for a FUTURE authenticated backend.
 *
 * No auth implementation, persistence, database, upload or publishing code.
 * Every caller MUST supply server-verified user identity and digest of actual
 * bytes held in private media storage; NEVER trust owner IDs/hashes in client
 * or local JSON. All edits require atomic version comparison by the backend.
 */
import {createHash} from 'node:crypto';

export type QueueState='awaiting_owner_review'|'changes_requested'|'video_reviewed_no_upload_permission';
export type ReviewChecklist={
  factsChecked:boolean;
  originalAndMediaRightsChecked:boolean;
  voiceRightsChecked:boolean;
  captionsSyncedToSpokenAudio:boolean;
  finalVideoWatched:boolean;
};
export type ServerVerifiedImportContext={
  authenticatedOwnerId:string;
  queueId:string; // backend-generated stable unguessable identifier
  storedMp4Sha256:string; // SHA-256 independently calculated over saved media bytes
  exactByteVerificationPassed:true; // must be asserted by the trusted backend only
  importedAt:string;
};
export type SafeReviewItem={
  schemaVersion:1;
  kind:'viralos-server-review-inbox-item';
  id:string;ownerId:string;version:number;
  state:QueueState;importedAt:string;
  title:string;sourceUrl:string;
  video:{storedSha256:string;relativePath:'preview/short-DRAFT.mp4';width:1080;height:1920;fps:30;visualStyle:'kinetic_procedural'|'typography_static'};
  manuscript:{sha256:string;text:string;selectedDraftRole:string|null;words:number};
  editorial:{rolesActuallyInvoked:string[];localModelCalls:number;realNeuralInferenceUsed:boolean};
  checks:ReviewChecklist;
  reviewHistory:{version:number;action:string;reviewedAt:string;comment:string}[];
  permissions:{canPublish:false;canUploadToYouTube:false;privateUploadAuthorized:false;publicReleaseAuthorized:false};
};
export type ServerVerifiedReviewContext={
  authenticatedOwnerId:string;
  expectedVersion:number;
  expectedVideoSha256:string;
  explicitOwnerAction:true; // required UI confirmation verified by backend
  reviewedAt:string;
};

const SHA=/^[a-f0-9]{64}$/;
const ROLES=['creative','research','quality','manager'];
const CHECKS=['factsChecked','originalAndMediaRightsChecked','voiceRightsChecked',
              'captionsSyncedToSpokenAudio','finalVideoWatched'] as const;
const now=(str:string)=>typeof str==='string'&&Number.isFinite(Date.parse(str))&&
  !Number.isNaN(new Date(str).getTime());
const identifier=(x:string)=>typeof x==='string'&&
  /^[A-Za-z0-9_-]{10,128}$/.test(x);
const digest=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
const fixedPermissions=()=>({
  canPublish:false as const,canUploadToYouTube:false as const,
  privateUploadAuthorized:false as const,publicReleaseAuthorized:false as const,
});
const blankChecks=():ReviewChecklist=>({
  factsChecked:false,originalAndMediaRightsChecked:false,
  voiceRightsChecked:false,captionsSyncedToSpokenAudio:false,
  finalVideoWatched:false,
});

export function validateLocalReviewPacketForUpload(raw:unknown):Record<string,any>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw Error('A validated local review JSON object is required.');
  const p=raw as Record<string,any>;
  if(JSON.stringify(p).length>65000||
     p.schemaVersion!==1||p.kind!=='viralos-local-unapproved-review-item'||
     p.state!=='LOCAL_DRAFT_AWAITING_OWNER_REVIEW'||
     !['offline_file_only_not_authenticated_or_synced','browser_studio_unapproved_not_authenticated_or_synced'].includes(p.source)||
     p.canBeImportedIntoAuthenticatedQueueAutomatically!==false)
    throw Error('Unsupported or non-reviewable local packet.');
  const perm=p.permissions;
  if(!perm||perm.ownerApproved!==false||
     perm.privateYouTubeUploadAuthorized!==false||
     perm.publicYouTubeReleaseAuthorized!==false||
     perm.canAutomaticallyPublish!==false)
    throw Error('Imported packet must not contain any approval.');
  const video=p.video,script=p.script,editorial=p.editorial;
  if(!video||!SHA.test(video.sha256)||video.relativePath!=='preview/short-DRAFT.mp4'||
     video.width!==1080||video.height!==1920||video.fps!==30||
     !['kinetic_procedural','typography_static'].includes(video.visualStyle)||
     video.containsThirdPartySourceFootage!==false)
    throw Error('Original verified MP4 metadata missing or altered.');
  if(!script||!SHA.test(script.sha256)||typeof script.text!=='string'||
     script.text.length>3500||script.text.length<80||
     digest(script.text)!==script.sha256||
     !Number.isSafeInteger(script.words)||script.words!==script.text.trim().split(/\s+/u).length||
     script.words<(p.source==='browser_studio_unapproved_not_authenticated_or_synced'?5:80)||
     script.words>(p.source==='browser_studio_unapproved_not_authenticated_or_synced'?180:150)||
     ![null,'manager','quality','creative'].includes(script.selectedDraftRole))
    throw Error('Original script content/hash/count does not match.');
  if(!editorial||!Array.isArray(editorial.rolesActuallyInvoked)||
     editorial.rolesActuallyInvoked.length>(p.source==='browser_studio_unapproved_not_authenticated_or_synced'?0:4)||
     (p.source!=='browser_studio_unapproved_not_authenticated_or_synced'&&editorial.rolesActuallyInvoked.length<1)||
     !editorial.rolesActuallyInvoked.every((x:string,i:number)=>x===ROLES[i])||
     editorial.localModelCalls!==editorial.rolesActuallyInvoked.length||
     typeof editorial.realNeuralInferenceUsed!=='boolean'||
     (p.source==='browser_studio_unapproved_not_authenticated_or_synced'&&
       (script.selectedDraftRole!==null||editorial.realNeuralInferenceUsed!==false)))
    throw Error('Invalid or forged model-call history.');
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>160||
     typeof p.sourceUrl!=='string'||p.sourceUrl.length>1024||
     (p.sourceUrl!==''&&!p.sourceUrl.startsWith('https://')))
    throw Error('Review title/source is invalid.');
  return p;
}

/**
 * Only the future authenticated SERVER endpoint may call this function.
 * Server must check MP4 bytes and their hash BEFORE invoking this module,
 * persist atomically, and never accept context fields from the browser.
 */
export function importVerifiedLocalReviewPacket(
  raw:unknown,ctx:ServerVerifiedImportContext
):SafeReviewItem{
  if(!ctx||!identifier(ctx.authenticatedOwnerId)||!identifier(ctx.queueId)||
     !SHA.test(ctx.storedMp4Sha256)||ctx.exactByteVerificationPassed!==true||
     !now(ctx.importedAt))
    throw Error('Server-side authentication and exact stored MP4 verification required.');
  const packet=validateLocalReviewPacketForUpload(raw);
  if(packet.video.sha256!==ctx.storedMp4Sha256)
    throw Error('Video content changed since local draft verification.');
  return {
    schemaVersion:1,kind:'viralos-server-review-inbox-item',
    id:ctx.queueId,ownerId:ctx.authenticatedOwnerId,version:1,
    state:'awaiting_owner_review',importedAt:ctx.importedAt,
    title:packet.title,sourceUrl:packet.sourceUrl,
    video:{
      storedSha256:ctx.storedMp4Sha256,
      relativePath:'preview/short-DRAFT.mp4',
      width:1080,height:1920,fps:30,
      visualStyle:packet.video.visualStyle,
    },
    manuscript:{
      sha256:packet.script.sha256,text:packet.script.text,
      selectedDraftRole:packet.script.selectedDraftRole,
      words:packet.script.words,
    },
    editorial:{
      rolesActuallyInvoked:[...packet.editorial.rolesActuallyInvoked],
      localModelCalls:packet.editorial.localModelCalls,
      realNeuralInferenceUsed:packet.editorial.realNeuralInferenceUsed,
    },
    checks:blankChecks(),
    reviewHistory:[],
    permissions:fixedPermissions(),
  };
}

function verifiedReview(item:SafeReviewItem,ctx:ServerVerifiedReviewContext){
  if(!item||item.kind!=='viralos-server-review-inbox-item'||
     !ctx||!identifier(ctx.authenticatedOwnerId)||
     ctx.authenticatedOwnerId!==item.ownerId||
     !Number.isSafeInteger(ctx.expectedVersion)||
     ctx.expectedVersion!==item.version||
     ctx.expectedVideoSha256!==item.video.storedSha256||
     ctx.explicitOwnerAction!==true||!now(ctx.reviewedAt)||
     item.permissions.canPublish!==false||
     item.permissions.canUploadToYouTube!==false)
    throw Error('Authenticated, revision-pinned owner review is required.');
}

/**
 * Immutable CAS-compatible transition. Backend MUST commit only if the
 * persisted version still equals ctx.expectedVersion; no API here.
 */
export function applyOwnerReviewDecision(
  item:SafeReviewItem,
  ctx:ServerVerifiedReviewContext,
  decision:'request_changes'|'mark_video_reviewed',
  checks:ReviewChecklist,
  comment:string
):SafeReviewItem{
  verifiedReview(item,ctx);
  if(item.state!=='awaiting_owner_review')
    throw Error('Review state already decided; reimport changed content.');
  if(!checks||CHECKS.some(k=>typeof checks[k]!=='boolean')||
     typeof comment!=='string'||comment.length>1000||
     /[\u0000-\u0008\u000b\u000e-\u001f]/.test(comment))
    throw Error('Human checklist and bounded comment required.');
  if(decision==='mark_video_reviewed'&&!CHECKS.every(k=>checks[k]===true))
    throw Error('All human factual, rights, voice, captions and final-video checks required.');
  if(decision==='request_changes'&&!comment.trim())
    throw Error('Requested changes need a concrete reviewer comment.');
  if(decision!=='mark_video_reviewed'&&decision!=='request_changes')
    throw Error('Unsupported review decision.');
  const state=decision==='mark_video_reviewed'
    ?'video_reviewed_no_upload_permission':'changes_requested';
  return {
    ...item,version:item.version+1,state,
    checks:{...checks},
    reviewHistory:[...item.reviewHistory,{
      version:item.version+1,action:decision,reviewedAt:ctx.reviewedAt,comment,
    }],
    permissions:fixedPermissions(),
  };
}

export function listOwnerReviews(items:SafeReviewItem[],authenticatedOwnerId:string){
  if(!identifier(authenticatedOwnerId)||!Array.isArray(items))
    throw Error('A verified server session is required to list review items.');
  // A backend must additionally query/filter storage BY OWNER; this is
  // only the pure projection and not an authorization or DB implementation.
  return items.filter(item=>item.ownerId===authenticatedOwnerId)
    .map(item=>({id:item.id,title:item.title,state:item.state,version:item.version,
      selectedDraftRole:item.manuscript.selectedDraftRole,
      videoSha256:item.video.storedSha256,
      hasUploadPermission:false,hasPublishPermission:false}));
}
