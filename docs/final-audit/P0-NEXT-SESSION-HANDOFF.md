# FAWRI P0 next-session handoff

Read P0-CONTINUATION-CHECKPOINT.md first. Verify GitHub head of fix/p0-provider-receipt-order-discovery-20261015 and Draft PR #550 before editing. This file's containing commit is the recovery milestone after verified source 693b2be0e30dbb815afda89ccb0f591cb97e98f1 (41/41 observed workflows SUCCESS).

Resume Priority A: inspect superQiSandboxWebhook.ts, superQiSandboxTransport.ts and routes/saas-billing.ts; admission SQL is migration 0029. Signature and gateway confirmation precede the sole application admission call; assess actual negative coverage before claiming weakness. Do not move signature verification into SQL without a demonstrated need.

Priority B: sole production TypeScript direct database_admin_access_audits INSERT found in postgresMerchantManagementAuthority.ts:listManagedMerchantsPostgres. Migration 0030 inserts inside the receipt-reader SECURITY DEFINER function. Restricted Neon role has CRUD on unprotected admin tables. Trace legitimate directory/session/permission paths and prove boundary implications in isolated local tests; no broad grants/revokes on hosted branches.

Priority C remains infrastructure-blocked: restricted role NOLOGIN; staging LOGIN has BYPASSRLS+CREATEROLE. Earlier Neon-created unsafe login experiment was already cleaned up. Do not repeat role creation. Any SET ROLE proof is not direct-login certification.

Neon permitted target only: round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb. Do not touch parent/default/staging/production. No merge/deploy. NO-GO until security gates and hosted acceptance are proven. Keep cashier and AI replies separate. Every batch: hypothesis -> evidence -> small tests -> GitHub commit -> checkpoint/handoff -> verify SHA. Do not rely on conversation history or lost scratch state.
