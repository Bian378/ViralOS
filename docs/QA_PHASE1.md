# ViralOS grundsystem — kvalitetssäkring

## Scope
Authenticated multi-tenant state, read-after-write, CAS version checks, queue storage, HTTP failure isolation, and source-only operation. AI production and publishing are explicitly excluded and not enabled.

## Safe QA mode
`cron.json` is intentionally an empty list while Phase 1 remains under test. Background schedulers do not start jobs; manual queue actions remain explicit and available. Never call the absence of a cron heartbeat a runtime failure while in QA mode.

## Authenticated diagnostics
The Systemkontroll tab calls POST /api/system-check and GET /api/queue using the signed-in user's credentials. Diagnostic database writes use isolated table `viral_qa_probe` with a one-time random ID, and always attempt cleanup; never modify the saved manuscripts. Verify both results. Systemkontroll results only prove their named backend checks, not a full cross-account browser E2E audit.

## Completion gate
- Deployed ready without runtime errors
- Cross-account sign out/in confirms no text, previews, drafts, or settings leak
- Saved edits persist across reload; delete and review revision invalidation work
- Authenticated diagnostics passes all backend checks and queue API read
- Injected service outage shows recoverable error and does not fake default workspace data
- Queue stop/resume/cancel and no-consent gates pass
- Background scheduler is only restarted by a separate reviewed change after all checks

No publication integration is connected. User approval for publication remains mandatory.
