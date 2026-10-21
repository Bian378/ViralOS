# Safe editorial candidate selection – offline ViralOS

## Purpose

Qwen2.5 1.5B executed four genuine local editorial roles in two separate
trials but produced unsuitable 444-word and 19-word manager scripts.
Instead of giving the manager exclusive power to overwrite an already
format-valid original, the pipeline now evaluates the ORIGINAL unchanged
creative, quality and manager drafts with the same deterministic Shorts
storyboard validation. The research role cannot provide eligible narration.

Selection priority: **manager → quality → creative**, first candidate that
passes the 80–150 word, 3–8 paragraph, 3–8 word hook and estimated duration
constraints. That ordering is deterministic, **not an AI quality ranking**.
Stage results are preserved in full for later owner review.

The only automatic format repair accepted by the existing verifier is
converting single line separators to paragraph breaks without altering any
words. The system never concatenates, fabricates, truncates or changes words
to force a passing script. If NO candidate passes, there is NO draft manifest
and no FFmpeg call. A provider failure aborts without automatic retries.

## Provenance and review

- Every candidate gets a format-only acceptance audit.
- The selected script is SHA-256 hashed.
- On the optional real-four-chat → video path, the MP4 builder checks that
  the actual scene-plan script yields that SAME SHA-256, and rejects missing
  or forged selection origin, hash and publication locks before rendering.
- The selection report has separate `finalWordCount` (manager's original),
  `selectedWordCount`, `selectedDraftRole`, `selectedDraftFromPriorAgent`,
  `selectedDraftSha256` and `editorialCandidateChecks`.
- Every successful video is still marked `UNVERIFIED_DRAFT_REQUIRES_HUMAN_REVIEW`.
  No public release, upload, rights clearance, source verification, English
  fluency check or creative assessment is represented by a format pass.
- The user must independently review facts, copyright rights, speech,
  captions and the final version before any YouTube-publication workflow.

## What CI has and has not demonstrated

`tests/editorial-candidate-selection.test.mjs` demonstrates that an
archived REAL Qwen2.5 80-word English creative script can survive a simulated
bad manager rewrite. `scripts/smoke_select_fallback_short.mjs` tests the
same archived AI-authored text through simulated later agent stages into a
REAL locally rendered kinetic MP4 and its hash-based verification.

**The CI run is NOT four real new model calls and NOT an automatic live
trend-to-video production.** Actual prior four-model trials did not
produce any approved format-valid Short. The fallback is code-level
resilience, not a claim that Qwen2.5 1.5B is now dependable.

All work remains in the unmerged draft PR. No changes to the live
AppDeploy site, Google/YouTube credentials or publishing gates.

## Portable local draft review packet for future dashboard integration

`scripts/review_queue_packet.mjs` produces a `review-queue-item-DRAFT.json`
file only AFTER a local MP4 and its SHA-256 have passed the existing
unapproved-video verification. It records selected manuscript SHA,
selected agent, stages and local model call count, MP4 relative path,
rendering metadata, and a human review checklist.

The packet is NOT inserted into any live database or authenticated
dashboard; it is a **local export format** only. Owner identity and
permissions MUST be established by a server-side authenticated review
queue when the deployment integration is eventually implemented.

The review item always contains `canAutomaticallyPublish: false`,
explicit unverified factual/rights/voice/caption quality statuses,
and owner review pending. The item cannot authorize private YouTube
upload or public release. A malicious video hash, altered script SHA
or already-authorized report fails packet creation.
