# Qwen2.5 real response to actual English narration demo

Original text: real output from Qwen2.5 1.5B Instruct Q4_K_M in
GitHub Actions run 39668724323; first attempt was exactly 80 words.
AI output used single newlines for five scenes. Minimal reversible
formatting changed those to blank-line separators without adding, deleting
or rewording any English text. Source file is preserved as fixture.

Only if the ORIGINAL 80-word script passes full Shorts storyboard validation
does this isolated test render an evaluation-only 1080x1920 H264 MP4 with
real English Piper voice and approximate SRT. A model from the earlier
successful voice experiment is used; commercial/audio redistribution
rights remain unverified and video must not be publicly posted.

The workflow is gated by a temporary explicit PR title marker. We remove
that marker immediately after its one-time GitHub run is queued so that
routine later PR updates cannot incur repeated model/voice downloads.
No AppDeploy or YouTube credentials, no scheduling, no publication.
