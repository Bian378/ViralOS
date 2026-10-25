# ViralOS v32: Chrome AAC duration fix

**AppDeploy snapshot:** `1792933899953` (2026-10-25).

User reproduced a real 21-second browser MP4 test that muxed to 22.42 seconds with valid H.264 1080×1920, one video and one AAC track. The browser media validation correctly rejected the excessive duration.

Likely root cause: `AudioEncoder.flush()` ran every 48 AAC input blocks (~1.024 seconds), repeatedly emitting priming/tail encoder padding. The output callback normalized *all* packets to sequential 1024-sample timestamps, accumulating extra padding into the movie duration. MDN recommends a flush only after queueing all desired input.

Changes: keep async event loop yields but remove intermediate AAC flushes; one final flush only; fail closed if packet count exceeds expected PCM duration plus six AAC frames or if encoded duration exceeds original PCM duration by 0.2 seconds; compare MP4 `mvhd` duration to expected video duration with 0.25-second tolerance and report expected length if mismatched. All media remains local pending explicit owner review, no API AI cost and no YouTube publication.

Status: AppDeploy build and automated QA green, but exact Chrome/macOS 21-second end-to-end media result awaits retest by the owner. No live video/audio claims before that verification.
