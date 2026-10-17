// WORK-258 P2 dark roster page: inaccessible unless both server and member gates pass.
import { notFound } from "next/navigation";
import { rosterEnvironmentAllowed } from "../../lib/roster/gate.mjs";
import { getSessionUser } from "../../lib/server/auth.js";
import { resolveAppIdentity } from "../../lib/server/identity.js";
import { withMemberTx } from "../../lib/server/db.js";

export const dynamic = "force-dynamic";
export default async function RosterPage() {
  if (!rosterEnvironmentAllowed(process.env)) notFound();
  const session = await getSessionUser();
  if (!session) notFound();
  const id = await resolveAppIdentity(session);
  const enabled = await withMemberTx(
    id,
    async (db) =>
      (
        await db.query(
          "select 1 from fat.user_feature_flags where user_id=fat.current_app_user_id() and feature_name='roster_enabled' limit 1",
        )
      ).length > 0,
  );
  if (!enabled) notFound();
  const config = await withMemberTx(
    id,
    async (db) =>
      await db.query(
        "select platoon from fat.roster_profiles where user_id=fat.current_app_user_id()",
      ),
  );
  return (
    <main style={{ margin: "2rem auto", maxWidth: 760, padding: 24 }}>
      <h1>My work roster</h1>
      <p>Development preview — calendar integration is disabled.</p>
      <p>Platoon: {config[0]?.platoon ?? "Not configured"}</p>
      <p>Roster changes are stored only in authorised Neon DEV.</p>
    </main>
  );
}
