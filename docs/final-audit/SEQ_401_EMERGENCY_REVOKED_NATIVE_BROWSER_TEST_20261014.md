# SEQ-401 — Native Chrome revoked-emergency polling regression prepared

Audit-only additions to `docs/final-audit/evidence/seq367-full-emergency-workspace-browser.mjs` on branch `audit/conversation-notes-reconciliation-20261011`, commits 84b7dd7b4cfe45c656743cbaebb040c3225dfd25, 02a6bd329ac8dc0e3e1fe0666281b41142f17b29, 91b858d28eced751b3ecebc596cad95125703cdd, b8cacc16a2e980188611be2158914d6f710ae987, 99627a1cf638c774fe44446e46d62f5f2a5d30eb.

New `revoked-poll` case uses the actual Vite main/App/React emergency management page, Chrome/CDP, synthetic loopback API. Initial assistant overview/directory200 and visible request controls; set fixture revoked; wait for real 10-second silent directory GET403; then require zero comboboxes and zero request textarea. Six new language×viewport diagnostics (AR/EN/KU ×390/1280), no baseline credit; completeness guard raised 30→36. Existing 30 cases still run by harness; not independently recredited. No real backend or credentials.

**Status at creation:** CI run https://github.com/nora953/fawri-production-source/actions/runs/38510087929 (SHA 99627a1) pending. Do not claim browser PASS/FAIL until log evidence. Current source `AdminEmergencyAccessPage.tsx` silent catch retains old state, so diagnostic failure is expected but not predeclared as executed evidence. The fixture uses overview200 and directory403, matching isolated PostgreSQL verified contracts from SEQ-398–399.

No app repair. Release BLOCKED; overall audit NOT_YET_MEASURABLE.
