# ViralOS v30 source snapshot — 2026-10-25

AppDeploy app: `viralos-ai-dtmneg`. Deployed source snapshot `1792921868291` (v30). All 55 source files have been copied from the currently deployed AppDeploy source to this isolated branch. GitHub `main` and the prior phase-2 branch remain unchanged.

The earlier `work/viralos-phase2-20261021` branch is 117 commits ahead of the old main, but its source predates live v30. Reconcile features module by module instead of replacing production source blindly. This is a source preservation branch, not an automatic merge or deploy.

Production v30: authenticated owner-scoped workspaces, opt-in hourly YouTube signals, manager/editing tools, browser WebCodecs MP4 exports with manually supplied licensed narration, and private reviewed MP4 storage. AAC timing and binary transfer sizes were revised in v30. AppDeploy build/automatic QA is green; real-device full audio and upload acceptance remain to be verified.

Not yet verified end-to-end: natural neural TTS from exact approved scripts, full autonomous video rendering on the server, factual and rights verification, private YouTube OAuth upload and separate release consent. Public YouTube publishing remains BLOCKED. No database records, recordings, AppDeploy configuration secrets or personal API keys are exported here.
