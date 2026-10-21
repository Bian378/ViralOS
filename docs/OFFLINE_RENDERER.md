# Free, offline ViralOS MP4 proof-of-concept

The production manifest downloaded from **Videostudio → Scenplan och undertexttiming**
can be passed to `worker/render_from_plan.py` on a computer with Python 3.10+
and FFmpeg / ffprobe and a font at `/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`.

```bash
python3 worker/render_from_plan.py viralos-example-DRAFT.json preview.mp4
# Optional separate WAV that the operator has a license/ownership right to use:
python3 worker/render_from_plan.py viralos-example-DRAFT.json preview.mp4 \
  --narration voice.wav --audio-rights-checked
```

- Renders original title/script typography and estimated caption overlays only.
- **Not AI voice generation.** If no audio is supplied, the output is silent.
- Strictly no external footage, assets, network downloads, provider charges, or uploads.
- A `.qc.json` report is written beside the MP4 after validating H.264, 1080 × 1920,
  30 fps and audio presence.
- If a separate narration file is present, its duration must be within 0.75 seconds
  of the planned length; this does *not* make per-word captions speech-synchronized.
- Rendering is private and produces an unapproved draft. A human must review facts,
  visual rights, output quality, final subtitles, final MP4, and separate publication.
- The worker is not connected to AppDeploy jobs. Do not enable it automatically.
- On platforms other than Debian/Linux, install DejaVu Sans and adjust `FONT` accordingly.

Offline tests:
```bash
python3 -m unittest discover -s worker/tests -p 'test_*.py' -v
```

## Free local Piper English AI voice preparation

An **optional** local Piper voice can prepare an original WAV without consuming
AppDeploy API credits. Piper Python module (`pip install piper-tts`), its matching English ONNX model and configuration,
and your own check of that model's redistribution/commercial-usage license are
required first. Nothing is automatically downloaded or installed.

```bash
python3 worker/local_voiceover.py \
  viralos-example-DRAFT.json /local/english-voice.onnx narration.wav \
  --voice-license-checked
python3 worker/render_from_plan.py \
  viralos-example-DRAFT.json preview-with-voice.mp4 \
  --narration narration.wav --audio-rights-checked --fit-narration
```

Piper's CLI expects model `*.onnx` and matching `*.onnx.json`. Use an English
model with a license allowing your intended use; model availability and quality
are **not guaranteed**, and a natural voice is not verified until tested.
An explicit license checkbox is a user assertion, not automatic verification.
Do not use another person's voice without permission.

If the generated WAV runs longer than our 170-word-per-minute time estimate,
`--fit-narration` proportionally adjusts frame-based scene/caption durations
without changing vocal speed. This is still **estimated** caption timing,
NOT speech-level synchronization. It does not convert the draft into an
approved or published video. It creates only a local draft MP4/QC JSON.

CI uses synthetic WAV tones to check AAC audio muxing and proportional scene
retiming. A tone is not a Piper voice and should never be passed off as one.

The current OHF-Voice Piper CLI is used: `python -m piper -m name --data-dir /already/local/voices -f output.wav -- "English script"`. Piper is not bundled or installed automatically. The model license is a separate operator responsibility.

## Optional animated procedural Shorts preview

Render with `--kinetic-preview` to add an animated moving radial gradient,
scene counter, subtle title drift, fade-in captions and lightweight graphic
accents. It uses only **local FFmpeg source filters and DejaVu Sans**, without
any external images, licensed stock clips, scene-generation AI or downloads:

    python3 worker/build_short_draft.py source-DRAFT.json kinetic-draft --silent-preview --kinetic-preview

Or with an already owned/licensed WAV voice file:

    python3 worker/build_short_draft.py source-DRAFT.json kinetic-voice-draft \
      --narration narration.wav --audio-rights-checked --kinetic-preview

Default videos use the original simple typography style and are unchanged.
The package receipt and MP4 QC mark `visualStyle: kinetic_procedural` or
`typography_static`, and integrity verification rejects mismatches.
The scene motion is a procedural **2D design**, NOT AI-generated 3D film or
copyright-cleared real-world video. Caption timing is still approximate.
All results remain unapproved DRAFTS; commercial Piper voice licenses need
their own legal review before a public/monetized short.
