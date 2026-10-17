// WORK-258 P2: server-rendered, dark, owner-scoped roster preview.
import { notFound } from "next/navigation";
import { rosterEnvironmentAllowed } from "../../lib/roster/gate.mjs";
import { generateRoster } from "../../lib/roster/engine.ts";
import { getSessionUser } from "../../lib/server/auth.js";
import { resolveAppIdentity } from "../../lib/server/identity.js";
import { withMemberTx } from "../../lib/server/db.js";

export const dynamic = "force-dynamic";

function melbourneToday() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return parts.year + "-" + parts.month + "-" + parts.day;
}
function advanceDate(day, days) {
  return new Date(Date.parse(day + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
function melbourneTime(utc) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utc));
}

export default async function RosterPage() {
  if (!rosterEnvironmentAllowed(process.env)) notFound();
  const user = await getSessionUser();
  if (!user) notFound();
  const identity = await resolveAppIdentity(user);
  const config = await withMemberTx(identity, async ({ query }) => {
    const allowed = await query(
      "select 1 from fat.user_feature_flags where user_id=fat.current_app_user_id() and feature_name='roster_enabled' limit 1",
    );
    if (!allowed.length) notFound();
    const profiles = await query(
      "select platoon from fat.roster_profiles where user_id=fat.current_app_user_id()",
    );
    const leave = await query(
      'select period,starting_roster_block as "startingRosterBlock", start_date::text as start,end_date::text as "end" from fat.roster_leave where user_id=fat.current_app_user_id() order by start_date,id',
    );
    const dayWork = await query(
      'select start_at as start,end_at as "end" from fat.roster_day_work where user_id=fat.current_app_user_id() order by start_at,id',
    );
    const stations = await query(
      'select station_id as "stationId",effective_from::text as "from",effective_to::text as "to",temporary,one_shift_relief as "oneShiftRelief",roster_block as block from fat.roster_stations where user_id=fat.current_app_user_id() order by effective_from,id',
    );
    return { platoon: profiles[0]?.platoon ?? null, leave, dayWork, stations };
  });
  const today = melbourneToday();
  const roster = config.platoon
    ? generateRoster({ ...config, from: today, to: advanceDate(today, 27) })
    : null;
  return (
    <main style={{ maxWidth: 920, margin: "2rem auto", padding: "1.5rem" }}>
      <h1>My work roster</h1>
      <p>
        Development-only preview. Calendar integration and automatic sync are
        disabled.
      </p>
      <p>
        Platoon: <strong>{config.platoon ?? "Not configured"}</strong> ·
        Australia/Melbourne
      </p>
      {roster ? (
        <>
          <h2>Next 28 days</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Date</th>
                <th align="left">Shift</th>
                <th align="left">Time</th>
                <th align="left">Station</th>
              </tr>
            </thead>
            <tbody>
              {roster.shifts.map((s) => (
                <tr key={s.key}>
                  <td>{s.date}</td>
                  <td>{s.kind}</td>
                  <td>
                    {melbourneTime(s.start)}–{melbourneTime(s.end)}
                  </td>
                  <td>{s.stationId ? "FS" + s.stationId : "Not assigned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Gear reminders</h2>
          {roster.gearReminders.length ? (
            <ul>
              {roster.gearReminders.map((r) => (
                <li key={r.key}>
                  {r.title} —{" "}
                  {new Date(r.at).toLocaleString("en-AU", {
                    timeZone: "Australia/Melbourne",
                  })}
                </li>
              ))}
            </ul>
          ) : (
            <p>No upcoming gear moves.</p>
          )}
        </>
      ) : (
        <p>
          Choose a platoon through the DEV roster API to view your schedule.
        </p>
      )}
    </main>
  );
}
