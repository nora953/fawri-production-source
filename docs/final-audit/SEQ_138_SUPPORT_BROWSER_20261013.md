# SEQ-138 — mounted Support browser audit (2026-10-13 Baghdad)

Continue from saved6b762715/SEQ137; no restart or app repairs. Existing verified SQL/HTTP144PASS/24FAIL/0SKIP sourcea2a9a780 is reused; browser evidence is separate.

PREPARED: actual merchant SupportPage and AdminSupportTab, real React/I18nProvider/Radix components, compiled Vite CSS, fresh isolated Chrome profile/UTF8/viewport, loopback synthetic GET fixture only.12cases: merchant AR/EN/Sorani loading/mobile390px/escaped conversation/keyboard create; empty; merchant/admin initial503/retry; merchant stale refresh disables mutations/recovers; admin owner/assistant/inspection-granted role prop surfaces and Escape dialog; admin empty; admin silent503 mutation gating negative assertion. Synthetic role props do not prove parent AdminPage route gate or backend authorization. No session/DB/provider/hosted/hardware/full visual or full accessibility clearance.

Candidate source observation: AdminSupportTab silent refresh catch keeps tickets and does not set loadError or stale authority; reply/resolve rely on working only. Merchant expressly uses staleAuthority to disable mutations. Last negative browser assertion expects mutation gate and may FAIL; no app defect declared until runtime observation, and no backend permission bypass assumed. Existing real Support revoked-permission403/no-write proof remains valid. Review reliability risk separately from confidentiality/security defects.

Local syntax PASS; native browser NOT_RUN until CI logs. Workflow frozen install/no lifecycle, pinned actions/read-only contents; owns browser profile/process cleanup and loopback server. No app source change or consolidated repair plan.
