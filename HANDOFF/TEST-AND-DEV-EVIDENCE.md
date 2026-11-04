# Test and Isolated Development Evidence

## Automated checks

- Full Node regression: **393 passed, 0 failed, 0 skipped** on source candidate `7e00f7cc5c9b61018dc5dab0d75cdb72cf4ebe0c`.
- Static project check: `npm run check` passed.
- Expo dependency check: `npm run check:expo` passed.
- Configuration tests and `git diff --check` passed.
- Current source snapshot: `429a74895ca3bb5a50dec080afb654745007a651`. Relative to the regression candidate, the only changed file is `ROADMAP.md`.

## Hosted DEV checks

All hosted checks referenced here used synthetic fixtures in the isolated development project.

- Business application: one valid synthetic request completed through the no-email path (`mailed=false`); its fixture was removed.
- Shopping reminder: one synthetic due plan was claimed and ended in the expected no-token failure; the next invocation claimed zero plans. No Expo request occurred.
- Cleanup: synthetic Auth users, business request, shopping plans, push tokens and pending worker rows were absent at final readback; temporary flags were removed.
- Scheduler: remains inactive with zero executions.
- Recorded function versions: `smart-endpoint v18`, `shopping-reminder v7`, `isletme-basvuru v6`, `isletme-karar v7`.

## Final connection checks

- Auth and business email: SMTP is not configured; delivery has not been tested.
- OpenAI: no provider key was configured; provider egress remains default-deny; no provider call or spend occurred.
- Places: one synthetic request returned HTTP 502 `places_provider_unavailable`; repeat after provider availability is established.
- Expo push: no device-issued token was available; no push was sent.
- Scheduler activation and device acceptance remain separate final checks.
