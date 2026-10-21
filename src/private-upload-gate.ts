/**
 * Side-effect-free owner consent contract for an eventual private YouTube upload.
 *
 * DOES NOT upload, schedule, publish, authenticate or call any API.
 * The future backend MUST derive authenticatedOwnerId from verified server auth,
 * bind real MP4 SHA-256 to stored bytes, and persist changes atomically (CAS).
 */
export type FinishedVideoProof = {
  projectId: string;
  manuscriptRevision: number;
  sha256: string;
  bytes: number;
  mimeType: 'video/mp4';
  width: 1080;
  height: 1920;
  fps: 30;
  seconds: number;
  audioPresent: boolean;
  captionsSyncedByHuman: boolean;
  sourceClaimsHumanChecked: boolean;
  mediaRightsSelfAttested: boolean;
};

export type PrivateUploadAuthorization = {
  action: 'private_youtube_upload_only';
  privacy: 'private';
  channelId: string;
  title: string;
  description: string;
  exactVideoSha256: string;
  projectId: string;
  manuscriptRevision: number;
  authorizedBy: string;
  authorizedAt: string;
};

export type ReviewState = {
  ownerId: string;
  proof: FinishedVideoProof;
  status: 'awaiting_video_review' | 'video_reviewed' |
          'private_upload_authorized' | 'revoked';
  humanApprovalAt?: string;
  privateUploadAuthorization?: PrivateUploadAuthorization;
};

const isSha = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validTime = (value: string): boolean =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const cleanIdentity = (value: string): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 180 &&
  !/[\u0000-\u001f\u007f]/.test(value);

export function startVideoReview(ownerId: string, proof: FinishedVideoProof): ReviewState {
  if (!cleanIdentity(ownerId) || !cleanIdentity(proof?.projectId) ||
      !Number.isSafeInteger(proof.manuscriptRevision) || proof.manuscriptRevision < 1 ||
      !isSha(proof.sha256) || !Number.isSafeInteger(proof.bytes) || proof.bytes <= 0 ||
      proof.mimeType !== 'video/mp4' || proof.width !== 1080 ||
      proof.height !== 1920 || proof.fps !== 30 ||
      !Number.isFinite(proof.seconds) || proof.seconds < 5 || proof.seconds > 60)
    throw new Error('Exact saved 9:16 MP4 proof is required.');
  if (proof.audioPresent !== true || proof.captionsSyncedByHuman !== true ||
      proof.sourceClaimsHumanChecked !== true ||
      proof.mediaRightsSelfAttested !== true)
    throw new Error('Audio, speech-synced captions and operator fact/rights checks are required.');
  // Verification flags are HUMAN SELF-ATTESTATIONS, not independent rights checks.
  return { ownerId, proof: { ...proof }, status: 'awaiting_video_review' };
}

export function approveExactVideo(
  review: ReviewState,
  args: {
    authenticatedOwnerId: string;
    expectedSha256: string;
    expectedRevision: number;
    explicitHumanApproval: boolean;
    timestamp: string;
  },
): ReviewState {
  if (review.status !== 'awaiting_video_review' ||
      args.authenticatedOwnerId !== review.ownerId ||
      args.explicitHumanApproval !== true || !validTime(args.timestamp) ||
      args.expectedSha256 !== review.proof.sha256 ||
      args.expectedRevision !== review.proof.manuscriptRevision)
    throw new Error('Matching authenticated human video approval is required.');
  return { ...review, status: 'video_reviewed', humanApprovalAt: args.timestamp };
}

export function authorizeExactPrivateUpload(
  review: ReviewState,
  args: {
    authenticatedOwnerId: string;
    expectedSha256: string;
    expectedRevision: number;
    channelId: string;
    title: string;
    description: string;
    privacy: 'private';
    explicitSeparateUploadConsent: boolean;
    timestamp: string;
  },
): ReviewState {
  if (review.status !== 'video_reviewed' ||
      args.authenticatedOwnerId !== review.ownerId ||
      args.expectedSha256 !== review.proof.sha256 ||
      args.expectedRevision !== review.proof.manuscriptRevision ||
      args.privacy !== 'private' ||
      args.explicitSeparateUploadConsent !== true || !validTime(args.timestamp))
    throw new Error('Exact separate private-upload consent is required.');
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(args.channelId) ||
      typeof args.title !== 'string' || !args.title.trim() || args.title.length > 100 ||
      /[\r\n\u0000-\u001f]/.test(args.title) ||
      typeof args.description !== 'string' || args.description.length > 5000 ||
      /[\u0000-\u0008\u000e-\u001f]/.test(args.description))
    throw new Error('Invalid YouTube channel or metadata.');
  return {
    ...review, status: 'private_upload_authorized',
    privateUploadAuthorization: {
      action: 'private_youtube_upload_only', privacy: 'private',
      channelId: args.channelId,
      title: args.title,
      description: args.description,
      exactVideoSha256: review.proof.sha256,
      projectId: review.proof.projectId,
      manuscriptRevision: review.proof.manuscriptRevision,
      authorizedBy: review.ownerId,
      authorizedAt: args.timestamp,
    },
  };
}

export function revokeVideoUploadConsent(review: ReviewState): ReviewState {
  return { ...review, status: 'revoked', privateUploadAuthorization: undefined };
}

/**
 * Fail closed if the manuscript revision or exact media bytes have changed.
 * Still does NOT give any publication or public-visibility permission.
 */
export function canExecutePrivateUpload(
  review: ReviewState,
  authenticatedOwnerId: string,
  currentRevision: number,
  currentSha256: string,
  channelId: string,
): boolean {
  const consent = review.privateUploadAuthorization;
  return review.status === 'private_upload_authorized' &&
    consent?.privacy === 'private' &&
    consent.action === 'private_youtube_upload_only' &&
    review.ownerId === authenticatedOwnerId &&
    consent.authorizedBy === authenticatedOwnerId &&
    consent.manuscriptRevision === currentRevision &&
    review.proof.manuscriptRevision === currentRevision &&
    consent.exactVideoSha256 === currentSha256 &&
    review.proof.sha256 === currentSha256 &&
    consent.channelId === channelId;
}
