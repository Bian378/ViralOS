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
