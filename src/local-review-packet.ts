/** Local MP4 evidence for human review only. This does not sign, upload or approve media. */
export type LocalStudioDraft = {
  title: string;
  script: string;
  sourceUrl: string;
  origin: string;
};

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function buildLocalReviewPacket(
  video: Blob,
  draft: LocalStudioDraft,
  options: { narrationPresent?: boolean } = {}
) {
  const title = draft.title.trim();
  const script = draft.script;
  const sourceUrl = draft.sourceUrl.trim();
  if (!title || title.length > 160) throw new Error('Ange först en titel i Videostudio.');
  if (script.length < 80 || script.length > 3500 ||
      script.trim().split(/\s+/u).length > 180) {
    throw new Error('Granskningsfilen kräver ett manus med minst 80 och högst 3500 tecken.');
  }
  if (sourceUrl && !sourceUrl.startsWith('https://')) {
    throw new Error('Källänken måste vara HTTPS, eller lämnas tom för ett eget manus.');
  }
  if (video.size < 1024 || video.size > 150 * 1024 * 1024) {
    throw new Error('MP4-filen måste vara mellan 1 kB och 150 MB.');
  }
  const bytes = await video.arrayBuffer();
  if (new TextDecoder().decode(new Uint8Array(bytes, 4, 4)) !== 'ftyp') {
    throw new Error('Videon har ingen igenkännbar MP4-container.');
  }
  return {
    schemaVersion: 1,
    kind: 'viralos-local-unapproved-review-item',
    state: 'LOCAL_DRAFT_AWAITING_OWNER_REVIEW',
    source: 'browser_studio_unapproved_not_authenticated_or_synced',
    title,
    topic: title,
    sourceUrl,
    video: {
      relativePath: 'preview/short-DRAFT.mp4',
      sha256: await sha256(bytes),
      width: 1080,
      height: 1920,
      fps: 30,
      visualStyle: 'kinetic_procedural',
      containsThirdPartySourceFootage: false,
      narrationPresent: options.narrationPresent === true,
    },
    script: {
      text: script,
      sha256: await sha256(new TextEncoder().encode(script).buffer as ArrayBuffer),
      words: script.trim().split(/\s+/u).length,
      selectedDraftRole: null,
    },
    editorial: {
      rolesActuallyInvoked: [] as string[],
      localModelCalls: 0,
      managerModelCallSkipped: false,
      realNeuralInferenceUsed: false,
    },
    permissions: {
      ownerApproved: false,
      privateYouTubeUploadAuthorized: false,
      publicYouTubeReleaseAuthorized: false,
      canAutomaticallyPublish: false,
    },
    canBeImportedIntoAuthenticatedQueueAutomatically: false,
  };
}
