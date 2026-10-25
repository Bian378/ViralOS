# ViralOS v31 media validation fix — 2026-10-25

Deployed AppDeploy snapshot: `1792922753665` (v31).

Reported user issue: Chrome on macOS rejected local 21-second audio/video self-test with generic `Videons format eller längd stämmer inte` after loadedmetadata.

Changes: independently verify MP4 moov/mvhd duration, trak/tkhd display size and vide/soun count; wait for decoded HTMLVideoElement loadeddata rather than rejecting early on loadedmetadata; permit 1088 H.264 macroblock padded decoded width only when actual MP4 video track is 1080×1920; return concrete reported dimensions and duration when invalid. Update local self-test proof output and durable test plan. No billing, publishing, OAuth, API keys, user media or original drafts touched.

AppDeploy build/automated smoke QA passed. Mac end-to-end self-test on the actual client requires the owner to rerun after refresh. Do not claim AI voice generation or YouTube release is connected; publication remains blocked.
