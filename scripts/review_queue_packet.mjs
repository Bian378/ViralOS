/**
 * Immutable REVIEW-ONLY metadata for a future authenticated dashboard Inbox.
 * No server writes, owner assignment, publishing rights or network actions.
 * Render and QC hashes must already have passed on the local runner.
 */
import {createHash} from 'node:crypto';

export function createLocalReviewPacket({topic,sourceUrl,manifest,report,videoSha256,visualStyle}) {
  if(typeof topic!=='string'||!topic.trim()||topic.length>180||
     typeof sourceUrl!=='string'||!sourceUrl.startsWith('https://'))
    throw Error('Review packet needs original topic and source reference.');
  if(!manifest||manifest.notForPublication!==true||
     manifest.status!=='unapproved_preproduction'||
     manifest.scenePlan?.needsOwnerApproval!==true)
    throw Error('Review packet accepts only unapproved source manifests.');
  const scenes=manifest.scenePlan.scenes;
  if(!Array.isArray(scenes)||scenes.length<1||
     scenes.some(s=>typeof s?.text!=='string'||!s.text.trim()))
    throw Error('A complete reviewed storyboard is required.');
  if(typeof videoSha256!=='string'||!/^[a-f0-9]{64}$/.test(videoSha256))
    throw Error('An independently verified video SHA-256 is required.');
  if(!['typography_static','kinetic_procedural'].includes(visualStyle))
    throw Error('Unknown video visual style.');
  if(!report||report.publicReleaseAuthorized===true||
     report.published===true||report.humanApproved===true)
    throw Error('An authorized/published result is not a pending review packet.');
  const stageRoles=report.rolesExecuted??report.rolesRun;
  if(!Array.isArray(stageRoles)||stageRoles.length<1||stageRoles.length>4)
    throw Error('Missing bounded editorial stage history.');
  const modelCalls=report.modelCalls??stageRoles.length;
  if(!Number.isSafeInteger(modelCalls)||modelCalls<1||modelCalls>4||
     modelCalls!==stageRoles.length)
    throw Error('Editorial stage receipt does not match local model calls.');
  const script=scenes.map(scene=>scene.text).join('\n\n');
  const scriptSha256=createHash('sha256').update(script,'utf8').digest('hex');
  if(report.selectedDraftSha256&&report.selectedDraftSha256!==scriptSha256)
    throw Error('Script provenance changed before dashboard export.');
  const metadata=manifest.scenePlan;
  return {
    schemaVersion:1,
    kind:'viralos-local-unapproved-review-item',
    state:'LOCAL_DRAFT_AWAITING_OWNER_REVIEW',
    source:'offline_file_only_not_authenticated_or_synced',
    title:metadata.title,
    topic,
    sourceUrl,
    video:{
      relativePath:'preview/short-DRAFT.mp4',
      sha256:videoSha256,
      width:metadata.width,height:metadata.height,
      fps:metadata.fps,visualStyle,
      containsThirdPartySourceFootage:false,
    },
    script:{
      sha256:scriptSha256,
      text:script,
      words:metadata.totalWords,
      selectedDraftRole:report.selectedDraftRole??null,
      selectionRule:report.candidateSelectionRule??null,
      stageOutputsIndependentlyAudited:false,
    },
    editorial:{
      rolesActuallyInvoked:[...stageRoles],
      localModelCalls:modelCalls,
      managerModelCallSkipped:Boolean(report.managerModelCallSkipped),
      realNeuralInferenceUsed:report.realModelUsed===true,
      provider:report.provider??'unreported_legacy',
      formatOnlyPassed:report.manuscriptFormatPassed??null,
      claimsToVerify:report.claimFlagsFromUnverifiedReview??null,
    },
    reviewChecks:{
      sourceFacts:'NOT_VERIFIED',
      writingQuality:'NEEDS_HUMAN_REVIEW',
      thirdPartyRights:'NOT_VERIFIED',
      voiceLicense:'NOT_VERIFIED',
      captionSync:'ESTIMATED_NOT_SPEECH_ALIGNED',
      finalVideo:'NEEDS_HUMAN_REVIEW',
    },
    permissions:{
      ownerApproved:false,
      privateYouTubeUploadAuthorized:false,
      publicYouTubeReleaseAuthorized:false,
      canAutomaticallyPublish:false,
    },
    canBeImportedIntoAuthenticatedQueueAutomatically:false,
    appDeployCreditsUsed:0,
  };
}
