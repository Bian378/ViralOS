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
