# Independent Review Guide

Review the exact source snapshot `429a74895ca3bb5a50dec080afb654745007a651` without modifying it.

Focus on:

- Authorization and account isolation across database policies, Storage, RPCs and Edge Functions.
- AI consent, entitlement/trial checks, quotas, refund safety, provider ordering, input bounds and logs.
- Account deletion receipts; image cleanup; backup/restore; reminders; delayed asynchronous work.
- Package completeness, manifest integrity, documentation accuracy and absence of credentials or customer data.

Use the included `MANIFEST.sha256` to verify package files. With Node.js 24.x run `npm ci`, `npm run check`, `npm run test:config`, `npm run check:expo` and `node --test scripts/*.test.cjs`. The accepted regression receipt reports 393 passed, 0 failed and 0 skipped on `7e00f7cc5c9b61018dc5dab0d75cdb72cf4ebe0c`; only `ROADMAP.md` differs between that candidate and the handoff SHA.

Return **ACCEPT**, **ACCEPT WITH NOTES**, or **CHANGES REQUIRED**. For findings, include severity, file/line, reproducible impact and the smallest correction. Distinguish source/test evidence from hosted provider, build and physical-device verification. Do not infer live delivery from test doubles or no-provider paths.
