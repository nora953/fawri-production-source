# FIELD002 — new original recovery rollback drill, branch-quota block and safe cleanup (2026-11-07)

## Exact authorized scope

The owner authorized deletion of **only** obsolete migration disposable `br-billowing-leaf-b14yamgu` (`fawri-p0-migrations-0028-0034-disposable-20261019`), creation of a disposable restoration child from the *new* frozen original recovery, and a recovery drill; proceeding with changes on original `staging-runtime` was **conditional** on successfully verified rollback and reconnect isolation. Original staging, default production, the frozen recovery, and live Railway must not be modified when the condition is unmet.

## Actions actually taken

1. Pinned Neon project `round-fire-18493605` before deletion showed exactly 10 branches, the named `br-billowing-leaf-b14yamgu` existed, was nonprimary with **no descendants**, and neither the original `br-falling-dust-b1km4gix` nor the new recovery `br-royal-fog-b1v7pdmr` was the deletion target. Owner-approved **specific** deletion succeeded; after deletion exactly 9 active branches remained.
2. Created one fresh disposable child **`field002-new-recovery-reset-drill-20261107`**, branch `br-summer-bonus-b19rgpfn`, direct parent exactly `br-royal-fog-b1v7pdmr`, on the tenth available branch slot. Verified READY/nonprimary.
3. Before mutation, parent versus child had **95/95 identical relation row counts and canonical row-data digests**, **437 rows total**, with no missing relation.
4. A guarded SQL transaction on **child only** created `public.field002_restore_probe_20261107` and inserted one synthetic marker row. Pinned read-only SQL independently proved marker present on **child only**, absent on recovery parent and original.
5. Attempted native **`reset_from_parent` against only `br-summer-bonus-b19rgpfn`**, but Neon **refused because its reset requires spare branch capacity and 10/10 branches were occupied**. **NO NATIVE RESTORE COMPLETED.** Do not claim recovery accept/pass on this attempt.
6. Because reset could not proceed, a second guarded SQL transaction removed the exact disposable marker table **from that same child only**. Post-cleanup independent `SELECT` on child, newest recovery and original confirms no marker on any of them; **28** migration ledger records with same last hash `87a2a16f4278430b770f6e60a4da497ae8cc24cab11aeec6780febe119bd9b3f`; notices 0, audits 283, merchant count 1; no other clients at the sample.
7. Re-ran canonical row-data comparison: **95/95 relation counts and digests equal, 437 total rows**, recovery parent versus child. Independently computed normalized read-only catalog fingerprints **9/9 groups identical** (relations including ACL/RLS flags, functions, 45 policies, default ACL, reviewed roles, membership, triggers, indexes, constraints). This proves that manual fixture cleanup restored those checked parts of child state, **not** that Neon Reset/restore is reliable.
8. Current branch quota **10/10**. The archived isolated audit branch `br-snowy-voice-b1bovtwi` (`audit-p0-resolver-isolated-20261017`) is a **candidate for an additional explicitly authorized deletion**: archived since earlier work, parent `br-falling-dust-b1km4gix`, no children. **It was not deleted.** Alternative candidates must be independently reviewed; **do not delete** the original, new recovery, frozen prechange backup, successful three-LOGIN clone, or active rehearsal.

## Acceptance ledger

- Explicitly approved old disposable deletion: **PASS**.
- Latest recoverable original-derived parent preserved: **PASS**.
- New temporary child created and identical before test: **PASS**.
- Synthetic marker inserted only on child and manually removed: **PASS**.
- After-cleanup exact row and catalog checks: **95/95 + 9/9 PASS**, no residual fixture.
- **Provider-native reset of newest recovery into disposable child: BLOCKED by 10/10 branch quota; NOT ACCEPTED**. The prior native reset rehearsal on another frozen copy is separate evidence and must not be misrepresented as this newest recovery's successful restore.
- Original isolation + live consumer reconnect-proof maintenance: **NOT ACCEPTED**.
- Original ACL changes, migrations 0028–0051, three permanent restricted LOGINs, service cutover, original mounted SQL+HTTP: **NOT RUN**.

## Next authorization boundary

To complete the native reset with the *existing* disposable child, **one additional branch slot must be freed**. Neon branch deletion is destructive and requires the owner's **specific approval for the selected additional ID**. Only then, revalidate child parent/protection/children, insert a fresh unique child-only marker, run provider-native reset, verify disappearance, **95/95** row-data and **9/9** catalog snapshots, ledger/sequence, no other branch changes. Hold original staging writes until this and maintenance/reconnect isolation have passed. No permission to migrate `0052`, change default production, deploy or merge.

**FIELD002 OPEN / original branch NO-GO / PR #550 draft.**
