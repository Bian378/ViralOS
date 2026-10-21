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
