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
