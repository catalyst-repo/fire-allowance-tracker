import test from "node:test";
import assert from "node:assert/strict";
import { rosterEnvironmentAllowed } from "../lib/roster/gate.mjs";

const base = {
  FAT_ROSTER_ENABLED: "true",
  NEXT_PUBLIC_FAT_BACKEND: "neon",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "dev",
};
test("roster stays dark by default and on all production/supabase contexts", () => {
  for (const variant of [
    { ...base, FAT_ROSTER_ENABLED: undefined },
    { ...base, FAT_ROSTER_ENABLED: "false" },
    { ...base, NEXT_PUBLIC_FAT_BACKEND: "supabase" },
    { ...base, VERCEL_ENV: "production" },
    { ...base, VERCEL_GIT_COMMIT_REF: "main" },
    { ...base, VERCEL_GIT_COMMIT_REF: "task/WORK-258-p2-neon-roster" },
    { ...base, VERCEL_ENV: undefined, NODE_ENV: "production" },
  ])
    assert.equal(rosterEnvironmentAllowed(variant), false);
});
test("explicitly enabled dev preview or local developer only", () => {
  assert.equal(rosterEnvironmentAllowed(base), true);
  assert.equal(
    rosterEnvironmentAllowed({
      FAT_ROSTER_ENABLED: "true",
      NEXT_PUBLIC_FAT_BACKEND: "neon",
      NODE_ENV: "development",
    }),
    true,
  );
});
