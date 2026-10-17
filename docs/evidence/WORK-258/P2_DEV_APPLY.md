# WORK-258 P2 — DEV-only schema apply evidence

This record concerns only Neon DEV; it is not P2 acceptance, PR merge or deployment clearance.

## Identity and authority
- Governance v2 live authority and lifecycle writer verified; WORK-258 remains Active / Implementation with owner `chatgpt:fire-allowance-tracker`.
- Target: Neon project `cool-meadow-70196410`, branch `br-wispy-dew-a7vd4v6k` (`dev`), database `neondb`.
- Neon `main` (default), Supabase PROD, OAuth, and production were **not changed**.
- V2 `backend-preflight.js preflight` returned **allow** for `schema-migration`, change `20261017195000`, exact target `dev`. Target was refreshed before apply.

## Source and atomic application
- Source file: `neon/migrations/20261017195000_fat_roster_p2.sql` at task-branch commit `fd229fab84eb743367be7992bf7c1304a1158766`.
- Local source bytes matched the committed Git blob (2745 bytes).
- SHA-256: `d867ae5002941f0e41f7e87b8db6ddcf09ea0fef6cb924c369e74e748ac82d5e`.
- Applied inside checksum-guarded SQL `DO` block and inserted the migration ledger entry atomically.
- Fresh DEV ledger confirms version `20261017195000`, name `fat_roster_p2` and the exact checksum.
- V2 `backend-preflight.js verify-applied` returned **verified** on the same DEV target.

## Security verification
- Four tables now exist: `fat.roster_profiles`, `fat.roster_leave`, `fat.roster_day_work`, `fat.roster_stations`.
- All four have RLS enabled and **forced**, with `fat_app` owner-scoped select/write policies and explicit `fat_service` policies. No RLS bypass on `fat_app` or `fat_app_server`.
- A synthetic two-user probe via authenticated server role `fat_app_server` / `SET LOCAL ROLE fat_app` passed:
  - User A and B each saw only their own roster profile.
  - User A could not update, delete, or insert a record for User B.
  - An unset identity saw no roster rows.
  - All synthetic probe identities and their cascading roster rows were deleted after the proof; a fresh read returned zero identities remaining.
- This is a DB role/RLS proof, **not** yet an HTTP session-to-identity end-to-end integration proof.

## Implementation and release boundaries
- P2 API and UI code is on a draft task PR only. Global `FAT_ROSTER_ENABLED` defaults OFF; an explicitly enabled Neon DEV preview and per-user `roster_enabled` flag are both required.
- No user feature flags were set, no roster data seeded, no OAuth/calendar sync and no production changes.
- A local Next production source compile passed; full page-data collection is blocked by unrelated missing legacy Supabase environment variables in the isolated worktree. No production credentials were supplied.
- DEV Preview HTTP flow, live auth and real two-user HTTP-level isolation remain post-deployment acceptance gates.
- Destructive rollback is explicitly reserved for separate authorisation.
