# Experimental REAL Piper neural voice / review-only media

- GitHub Actions: `.github/workflows/experimental-piper-voice.yml`.
- Triggers on adding the experiment workflow in our **draft PR**. Manual workflow dispatch is also listed, but no workflow runs on schedules.
- This experiment uses the latest official `piper-tts` Python package and a temporary `en_US-joe-medium` English model downloaded by GitHub Actions.
- Model information: <https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/joe/medium/MODEL_CARD>. Its own dataset is marked CC0, but the voice card states **finetuned from lessac**; because the upstream lessac dataset may impose limitations, the generated artifact is ONLY for internal evaluation, **not licensed for commercial/public output by our tests**.
- The experiment generates synthetic fictional commentary, actual neural WAV and actual vertical H264 MP4 with estimated captions. Tests never touch user data, a real YouTube channel, external copyrighted source footage, the AppDeploy runtime or paid provider tokens.
- Temporary CI voice model files are never committed to GitHub or saved as artifacts.
- Human voice quality, pronunciation, commercial rights, speech/caption alignment and YouTube suitability must still be reviewed. The MP4 is explicitly unapproved and NOT uploaded to social media.
- Repo workflow may consume GitHub Actions minutes/bandwidth even without AppDeploy credits; no guarantee of unlimited free GitHub minutes. Artifact retained for 2 days.
- **Do not automatically rerun this expensive experiment on later unrelated commits**; CI exists in draft PR for one feasibility check.

Latest experiment succeeded on Actions run 39663551380. Real H264+AAC
draft duration 43.066667 seconds. No public release or commercial-rights
approval. Automated reruns on pull_request have been switched off.