# Experiment with real local Ollama inference

Draft-PR GitHub Actions experiment runs official Ollama on isolated ephemeral runner.
Downloads qwen3:0.6b (~523 MB), Apache 2.0 weights,
see https://ollama.com/library/qwen3:0.6b-q4_K_M.
Executes ONE real neural creative-stage draft, no external content or user data.
This does not test all four real agents; it tests one actual model response.
Output remains UNVERIFIED_DRAFT. Manuscript length, paragraph and hook
requirements are assessed by the existing deterministic validator.
An invalid manuscript remains a draft requiring revision, not approved output.
No AppDeploy calls, payment, YouTube permissions, platform uploading,
or video publication. GitHub Actions runner minutes/bandwidth may count
against an account quota.

## Diagnostic change: non-thinking alternative model
Qwen3 0.6B produced malformed JSON on one pass and local Ollama HTTP 500 errors
on structured/unstructured further tests. This experiment now uses
SmolLM2 360M Instruct Q4_K_M, 271 MB, Apache-2.0.
Registry: https://ollama.com/library/smollm2:360m-instruct-q4_K_M.
This is a proof-of-local-inference test, not evidence of good screenplay quality.
All prior failed runs remain in GitHub Action history for transparent troubleshooting.

## Verified real-world experiment results (2026-10-21)

**REAL PIPER NEURAL NARRATION: PASS**
- Piper English en_US-joe-medium model actually synthesized 43.07 seconds
  of voice audio; FFmpeg produced H264 + AAC 1080x1920, 30fps MP4.
- Original synthetic fictional test script only; captions estimated, NOT
  aligned to individual spoken words. Public upload and approval remain off.
- GitHub Actions: https://github.com/Bian378/ViralOS/actions/runs/39663551380
- Source model is trained on CC0 Joe data but fine-tuned from Lessac.
  Independent legal review of upstream Lessac derivatives is required before
  commercial or monetized use. This preview is evaluation-only.

**REAL SMALL LOCAL LANGUAGE MODEL INFERENCE: PASS, SCRIPT QUALITY: FAIL**
- Qwen3 0.6B trial was unreliable on the isolated test runner (malformed JSON
  and HTTP 500 when toggling reasoning/structured JSON). Not production-ready.
- SmolLM2 360M Instruct Q4 (~271 MB, Apache-2.0) executed REAL local inference
  and generated a fictional original-language script candidate.
- Actual result was 672 words, JSON format failed; storyboard quality gate
  correctly returned NEEDS_MANUSCRIPT_REVISION. It was NOT auto-rendered.
- GitHub Actions: https://github.com/Bian378/ViralOS/actions/runs/39666304171
- The model artifact contains only an unverified text draft, no model weights.

**Decision**: A real local model can generate language, but tiny 360M-class
models cannot reliably meet strict Shorts formats. Explore larger local
English models and a separate repair pass with hard validation only when
operator has suitable hardware/resources. Do not bypass the 80-150 word
and source-fact/risk approval gates.

Both expensive GitHub experiments have now been disabled on automatic PR
updates. Ordinary GitHub CI remains active. Neither workflow schedules
activity nor interacts with AppDeploy or YouTube.
