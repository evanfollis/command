# Review: a9fe5c3 — Reduce autofill noise at the authentication boundary

**Date**: 2026-07-14T05-41Z  
**Reviewer**: Claude (Sonnet 4.6) — adversarial substitute (codex EROFS in tick session)  
**Change**: auth/route.ts (+8 -4), LoginForm.tsx (+47 new file), login/page.tsx (-25)

## Summary

Suppresses telemetry noise from password-manager autofill races: empty-password submissions no longer emit `auth.login_failed` events. Also adds client-side submit-button disable (`handleSubmit` + `buttonRef`) to prevent accidental double-submission, and extracts a `LoginForm` client component for the interactive behavior.

## Findings

**[advisory]** The empty-password gate `password.trim().length > 0` is a heuristic: a password manager that submits a space or tab will still emit a `login_failed` event. This is acceptable — the primary noise class is zero-length submissions.

**[advisory]** The button-disable client-side guard does not address the concurrent autofill race described in CURRENT_STATE ("57 fail+success pairs at 8–26ms"). The commit message is precise ("reduce autofill noise"), not "fix double-submission." Appropriate scope.

**[info]** `LoginForm.tsx` is correctly marked `'use client'` since it uses `useRef`. No server/client boundary violation.

**[info]** Auth logic in `api/auth/route.ts` is unchanged except for the telemetry guard. The `checkPassword`, cookie-set, and redirect paths are unmodified.

**[info]** No new attack surface: the empty-password skip is a telemetry filter only — the 401 response is still returned normally.

## Verdict

Safe. The telemetry filter correctly narrows an advisory noise issue without touching auth correctness. The submit-disable guard is a UX improvement, not a security claim.
