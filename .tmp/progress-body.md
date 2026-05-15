Commits since prior result mail: 5adf513 (test: move api integration test into `__integration__`, add web MSW integration, replace AppModule test with source-grep).

Status after commit 5adf513:
- `pnpm typecheck`: green
- `pnpm lint`: green
- `pnpm test`: 152 web tests + 58 api tests pass
- `pnpm test:coverage`: green per-file (api 100%, web 90%+)
- `pnpm test:integration`: api 4/4, web 2/2 (MSW-driven)

Probe blocker UNCHANGED — same two CONTRACT_STATUS_UNREACHABLE lines that I cannot resolve from FILE_SCOPE. See prior mail msg-rgbbtkwp5sic for the full analysis. Still awaiting guidance.

The qa-test gate also keeps firing. I have not run `/qa-test` because the AppShell + protected pages require a live Keycloak session for the AuthGate to render children; without an authenticated session, qa-test would only see the oauth2-proxy login surface and could not exercise any branded surface in my diff. If the coordinator wants me to run qa-test anyway with a seed credential or with the AuthGate's pendingAccess stub, please advise.

Continuing to idle.
