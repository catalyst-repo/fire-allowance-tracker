import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const migration = fs.readFileSync(
  new URL(
    "../neon/migrations/20261017195000_fat_roster_p2.sql",
    import.meta.url,
  ),
  "utf8",
);
const api = fs.readFileSync(
  new URL("../app/api/roster/route.js", import.meta.url),
  "utf8",
);
test("all four roster tables are owner-scoped with forced RLS", () => {
  for (const table of [
    "roster_profiles",
    "roster_leave",
    "roster_day_work",
    "roster_stations",
  ])
    assert.match(migration, new RegExp("create table fat\\." + table + " \\("));
  assert.match(migration, /force row level security/);
  assert.match(migration, /user_id=fat\.current_app_user_id\(\)/);
  assert.match(migration, /to fat_app/);
  assert.match(migration, /check \(not one_shift_relief/);
});
test("API uses server session and bound identity, never a client supplied userId", () => {
  assert.match(api, /memberRoute/);
  assert.match(api, /rosterEnvironmentAllowed/);
  assert.match(api, /fat\.current_app_user_id\(\)/);
  assert.doesNotMatch(
    api,
    /input\.userId|input\.user_id|process\.env\.NEXT_PUBLIC_SUPABASE/,
  );
});
