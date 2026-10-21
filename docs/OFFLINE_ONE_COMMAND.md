# ViralOS: one-command offline production package

Run from the GitHub work branch. Requires Python 3.10+, FFmpeg, ffprobe and
DejaVu Sans on Linux. This local script uses no AppDeploy credits and
makes no network API calls or automatic platform uploads.

Prepare a saved manuscript and export the -DRAFT.json manifest from
Videostudio **once the pending UI branch is deployed**; until then a
format-compatible manifest may be supplied manually.

### 1. Silent private preview

    python3 worker/build_short_draft.py source-DRAFT.json my-draft --silent-preview

### 2. Add your own licensed voice recording

    python3 worker/build_short_draft.py source-DRAFT.json voice-draft --narration /myfiles/voice.wav --audio-rights-checked

### 3. Optional local English Piper narration

    python3 worker/build_short_draft.py source-DRAFT.json piper-draft --piper-model /voices/en_US-model.onnx --voice-license-checked

The optional Piper mode requires the locally installed piper-tts Python module,
an existing English .onnx voice model and matching .onnx.json, and your own
confirmation that the model license permits your intended use. It downloads
neither models nor dependencies, and real Piper audio has NOT been tested.

Each run creates a *new* destination folder with:
- source-DRAFT.json (frozen input)
- short-DRAFT.mp4 (local text/video preview, optional narration)
- short-DRAFT.qc.json (FFprobe format inspection)
- draft-receipt.json (manifest, video and audio SHA-256 hashes)
- optional local .wav and voice QC metadata.

An existing directory is never intentionally overwritten. Failed runs remove
the newly reserved output directory but preserve original user inputs.
The captions are only approximately rescaled to speech length; no precise
word recognition or time alignment has been implemented.
Receipt does not approve facts, copyrighted assets, media, uploads or release.

CI smoke tests use synthetic tones, not an actual English AI voice.
GitHub Actions CI and installation of packages can still use GitHub-hosted
runner quotas; the pipeline itself does not charge AppDeploy credits.
