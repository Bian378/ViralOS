# Real free-language-model -> voice -> MP4 experiment

This isolated GitHub Actions trial tests Qwen2.5 1.5B Instruct Q4_K_M
(986MB Ollama model; Apache-2.0). It uses real local inference only.
https://ollama.com/library/qwen2.5:1.5b-instruct-q4_K_M

At most two local model calls. The validator accepts ONLY 80-150 words,
3-8 paragraphs, a 3-8 word opening hook, valid source/metadata and
approximate under-one-minute narration. No automatic truncation or manual
bypass of failed scripts. If neither draft passes, it saves the rejected
outputs and DOES NOT create a video.

Only a valid model-written original fictional manuscript may reach Piper TTS.
Audio uses en_US-joe-medium for internal EVALUATION ONLY; the model card
says the CC0 Joe recording was fine-tuned from Lessac. Its full upstream
commercial reuse conditions have NOT been independently cleared.
Voice, captions and footage still require human review before any public
release; the video is an original text-based prototype, not realistic AI film.

GitHub Action downloads model files at test time and may use paid/limited
GitHub-hosted runner minutes. No AppDeploy credits, YouTube API quota or
paid AI providers are consumed. No scheduled jobs or video publication.

Workflow on PR only when its own workflow file changes; after the trial we
will disable repeat runs. No model files are committed or saved as artifacts.
