import {
  resolveDayPlatoon,
  resolveNightPlatoon,
} from "../platoon/resolveOperationalPlatoon.js";
export type Platoon = "A" | "B" | "C" | "D" | "Z";
export type ShiftKind = "Day" | "Night" | "Day Work";
export type Shift = {
  key: string;
  date: string;
  kind: ShiftKind;
  start: string;
  end: string;
  block: number;
  stationId?: number;
};
export type Leave = {
  period: string;
  startingRosterBlock: number;
  start: string;
  end: string;
};
export type Station = {
  stationId: number;
  from: string;
  to?: string;
  temporary?: boolean;
  block?: number;
  oneShiftRelief?: boolean;
};
export type Input = {
  platoon: Platoon;
  from: string;
  to: string;
  leave?: Leave[];
  dayWork?: { start: string; end: string }[];
  stations?: Station[];
};
export type Reminder = { key: string; at: string; title: string };
const DAY = 86400000,
  ANCHOR = Date.UTC(2026, 9, 2);
const validDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw Error("Invalid date");
  const t = Date.parse(d + "T00:00:00Z");
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== d)
    throw Error("Invalid date");
  return t;
};
const date = (t: number) => new Date(t).toISOString().slice(0, 10);
export const rosterBlock = (d: string) =>
  1654 + Math.floor((validDate(d) - ANCHOR) / (28 * DAY));
const melbourneFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  second: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const offset = (t: number) => {
  const p = Object.fromEntries(
    melbourneFormatter.formatToParts(t).map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t;
};
export function instant(d: string, h: number): string {
  if (!Number.isInteger(h) || h < 0 || h > 23) throw Error("Invalid hour");
  const naive = validDate(d) + h * 3600000;
  let t = naive - offset(naive);
  for (let i = 0; i < 3; i++) t = naive - offset(t);
  return new Date(t).toISOString();
}
type Window = { start: string; end: string };
function intervals(windows: Window[]) {
  return windows.map((w) => {
    if (
      !/(Z|[+-]\d{2}:\d{2})$/.test(w.start) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(w.end)
    )
      throw Error("Explicit timezone required");
    const a = Date.parse(w.start),
      b = Date.parse(w.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b)
      throw Error("Invalid interval");
    return [a, b] as [number, number];
  });
}
function cut(shift: Shift, windows: [number, number][]): Shift[] {
  let pieces: [number, number][] = [
    [Date.parse(shift.start), Date.parse(shift.end)],
  ];
  for (const [a, b] of windows) {
    pieces = pieces.flatMap(([x, y]) =>
      x >= b || y <= a
        ? [[x, y]]
        : ([
            [x, Math.min(y, a)],
            [Math.max(x, b), y],
          ].filter(([u, v]) => u < v) as [number, number][]),
    );
  }
  return pieces.map(([a, b], j) => ({
    ...shift,
    key: shift.key + ":" + new Date(a).toISOString(),
    start: new Date(a).toISOString(),
    end: new Date(b).toISOString(),
  }));
}
function station(s: Shift, all: Station[]) {
  const hits = all.filter(
    (a) =>
      validDate(a.from) <= validDate(s.date) &&
      (!a.to || validDate(a.to) >= validDate(s.date)) &&
      (a.block === undefined || a.block === s.block),
  );
  return hits.sort(
    (a, b) =>
      Number(!!b.temporary) - Number(!!a.temporary) ||
      Number(b.block !== undefined) - Number(a.block !== undefined) ||
      b.from.localeCompare(a.from) ||
      a.stationId - b.stationId,
  )[0];
}
export function generateRoster(
  i: Input,
  internal = false,
): {
  shifts: Shift[];
  gearReminders: Reminder[];
} {
  if (!["A", "B", "C", "D", "Z"].includes(i.platoon))
    throw Error("Invalid platoon");
  const from = validDate(i.from),
    to = validDate(i.to);
  if (to < from || (!internal && to - from > 5 * 366 * DAY))
    throw Error("Invalid range");
  // Expand only the calculation horizon, not the returned shifts, so the
  // last old-station shift and first new-station shift remain visible across
  // independent windows. A 16-day lookaround covers the 8-day platoon cycle.
  if (!internal) {
    const maximumLeaveDays = Math.max(
      0,
      ...(i.leave || []).map((l) =>
        Math.max(
          0,
          Math.round((validDate(l.end) - validDate(l.start)) / DAY) + 1,
        ),
      ),
    );
    const totalLeaveDays = (i.leave || []).reduce(
      (sum, l) =>
        sum +
        Math.max(
          0,
          Math.round((validDate(l.end) - validDate(l.start)) / DAY) + 1,
        ),
      0,
    );
    const reliefDays = (i.stations || []).filter(
      (a) => a.oneShiftRelief,
    ).length;
    const pad =
      16 + Math.max(maximumLeaveDays, totalLeaveDays) + 8 * reliefDays;
    const before = date(from - pad * DAY);
    const after = date(to + pad * DAY);
    const expanded = generateRoster({ ...i, from: before, to: after }, true);
    const boundaryEnd = Date.parse(instant(date(to + DAY), 0));
    const boundaryStart = Date.parse(instant(i.from, 0));
    return {
      shifts: expanded.shifts.filter((s) => s.date >= i.from && s.date <= i.to),
      gearReminders: expanded.gearReminders.filter(
        (r) =>
          Date.parse(r.at) >= boundaryStart && Date.parse(r.at) < boundaryEnd,
      ),
    };
  }
  const leave = intervals(
    (i.leave || []).map((l) => {
      if (
        !l.period ||
        !Number.isInteger(l.startingRosterBlock) ||
        rosterBlock(l.start) !== l.startingRosterBlock ||
        validDate(l.end) < validDate(l.start)
      )
        throw Error("Invalid leave");
      return {
        start: instant(l.start, 0),
        end: instant(date(validDate(l.end) + DAY), 0),
      };
    }),
  );
  const work = intervals(i.dayWork || []);
  for (const [a, b] of work) {
    const part = (t: number) =>
      Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Australia/Melbourne",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(t)
          .map((x) => [x.type, x.value]),
      );
    const x = part(a),
      y = part(b);
    if (
      x.year !== y.year ||
      x.month !== y.month ||
      x.day !== y.day ||
      Number(x.hour) < 8 ||
      Number(y.hour) > 18 ||
      (Number(y.hour) === 18 &&
        (Number(y.minute) !== 0 ||
          b !==
            Date.parse(instant(x.year + "-" + x.month + "-" + x.day, 18)))) ||
      Number(x.hour) >= 18 ||
      Number(y.hour) < 8
    )
      throw Error("Day Work must be within 08:00-18:00 on one Melbourne date");
  }
  const ordered = [...work].sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < ordered.length; k++)
    if (ordered[k][0] < ordered[k - 1][1])
      throw Error("Overlapping Day Work intervals");
  for (const a of i.stations || []) {
    if (a.oneShiftRelief && (!a.temporary || !a.to || a.to !== a.from))
      throw Error("One-shift relief must be temporary and bounded to one date");
    if (a.block !== undefined && !Number.isInteger(a.block))
      throw Error("Invalid roster block");
    validDate(a.from);
    if (a.to && validDate(a.to) < validDate(a.from))
      throw Error("Invalid station window");
    if (!Number.isInteger(a.stationId) || a.stationId < 1 || a.stationId > 96)
      throw Error("Invalid station");
  }
  const shifts: Shift[] = [];
  for (let t = from; t <= to; t += DAY) {
    const d = date(t),
      wd = new Date(t).getUTCDay();
    const types: ShiftKind[] =
      i.platoon === "Z"
        ? wd >= 1 && wd <= 4
          ? ["Day Work"]
          : []
        : [
            ...(resolveDayPlatoon(d) === i.platoon ? ["Day" as const] : []),
            ...(resolveNightPlatoon(d) === i.platoon ? ["Night" as const] : []),
          ];
    const base = types.map((kind) => {
      const night = kind === "Night";
      return {
        key: i.platoon + ":" + d + ":" + kind,
        date: d,
        kind,
        block: rosterBlock(d),
        start: instant(d, night ? 18 : 8),
        end: instant(night ? date(t + DAY) : d, night ? 8 : 18),
      };
    });
    for (const s of base) {
      for (const part of cut(s, [...work, ...leave])) {
        const a = station(part, i.stations || []);
        shifts.push(a ? { ...part, stationId: a.stationId } : part);
      }
    }
  }
  // Explicit Day Work overrides replace, rather than overlap, base shifts.
  for (let k = 0; k < work.length; k++) {
    const [a, b] = work[k];
    for (
      let t = Math.max(from, Math.floor(a / DAY) * DAY - DAY);
      t <= to;
      t += DAY
    ) {
      const d = date(t);
      const start = Date.parse(instant(d, 8)),
        end = Date.parse(instant(d, 18));
      if (start >= b || end <= a) continue;
      const s: Shift = {
        key: i.platoon + ":" + d + ":Day Work:" + new Date(a).toISOString(),
        date: d,
        kind: "Day Work",
        block: rosterBlock(d),
        start: new Date(Math.max(start, a)).toISOString(),
        end: new Date(Math.min(end, b)).toISOString(),
      };
      for (const part of cut(s, leave)) {
        const st = station(part, i.stations || []);
        shifts.push(st ? { ...part, stationId: st.stationId } : part);
      }
    }
  }
  shifts.sort(
    (a, b) => a.start.localeCompare(b.start) || a.key.localeCompare(b.key),
  );
  // Reminder plans require an observed previous and next non-relief station. The
  // next station is taken from a shift; unknown boundaries are not guessed.
  const gearReminders: Reminder[] = [];
  let home: Shift | undefined;
  for (const shift of shifts) {
    const allocation = station(shift, i.stations || []);
    if (allocation?.oneShiftRelief) continue;
    if (
      home &&
      home.stationId !== undefined &&
      shift.stationId !== undefined &&
      home.stationId !== shift.stationId
    ) {
      gearReminders.push({
        key: "gear:" + home.key + ":" + shift.stationId,
        at: home.end,
        title: "Move FF Gear to FS" + shift.stationId,
      });
    }
    home = shift;
  }
  return { shifts, gearReminders };
}
