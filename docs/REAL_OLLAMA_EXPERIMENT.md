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
