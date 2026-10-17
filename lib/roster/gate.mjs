// WORK-258 P2: pure fail-closed environment gate. No defaults to ON.
export function rosterEnvironmentAllowed(env) {
  if (
    env?.FAT_ROSTER_ENABLED !== "true" ||
    env?.NEXT_PUBLIC_FAT_BACKEND !== "neon"
  )
    return false;
  if (env?.VERCEL_ENV === "preview")
    return env?.VERCEL_GIT_COMMIT_REF === "dev";
  if (env?.VERCEL_ENV === "production" || env?.VERCEL_ENV === "development")
    return false;
  return env?.VERCEL_ENV === undefined && env?.NODE_ENV === "development";
}
