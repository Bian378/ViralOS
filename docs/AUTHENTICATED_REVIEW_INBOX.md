# Authenticated ViralOS review inbox – development integration status

## Code implemented in GitHub development branch

- `backend/review-routes.ts` adds `GET /api/video-reviews`,
  `GET /api/video-reviews/:id`, and `POST /api/video-reviews/:id/decision`.
- Every endpoint requires the existing AppDeploy `requireAuth()` guard;
  owner ID is read from `ctx.user!.userId`, never user-supplied JSON.
- The owner index is loaded by owner and each review record is additionally
  checked for that same owner before any script/metadata is returned.
- Reviewer decisions require an explicit action, exact video SHA-256,
  matching expected version and full human checklist for `video_reviewed`.
  Database update uses compare-and-swap on owner, state and version.
- A review decision can never authorize a private upload or public release.
- `trustedAddStoredReview()` is intentionally server-only. There is **NO**
  `/import` or `/upload` route. Its future trusted caller MUST have already
  saved actual MP4 bytes in access-controlled storage and independently
  computed/verified their SHA-256 before calling it.
- `src/ReviewInboxPreview.tsx` lists owner-scoped review metadata with
  an authenticated API provided by the existing `src/App.tsx` shell.
  Locally loaded JSON + MP4 remain browser-memory only, verified by SHA.
  Neither UI has an automatic YouTube upload button.

## Verification and critical limitations

- `tests/backend-review-routes.test.mjs` bundles the actual route module
  and injects a transactional fake for the AppDeploy SDK. It tests
  authentication middleware, owner isolation, content digests, explicit
  review checks and stale/double-update protections. This is a MOCK
  DB/auth integration test, not a run against hosted AppDeploy.
- Existing `src/review-inbox.ts` tests separately assert domain transitions
  and the `src/private-upload-gate.ts` suite tests later opt-in permission.
- The SDK reference and deployment are presently blocked by insufficient
  AppDeploy daily free credits. SDK runtime compatibility MUST be verified
  before production merge. Do not call this a deployed feature.
- **Not implemented:** private MP4/media storage, server recomputation of
  the bytes' SHA-256, CSRF-safe upload handshakes, production thumbnail or
  media playback route, durable import from GitHub runner, verified user
  ownership of media blobs, and YouTube OAuth upload/visibility workflow.
- Since no trusted stored-media importer is hooked up, the live queue
  starts empty, and the dashboard intentionally shows that imports are
  unavailable. Do not allow manually supplied `exactByteVerificationPassed`
  in a client request or use a client-provided hash as proof of media.

## Next AppDeploy steps (only when credits permit)

1. Read current AppDeploy storage/auth/database SDK contracts.
2. Implement private object storage and signed upload with small size limits.
3. Independently stream/read saved media server-side and SHA-256 hash it.
4. Complete a server-owned, per-user transactional import, with idempotent
   request IDs and trusted byte proof, preserving a separate approvals table.
5. Test two real AppDeploy accounts and simultaneous-review races.
6. Deploy only after a successful build/QA. Keep private YouTube consent
   and public release as separate owner actions.

## Independent streamed stored-MP4 digest (new)

`backend/verified-media-bytes.ts` reads a trusted private media byte stream,
enforces a strict 150 MB maximum, requires a nonempty MP4 `ftyp` header
and computes SHA-256 from the actual stream. No client-supplied checksum
or `exactByteVerificationPassed` boolean can replace this read in
`trustedAddStoredReview` – it now requires a server-only byte reader.

The SHA and header prove byte identity and rule out obvious non-MP4
input, **not** that the file is decodable, safe, properly licensed, or
synced to narration. Full server-side ffprobe/codec and user review
remain mandatory before private upload or publication. The private object
storage reader that will supply these bytes is still NOT implemented;
there is intentionally no browser-accessible import route.

`tests/backend-review-routes.test.mjs` uses synthetic in-memory bytes
with an MP4-looking header to validate stream hashing and rejection of
tampering. It never claims to prove that synthetic bytes are a playable
video. Real FFmpeg end-to-end tests separately verify rendered MP4 output.
