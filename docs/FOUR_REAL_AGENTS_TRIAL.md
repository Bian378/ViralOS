# First four REAL local neural editorial agents – one-off feasibility

This opt-in GitHub trial uses Qwen2.5 1.5B (Apache-2.0) on an ephemeral
GitHub runner, with exactly FOUR real sequential local Ollama chat calls:
creative -> research/claim flagger -> quality rewrite -> editorial manager.

The research stage does NOT browse, verify claims or clear media licenses.
All title/topic/source reference and earlier drafts are untrusted data.
A completed run is not an approved piece of content. The final manager
script is checked against the same deterministic 80-150 word storyboard
as the rest of ViralOS. Failed final scripts stay unapproved in a report
and NO video is rendered. A passing script may produce only a SILENT
original motion-graphic draft MP4, for review, not public distribution.

Model size ~1GB; GitHub-hosted runner minutes and bandwidth may count
against the account quota. One launch only; workflow is gated by an
explicit temporary PR title marker removed once queued. No scheduled
execution, AppDeploy, social uploads, third-party footage or paid AI.

GitHub Actions report retention 2 days; output weights not saved.

## Operator commands – no AppDeploy use

After installing Node 22.16+, Ollama and the Apache-2.0 Qwen2.5 1.5B
model **on your own computer**, explicitly run:

    node --experimental-strip-types scripts/run_four_real_agents.mjs \
      --topic "An original fictional game world" \
      --source-url https://example.org/fictional-reference \
      --out-dir ./unapproved-four-agents --allow-four-local-calls

Four model calls run in order. Each has a bounded local-only request.
The research stage flags uncertain claims without opening any website.
A good output folder contains `four-agent-review-UNVERIFIED.json` and
`source-DRAFT.json`; a rejected result contains ONLY the report.

To preview a validated script using royalty-free *procedural* animation:

    python3 worker/build_short_draft.py \
      ./unapproved-four-agents/source-DRAFT.json ./four-kinetic-preview \
      --silent-preview --kinetic-preview

    python3 worker/verify_draft.py ./four-kinetic-preview

Do not run the video step unless the source-DRAFT.json exists.
No background schedules, source-video downloads, YouTube uploads,
license clearance, independent fact checking or AppDeploy use occur.
A successful pipeline is STILL an unapproved local production draft.

CI mock tests confirm safety contracts but DO NOT prove genuine AI model quality.
The genuine four-stage workflow test has a temporary title flag. It must stay
disabled after its single authorized demonstration; repeated GitHub-hosted
runs can consume finite runner quotas. Real results should be documented
separately without confusing model failure with CI harness failure.

## Actual four-agent trial: verified outcome

- GitHub run 39672945066 really loaded Qwen2.5 1.5B and executed
  creative, research/claim-flags, quality rewrite and manager in order.
- All four stages returned outputs and produced a full review report.
- Initial and later proposed scripts repeated nearly identical 444-word
  markdown-formatted content. The research model returned NO_VERIFIED_FACTS.
- The strict 80-150 word/paragraph storyboard validator rejected the
  manager output; **no MP4 was generated** and publication stayed disabled.
- This is evidence that four real model calls work, NOT that the model
  collaborates effectively or produces publishable content.

Improvements after this observation:
- Strict per-role generation budgets: research 120 tokens, others 260.
- Model gets at most a 125-word excerpt from oversized previous scripts,
  instead of echoing 444 words in every subsequent stage. The original
  full responses remain in the unapproved report.
- Rewrite prompts emphasize original, condensed 90-110 word Shorts
  instead of repeating previous stage output.
- Both these improvements are covered by no-network unit tests.

An additional opt-in single-run model experiment checks whether those
changes help. Never weaken factual review, rights review, owner approval
or the production format gate to improve the pass rate.

## Follow-up genuine trial with shorter prompts: result

- GitHub run 39674109622 used the same four genuine Qwen2.5 1.5B agents,
  sequentially and with bounded previous-stage excerpts and token ceilings.
- This time the creative model produced about 20 words; quality repeated
  roughly 20 and the manager returned 19 words. The research stage again
  identified nothing externally verified, and no web browsing took place.
- The result was MANUSCRIPT_REJECTED_BY_VALIDATOR (too few words).
  No video was rendered or uploaded; the receipt explicitly says
  publicReleaseAuthorized=false and humanApproved=false.
- The first genuine trial was 444 words (too long); the second was
  19 words (too short). Both runs technically completed four model stages.
- Ordinary test suite remains green; it verifies contracts, not whether
  the tiny local language model can produce a compelling manuscript.
- The GitHub experiment workflow now writes both *technical* completion and
  *content* acceptance separately to the Actions step summary, to avoid
  mistaking an all-green workflow for publishable editorial content.

**Recommendation:** Do NOT relax the script gate to force a success.
Test a more capable local language model, and split agents by narrow
responsibilities (draft creation, claim flagging, concise quality edits,
final validation) before spending more GitHub-hosted runner minutes.
Prefer hardware installed on the user's own machine or an explicitly
budget-approved compute environment for ongoing experiments.
