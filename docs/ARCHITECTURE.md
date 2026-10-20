# ViralOS AI v0.2 — implementation status

## Running application
React/TypeScript, server API, AppDeploy authentication, tenant-scoped transactional key-value records.
No PostgreSQL deployment or eve runtime is claimed. The local executor was unavailable and Lovable creation was rejected for insufficient account credits. AppDeploy is the implemented deployment target.

## Actual data model
viral_workspaces keyed by authenticated user ID:
version, paused agent IDs, bounded source observations (36 trends with 12 observations each),
up to 12 script projects, last 40 workspace events, saved settings.
All reads and writes obtain the workspace identity from verified authentication, never request body.
Changes use compare-and-set on version; concurrent edits produce 409 rather than overwrite.
viral_ai_jobs: chosen stable request ID, owner, trendId, status, generated project, actualCost=null.
viral_quota: global daily/monthly counters updated atomically with the request receipt.
viral_cache: HN snapshots fetched by a declared 30-minute platform cron.

## Working slices and limits
- Authenticated script create/read/edit/delete and source import persist on backend.
- Official HN topstories + item endpoint. Data is a technology signal, not a social platform trend.
- YouTube videos.list mostPopular adapter requires server-side YOUTUBE_API_KEY.
- HN cached server updates do not automatically import into personal workspaces.
- AI scripts: actual SDK generate, explicit per-user trial enable and per-request confirmation.
  Input is untrusted source title only. Output is original conceptual draft, not article summary.
  Exact provider credit costs are unknown. No claimed currency cost estimate.
  Automatic paid generation is disabled regardless of saved budgets. Trials explicitly exempt
  from euro budgets, with 6/day and 30/month global request caps. Ambiguous jobs never auto-retry.
- Real H264 MP4 browser encoding: original typography/motion, silent, 1080x1920, 24fps, 15-45sec.
  Uses WebCodecs and mp4-muxer. Browser verifies dimensions and duration, not full ffprobe QC.
  File is session-local and must be downloaded. Audio/AI footage generation not connected.
- Agent controls are durable configuration. They do not imply ten autonomous runtime agents.
- Calendar/OAuth publishing/performance metrics/early prediction remain explicitly unavailable.
- No external social posting occurs.

## Worker foundation
worker/render.py and worker/Dockerfile implement an offline FFmpeg baseline with optional owned
narration and ffprobe technical checks. Not deployed; no active job dispatcher is attached.
Export composition JSON in Video Studio, then:
docker build -t viralos-render worker
docker run --rm -v "$PWD:/work" viralos-render /work/composition.json /work/video.mp4
Optional third argument is a path to a 15-45 second narration file.
Scene timings are even, not word-level speech alignment. Natural TTS integration remains work.

## Next production phase
Migrate tenant records to PostgreSQL with workspaces/members, agent_configs, integrations,
channels/strategies, trends/observations, concepts/script_versions, assets/renders, QC/approvals,
jobs/events, publication_jobs/published_posts, metric_snapshots, budget_reservations/cost_ledger.
Implement durable worker leases, polling, recovery and idempotency. Reserve daily and monthly
money budgets atomically before any paid provider request using verified upper bounds.
Reconcile unknown outcomes before retry; do not release uncertain reservations.
Use eve after installing and reading its versioned docs when a supported runtime is available.

OAuth publishing must validate real per-platform capabilities. TikTok Direct Post has broad
audience requirements, express upload consent, editable previews and no default privacy selection.
It cannot be represented as an unattended own-account upload utility.
Meta needs professional Instagram / Facebook Page accounts, app permissions and applicable review.
YouTube uploads and analytics require OAuth; quota and verification conditions need current review.

No secret input fields in frontend. Store provider credentials through secure AppDeploy secret
entry links. Values are read only by backend secrets.readSecret. Never put them in chat or VITE_*.
Before public commercial rollout: supply actual privacy/terms, deletion/retention process,
processor agreements, licensing records, monitoring and account authorization reviews.

## v0.2 background queue
Implemented: 16 bounded dispatch slots, maximum 3 active jobs per authenticated workspace,
chosen request IDs and stable AI receipts, 10-minute fenced leases, future start within 7 days,
priority, cancellation of non-running jobs and per-workspace stop/resume.
A 5-minute platform cron processes up to two ready jobs. Source-only or one explicitly
approved source-to-script request can run with the browser closed. This is not recurring
autonomous paid production. A revoked AI trial or stop gate blocks future provider dispatch;
an already dispatched external request cannot be recalled.
Queue dispatch does not scan historical jobs. Owner index retains 40 historical IDs plus all
active IDs. Terminal receipts are preserved for replay protection. Private routes obtain user
identity only from auth. Heartbeat timestamps originate from actual scheduler executions.
Collection failures retry at most three attempts with exponential delay and jitter; the
scheduler cadence determines actual retry time. Unknown AI outcomes require review, never a
new paid attempt. The same receipt can recover an already persisted script.
New files: backend/queue.ts, src/queue-model.ts, src/JobCenter.tsx.
12 pure policy checks passed in code execution (due time, stop/pause, leases, terminal state,
backoff). This does not prove live database concurrency or end-to-end authentication. Those
need the defined QA workflows; do not claim them passed without platform results.
