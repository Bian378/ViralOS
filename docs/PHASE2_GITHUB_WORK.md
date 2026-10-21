# ViralOS phase 2 – GitHub-only development (2026-10-21)

## Code source and isolation
- Live AppDeploy app ID: viralos-ai-dtmneg; live production remains unchanged.
- AppDeploy pinned source snapshot: 1792594434031.
- Branch: work/viralos-phase2-20261021. Existing main branch is not updated.
- The 34 snapshot files are synchronized without runtime records or environment secrets.
- The older GitHub SOURCE_EXPORT.json described snapshot 1792532684833; it will be replaced with accurate metadata on this branch.
- The latest AppDeploy code uses a stopped scheduler (cron.json is an empty array).

## New staged agent-workflow contract
src/agent-workflow.ts is a pure transition module preparing a four-role chain:
1. creative (manusförslag)
2. research (frågor att verifiera; not factual verification)
3. quality (language and structure proposal)
4. manager (aggregated recommendation)

Each provider call is an independent opt-in step, requiring:
- explicit affirmative owner consent;
- known positive credit quote and an owner-approved positive upper bound;
- the exact current script revision and a unique call claim;
- a running claim recorded durably before any provider request;
- no automatic retry when a paid response may be uncertain.

The module itself performs NO provider calls, billing, uploads, publication or project edits.
A completed chain can only transition to awaiting_owner_review. It cannot approve content.

## Test the module without AppDeploy
Node 22+:
    node --experimental-strip-types --test tests/agent-workflow.test.mjs

This checks eight scenarios, including stage ordering, bounded owner consent,
version mismatches, duplicate dispatch prevention, malformed responses,
unknown-cost failures, cancellation and no implicit publishing.

## What is NOT completed
- This module is not yet wired into the AppDeploy backend, persistent database or UI.
- No real AI agents have run and no AI credits were used for this feature.
- Before integration, implement authenticated owner-scoped persistence with CAS/atomic
  claim transitions; verify spend limits with an authoritative provider quote.
- Validate all source material and copyright status; never infer Shorts format or rights
  from a YouTube title or link alone.
- Repeat app's QA in AppDeploy after deployment quota permits, including failure paths,
  login/account isolation, manuscript approval revocation and separate upload consent.
- Do not enable cron, third-party uploads, autoplay, paid tasks or merges automatically.

## Follow-on planned changes
1. Reconcile source snapshot with the AppDeploy deployment state and test builds.
2. Add authenticated persistence and an owner-facing per-call confirmation dialog.
3. Add source-supported script generation and separate editor/fact-check proposals.
4. Keep final manuscript and exact media approval distinct from upload authorization.
