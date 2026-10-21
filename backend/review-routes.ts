/**
 * Server-only review inbox routes backed by the existing AppDeploy database.
 *
 * IMPORTANT:
 * - Listing / owner decisions are live, authenticated DB operations.
 * - NO client route accepts imports, media files, proof flags or owner IDs.
 * - trustedAddStoredReview() is NOT exposed as an API and MUST be called only
 *   after server-side storage and independent byte/hash verification.
 * - This module never uploads, publishes, connects to YouTube or sets upload
 *   permissions. Deployment and actual media storage are separate work.
 */
import {db,json,error,requireAuth,isAppDatabaseError} from '@appdeploy/sdk';
import {verifyPrivateMp4ByteStream} from './verified-media-bytes';
import {
  importVerifiedLocalReviewPacket, applyOwnerReviewDecision,
  listOwnerReviews, type SafeReviewItem, type ReviewChecklist,
  type ServerVerifiedImportContext
} from '../src/review-inbox';

const RECORDS='viral_review_inbox_items';
const INDEX='viral_review_inbox_owner_index';
const MAX_ITEMS=30;
type OwnerIndex={id:string;ownerId:string;version:number;items:string[]};
const isId=(s:unknown)=>typeof s==='string'&&
  /^[A-Za-z0-9_-]{10,128}$/.test(s);
const object=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)
  ?x as Record<string,unknown>:{};
const isConflict=(x:unknown)=>isAppDatabaseError(x)&&
  ['AppDatabaseConflict','AppDatabaseConditionFailed'].includes(x.code);

async function loadOwnerIndex(owner:string):Promise<OwnerIndex|null>{
  const [found]=await db.get<OwnerIndex>(INDEX,[owner],{consistent:true});
  if(!found)return null;
  if(found.ownerId!==owner||!Array.isArray(found.items)||
     found.items.length>MAX_ITEMS||
     !found.items.every(isId))throw Error('Invalid owner index, refusing access.');
  return found;
}
async function readOwnerItem(owner:string,id:string):Promise<SafeReviewItem|null>{
  if(!isId(id))return null;
  const index=await loadOwnerIndex(owner);
  if(!index||!index.items.includes(id))return null;
  const [item]=await db.get<SafeReviewItem>(RECORDS,[id],{consistent:true});
  if(!item||item.ownerId!==owner||item.id!==id||
     item.kind!=='viralos-server-review-inbox-item')
    return null;
  return item;
}

/** 
 * Trusted privileged server function, intentionally no HTTP route.
 * Required preconditions before invocation:
 * 1. Signed-in owner was verified through platform auth (not client JSON).
 * 2. Backend has independently read stored MP4 file bytes and hashed them.
 * 3. Private blob access controls are in place; stored digest is immutable.
 * 4. Caller does not accept exactByteVerificationPassed from the browser.
 * A real storage-backed caller is NOT wired up yet.
 */
export async function trustedAddStoredReview(
  localPacket:unknown, trusted:ServerVerifiedImportContext,
  openPrivateStoredBytes:()=>AsyncIterable<Uint8Array>
):Promise<SafeReviewItem>{
  if(typeof openPrivateStoredBytes!=='function')
    throw Error('Only independently read private media bytes may be imported.');
  // Integrity is independently recomputed over PRIVATE STORED bytes here.
  // The caller cannot approve using just an uploaded JSON digest/boolean.
  const proof=await verifyPrivateMp4ByteStream(openPrivateStoredBytes(),trusted.storedMp4Sha256);
  const review=importVerifiedLocalReviewPacket(localPacket,{
    ...trusted,storedMp4Sha256:proof.sha256,exactByteVerificationPassed:true
  });
  const owner=review.ownerId;
  for(let attempt=0;attempt<2;attempt++){
    const idx=await loadOwnerIndex(owner);
    if(idx&&idx.items.length>=MAX_ITEMS)
      throw Error('Review queue is full. Remove a previous review first.');
    // Existing records are NEVER silently replaced.
    const newIndex:OwnerIndex={
      id:owner,ownerId:owner,version:(idx?.version??0)+1,
      items:[...(idx?.items??[]),review.id]
    };
    try{
      await db.transact([
        db.tx.add(RECORDS,[review]),
        idx
          ?db.tx.update(INDEX,[{id:owner,record:newIndex,
             if:{version:idx.version,ownerId:owner}}],{patch:true})
          :db.tx.add(INDEX,[newIndex]),
      ]);
      return review;
    }catch(e){
      if(isConflict(e))continue;
      // Unknown transaction outcomes must NOT be retried blindly.
      throw e;
    }
  }
  throw Error('Concurrent queue change. Retry only after reading current state.');
}

export function createReviewInboxRoutes(){
  return {
    'GET /api/video-reviews':[
      requireAuth(),
      async (ctx:any)=>{
        const owner=ctx.user!.userId;
        try{
          const idx=await loadOwnerIndex(owner);
          if(!idx)return json({items:[],storageEnabled:false,publishingEnabled:false});
          const records=await db.get<SafeReviewItem>(RECORDS,idx.items,{consistent:true});
          const ownerOnly=records.filter((v):v is SafeReviewItem=>
            Boolean(v&&v.ownerId===owner&&idx.items.includes(v.id)));
          return json({items:listOwnerReviews(ownerOnly,owner),
            storageEnabled:false,publishingEnabled:false});
        }catch{
          return error('Kunde inte läsa granskningskön säkert.',503);
        }
      },
    ],
    'GET /api/video-reviews/:id':[
      requireAuth(),
      async (ctx:any)=>{
        try{
          const record=await readOwnerItem(ctx.user!.userId,ctx.params.id);
          return record?json(record):error('Granskningen hittades inte.',404);
        }catch{
          return error('Kunde inte läsa granskningsposten.',503);
        }
      },
    ],
    'POST /api/video-reviews/:id/decision':[
      requireAuth(),
      async (ctx:any)=>{
        const owner=ctx.user!.userId;
        const data=object(ctx.body);
        const id=ctx.params.id;
        const original=await readOwnerItem(owner,id).catch(()=>null);
        if(!original)return error('Granskningen hittades inte.',404);
        if((data.decision!=='request_changes'&&data.decision!=='mark_video_reviewed')||
           !Number.isSafeInteger(data.expectedVersion)||
           typeof data.expectedVideoSha256!=='string'||
           data.explicitOwnerAction!==true)
          return error('Ange ett giltigt uttryckligt beslut för exakt filmversion.',400);
        // Real authentication is platform-derived, not supplied in JSON.
        let next:SafeReviewItem;
        try{
          next=applyOwnerReviewDecision(original,{
            authenticatedOwnerId:owner,
            expectedVersion:data.expectedVersion as number,
            expectedVideoSha256:data.expectedVideoSha256 as string,
            explicitOwnerAction:true,
            reviewedAt:new Date().toISOString(),
          },data.decision as 'request_changes'|'mark_video_reviewed',
          data.checks as ReviewChecklist,data.comment as string);
        }catch(e){
          return error(e instanceof Error?e.message:'Granskningen kan inte sparas.',409);
        }
        try{
          const [ok]=await db.tx.update(RECORDS,[{
            id:original.id,
            record:next,
            if:{ownerId:owner,version:original.version,state:original.state}
          }],{patch:true});
          return ok?json(next):error('En annan granskning sparades samtidigt. Ladda om.',409);
        }catch(e){
          return isConflict(e)
            ?error('Granskningen ändrades samtidigt. Ladda om.',409)
            :error('Beslutet kunde inte sparas säkert. Kontrollera status innan du försöker igen.',503);
        }
      },
    ],
  };
}
