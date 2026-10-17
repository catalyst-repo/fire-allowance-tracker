// WORK-258 P2: DEV-only, fail-closed roster surface. No OAuth or calendar writes.
import {
  memberRoute,
  readJson,
  RequestError,
} from "../../../lib/server/route.js";
import { generateRoster, rosterBlock } from "../../../lib/roster/engine.ts";
import { rosterEnvironmentAllowed } from "../../../lib/roster/gate.mjs";

const MAX_RECORDS = 300;
function allowedEnvironment() {
  return rosterEnvironmentAllowed(process.env);
}
const fail = (message) => {
  throw new RequestError(message, "BAD_ROSTER", 400);
};
function date(s) {
  if (
    typeof s !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s + "T00:00:00Z")) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    fail("invalid date");
  return s;
}
function record(x, name) {
  if (!x || typeof x !== "object" || Array.isArray(x)) fail("invalid " + name);
  return x;
}
function validateEngine(input) {
  try {
    return generateRoster(input);
  } catch (e) {
    fail(e?.message || "invalid roster");
  }
}
function limit(a, name) {
  if (!Array.isArray(a) || a.length > MAX_RECORDS) fail("invalid " + name);
  return a;
}
function text(s, name, maximum = 120) {
  if (typeof s !== "string" || !s.trim() || s.length > maximum)
    fail("invalid " + name);
  return s;
}
async function permitted(db) {
  if (!allowedEnvironment())
    throw new RequestError("not found", "NOT_FOUND", 404);
  const rows = await db.query(
    "select 1 from fat.user_feature_flags where user_id=fat.current_app_user_id() and feature_name='roster_enabled' limit 1",
  );
  if (!rows.length) throw new RequestError("not found", "NOT_FOUND", 404);
}
async function readConfig(db) {
  const [profiles, leave, work, stations] = await Promise.all([
    db.query(
      "select platoon from fat.roster_profiles where user_id=fat.current_app_user_id()",
    ),
    db.query(
      'select period,starting_roster_block as "startingRosterBlock",start_date::text as start,end_date::text as "end" from fat.roster_leave where user_id=fat.current_app_user_id() order by start_date,id',
    ),
    db.query(
      'select start_at as start,end_at as "end" from fat.roster_day_work where user_id=fat.current_app_user_id() order by start_at,id',
    ),
    db.query(
      'select station_id as "stationId",effective_from::text as "from",effective_to::text as "to",temporary,one_shift_relief as "oneShiftRelief",roster_block as block from fat.roster_stations where user_id=fat.current_app_user_id() order by effective_from,id',
    ),
  ]);
  return {
    platoon: profiles[0]?.platoon ?? null,
    leave,
    dayWork: work,
    stations,
  };
}
async function saveConfig(db, input) {
  const platoon = input.platoon;
  if (!["A", "B", "C", "D", "Z"].includes(platoon)) fail("invalid platoon");
  const leave = limit(input.leave, "leave").map((l) => {
    l = record(l, "leave");
    const start = date(l.start),
      end = date(l.end),
      period = text(l.period, "period");
    if (end < start || rosterBlock(start) !== l.startingRosterBlock)
      fail("invalid leave");
    return { period, start, end, block: l.startingRosterBlock };
  });
  const dayWork = limit(input.dayWork, "dayWork").map((item) => {
    const w = record(item, "dayWork");
    return {
      start: text(w.start, "start", 64),
      end: text(w.end, "end", 64),
    };
  });
  const stations = limit(input.stations, "stations").map((s) => {
    s = record(s, "station");
    const from = date(s.from),
      to = s.to == null ? null : date(s.to),
      stationId = s.stationId;
    if (
      !Number.isInteger(stationId) ||
      stationId < 1 ||
      stationId > 96 ||
      (to && to < from)
    )
      fail("invalid station");
    if (s.oneShiftRelief && (!s.temporary || to !== from))
      fail("invalid relief");
    if (s.block != null && !Number.isInteger(s.block))
      fail("invalid roster block");
    return {
      stationId,
      from,
      to,
      temporary: s.temporary === true,
      relief: s.oneShiftRelief === true,
      block: s.block ?? null,
    };
  });
  // Call the P1 engine to validate precedence, interval overlap and locale handling
  // before changing ANY row; transaction rollback protects against insert failures.
  validateEngine({
    platoon,
    from: "2026-10-01",
    to: "2026-10-02",
    leave: leave.map((l) => ({
      period: l.period,
      start: l.start,
      end: l.end,
      startingRosterBlock: l.block,
    })),
    dayWork,
    stations: stations.map((s) => ({
      stationId: s.stationId,
      from: s.from,
      to: s.to ?? undefined,
      temporary: s.temporary,
      oneShiftRelief: s.relief,
      block: s.block ?? undefined,
    })),
  });
  await db.query(
    "insert into fat.roster_profiles(user_id,platoon) values(fat.current_app_user_id(),$1) on conflict(user_id) do update set platoon=excluded.platoon,updated_at=now()",
    [platoon],
  );
  for (const table of ["roster_leave", "roster_day_work", "roster_stations"])
    await db.query(
      "delete from fat." + table + " where user_id=fat.current_app_user_id()",
    );
  for (const l of leave)
    await db.query(
      "insert into fat.roster_leave(user_id,period,starting_roster_block,start_date,end_date) values(fat.current_app_user_id(),$1,$2,$3,$4)",
      [l.period, l.block, l.start, l.end],
    );
  for (const w of dayWork)
    await db.query(
      "insert into fat.roster_day_work(user_id,start_at,end_at) values(fat.current_app_user_id(),$1,$2)",
      [w.start, w.end],
    );
  for (const s of stations)
    await db.query(
      "insert into fat.roster_stations(user_id,station_id,effective_from,effective_to,temporary,one_shift_relief,roster_block) values(fat.current_app_user_id(),$1,$2,$3,$4,$5,$6)",
      [s.stationId, s.from, s.to, s.temporary, s.relief, s.block],
    );
  return { ok: true };
}
export const dynamic = "force-dynamic";
const guardedMemberPost = memberRoute(async ({ req, db }) => {
  await permitted(db);
  const input = await readJson(req);
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("invalid request");
  if (input.action === "read") return readConfig(db);
  if (input.action === "save") return saveConfig(db, input);
  if (input.action === "preview") {
    const config = await readConfig(db);
    if (!config.platoon)
      throw new RequestError("roster not configured", "NOT_FOUND", 404);
    const from = date(input.from),
      to = date(input.to);
    return validateEngine({ ...config, from, to });
  }
  throw new RequestError("unknown action", "NOT_FOUND", 404);
});

export const POST = (req, ctx) =>
  allowedEnvironment()
    ? guardedMemberPost(req, ctx)
    : new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
