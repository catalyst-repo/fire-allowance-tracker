import test from "node:test";
import assert from "node:assert/strict";
import { generateRoster, instant, rosterBlock } from "../lib/roster/engine.ts";
import {
  resolveDayPlatoon,
  resolveNightPlatoon,
} from "../lib/platoon/resolveOperationalPlatoon.js";
test("four platoons match authoritative resolver for 3200 days", () => {
  for (let j = 0; j < 3200; j++) {
    const date = new Date(Date.UTC(2026, 0, 3) + j * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const p of ["A", "B", "C", "D"] as const) {
      const got = generateRoster({ platoon: p, from: date, to: date }).shifts;
      assert.deepEqual(
        got.map((s) => s.kind),
        [
          ...(resolveDayPlatoon(date) === p ? ["Day"] : []),
          ...(resolveNightPlatoon(date) === p ? ["Night"] : []),
        ],
      );
    }
  }
});
test("Melbourne daylight saving is timezone-correct", () => {
  assert.equal(instant("2027-04-04", 18), "2027-04-04T08:00:00.000Z");
  assert.equal(instant("2027-10-03", 18), "2027-10-03T07:00:00.000Z");
});
test("28 day roster blocks", () => {
  assert.equal(rosterBlock("2026-10-02"), 1654);
  assert.equal(rosterBlock("2026-10-30"), 1655);
});
test("Z day work Monday through Thursday, no holiday suppression", () => {
  assert.deepEqual(
    generateRoster({
      platoon: "Z",
      from: "2026-10-19",
      to: "2026-10-25",
    }).shifts.map((s) => s.date),
    ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"],
  );
});
test("explicit leave suppresses roster intervals, no automatic recurrence", () => {
  const base = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-10",
  });
  const leave = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-10",
    leave: [
      {
        period: "period-1",
        startingRosterBlock: rosterBlock("2026-01-03"),
        start: "2026-01-03",
        end: "2026-01-04",
      },
    ],
  });
  assert.ok(leave.shifts.length < base.shifts.length);
});
test("temporary allocation wins and gear transfer is bounded", () => {
  const result = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-11",
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 22, from: "2026-01-05", temporary: true },
    ],
  });
  assert.ok(result.shifts.some((s) => s.stationId === 22));
  assert.ok(
    result.gearReminders.some((r) => r.title === "Move FF Gear to FS22"),
  );
});
test("idempotent and invalid input rejected", () => {
  const i = { platoon: "D" as const, from: "2027-01-01", to: "2027-02-01" };
  assert.deepEqual(generateRoster(i), generateRoster(i));
  assert.throws(() => generateRoster({ ...i, from: "not-date" }));
});
test("leave on next date preserves full overnight shift from previous date", () => {
  const d = "2026-01-05";
  const p = resolveNightPlatoon(d) as "A" | "B" | "C" | "D";
  const r = generateRoster({
    platoon: p,
    from: d,
    to: d,
    leave: [
      {
        period: "L",
        startingRosterBlock: rosterBlock("2026-01-06"),
        start: "2026-01-06",
        end: "2026-01-06",
      },
    ],
  });
  const night = r.shifts.find((s) => s.kind === "Night");
  assert.ok(night);
  assert.equal(night.start, instant(d, 18));
  assert.equal(night.end, instant("2026-01-06", 8));
});
test("explicit Day Work suppresses operational overlap and generates replacement", () => {
  const d = "2026-01-03",
    p = resolveDayPlatoon(d) as "A" | "B" | "C" | "D";
  const a = instant(d, 8),
    b = instant(d, 18);
  const r = generateRoster({
    platoon: p,
    from: d,
    to: d,
    dayWork: [{ start: a, end: b }],
  });
  assert.equal(r.shifts.filter((s) => s.kind === "Day").length, 0);
  assert.equal(r.shifts.filter((s) => s.kind === "Day Work").length, 1);
});
test("leave takes precedence over an explicit Day Work override", () => {
  const d = "2026-01-03";
  const r = generateRoster({
    platoon: "A",
    from: d,
    to: d,
    dayWork: [{ start: instant(d, 8), end: instant(d, 18) }],
    leave: [
      { period: "L1", startingRosterBlock: rosterBlock(d), start: d, end: d },
    ],
  });
  assert.equal(r.shifts.length, 0);
});
test("DST night shifts have correct elapsed hours", () => {
  for (const [d, h] of [
    ["2027-04-03", 15],
    ["2027-10-02", 13],
  ] as const) {
    const p = resolveNightPlatoon(d) as "A" | "B" | "C" | "D";
    const r = generateRoster({ platoon: p, from: d, to: d });
    const n = r.shifts.find((s) => s.kind === "Night");
    assert.ok(n);
    assert.equal((Date.parse(n.end) - Date.parse(n.start)) / 3600000, h);
  }
});
test("station bounds and block allocation precedence", () => {
  const d = "2026-01-03";
  assert.throws(() =>
    generateRoster({
      platoon: "A",
      from: d,
      to: d,
      stations: [{ stationId: 97, from: d }],
    }),
  );
  const r = generateRoster({
    platoon: "A",
    from: d,
    to: d,
    stations: [
      { stationId: 1, from: d },
      { stationId: 2, from: d, block: rosterBlock(d) },
    ],
  });
  assert.equal(r.shifts[0].stationId, 2);
});
test("Z must not duplicate a shift when explicit Day Work overlaps", () => {
  const d = "2026-10-19";
  const r = generateRoster({
    platoon: "Z",
    from: d,
    to: d,
    dayWork: [{ start: instant(d, 8), end: instant(d, 18) }],
  });
  assert.equal(r.shifts.length, 1);
});
test("Day Work outside range must not leak shifts into range", () => {
  const d = "2026-10-19";
  const r = generateRoster({
    platoon: "A",
    from: d,
    to: d,
    dayWork: [
      { start: instant("2026-10-18", 8), end: instant("2026-10-18", 18) },
    ],
  });
  assert.equal(r.shifts.filter((x) => x.kind === "Day Work").length, 0);
});
test("station move reminder is not emitted for one shift temporary relief", () => {
  const r = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-12",
    stations: [
      { stationId: 1, from: "2026-01-01" },
      {
        stationId: 22,
        from: "2026-01-05",
        to: "2026-01-05",
        temporary: true,
        oneShiftRelief: true,
      },
    ],
  });
  assert.equal(r.gearReminders.length, 0);
});
test("overlapping Day Work records are refused", () => {
  const d = "2026-01-03";
  assert.throws(
    () =>
      generateRoster({
        platoon: "A",
        from: d,
        to: d,
        dayWork: [
          { start: instant(d, 8), end: instant(d, 18) },
          { start: instant(d, 8), end: instant(d, 18) },
        ],
      }),
    /Overlapping Day Work/,
  );
});
test("out-of-hours Day Work is refused rather than deleting hours", () => {
  const d = "2026-01-05";
  assert.throws(
    () =>
      generateRoster({
        platoon: "A",
        from: d,
        to: d,
        dayWork: [{ start: instant(d, 18), end: instant(d, 20) }],
      }),
    /Day Work must/,
  );
});
test("offsetless intervals are rejected for deterministic timezones", () => {
  assert.throws(
    () =>
      generateRoster({
        platoon: "A",
        from: "2026-01-03",
        to: "2026-01-03",
        dayWork: [{ start: "2026-01-03T08:00", end: "2026-01-03T18:00" }],
      }),
    /Explicit timezone/,
  );
});
test("annual leave cancels night shift completely without orphan fragments", () => {
  const d = "2026-01-05";
  const p = resolveNightPlatoon(d) as "A" | "B" | "C" | "D";
  const base = generateRoster({ platoon: p, from: d, to: d });
  assert.ok(base.shifts.some((s) => s.kind === "Night"));
  const leave = generateRoster({
    platoon: p,
    from: d,
    to: d,
    leave: [
      { period: "L", startingRosterBlock: rosterBlock(d), start: d, end: d },
    ],
  });
  assert.equal(leave.shifts.filter((s) => s.kind === "Night").length, 0);
});
test("temporary station departure receives a gear reminder", () => {
  const r = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-12",
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 22, from: "2026-01-05", to: "2026-01-06", temporary: true },
    ],
  });
  assert.ok(r.gearReminders.some((x) => x.title === "Move FF Gear to FS1"));
});
test("gear reminders skip one-shift relief while preserving home transfer", () => {
  const r = generateRoster({
    platoon: "A",
    from: "2026-01-03",
    to: "2026-01-12",
    stations: [
      { stationId: 1, from: "2026-01-01" },
      {
        stationId: 22,
        from: "2026-01-05",
        to: "2026-01-05",
        temporary: true,
        oneShiftRelief: true,
      },
      { stationId: 5, from: "2026-01-06", temporary: true },
    ],
  });
  assert.ok(r.gearReminders.some((x) => x.title === "Move FF Gear to FS5"));
});
test("reject malformed one-shift relief allocations", () => {
  assert.throws(() =>
    generateRoster({
      platoon: "A",
      from: "2026-01-03",
      to: "2026-01-10",
      stations: [{ stationId: 22, from: "2026-01-05", oneShiftRelief: true }],
    }),
  );
});
test("Day Work ending at 18:30 is rejected without dropping night hours", () => {
  const d = "2026-01-05";
  assert.throws(
    () =>
      generateRoster({
        platoon: "A",
        from: d,
        to: d,
        dayWork: [
          {
            start: instant(d, 8),
            end: new Date(Date.parse(instant(d, 18)) + 1800000).toISOString(),
          },
        ],
      }),
    /Day Work must/,
  );
});
test("gear reminders are identical for whole and split request windows", () => {
  const base = {
    platoon: "A" as const,
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 5, from: "2026-01-11" },
    ],
  };
  const whole = generateRoster({
    ...base,
    from: "2026-01-03",
    to: "2026-01-20",
  }).gearReminders;
  const split = [
    ...generateRoster({ ...base, from: "2026-01-03", to: "2026-01-10" })
      .gearReminders,
    ...generateRoster({ ...base, from: "2026-01-11", to: "2026-01-20" })
      .gearReminders,
  ];
  assert.deepEqual(split, whole);
});
test("leave at shift start removes whole night; next-day leave does not", () => {
  const d = "2026-01-05";
  const p = resolveNightPlatoon(d) as "A" | "B" | "C" | "D";
  const leaveOnStart = generateRoster({
    platoon: p,
    from: d,
    to: d,
    leave: [
      { period: "L", startingRosterBlock: rosterBlock(d), start: d, end: d },
    ],
  });
  assert.equal(leaveOnStart.shifts.filter((s) => s.kind === "Night").length, 0);
  const leaveNext = generateRoster({
    platoon: p,
    from: d,
    to: d,
    leave: [
      {
        period: "L",
        startingRosterBlock: rosterBlock("2026-01-06"),
        start: "2026-01-06",
        end: "2026-01-06",
      },
    ],
  });
  const n = leaveNext.shifts.find((s) => s.kind === "Night");
  assert.ok(n);
  assert.equal(n.end, instant("2026-01-06", 8));
});
test("long leave preserves identical split-window gear reminders", () => {
  const stations = [
    { stationId: 1, from: "2026-01-01" },
    { stationId: 5, from: "2026-02-01" },
  ];
  const leave = [
    {
      period: "L",
      startingRosterBlock: rosterBlock("2026-01-13"),
      start: "2026-01-13",
      end: "2026-02-09",
    },
  ];
  const base = { platoon: "A" as const, stations, leave };
  const whole = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-02-28",
  }).gearReminders;
  const split = [
    ...generateRoster({ ...base, from: "2026-01-01", to: "2026-01-12" })
      .gearReminders,
    ...generateRoster({ ...base, from: "2026-01-13", to: "2026-02-28" })
      .gearReminders,
  ];
  assert.deepEqual(split, whole);
  assert.ok(whole.some((x) => x.title === "Move FF Gear to FS5"));
});
test("adjacent leave periods preserve split-window gear reminders", () => {
  const base = {
    platoon: "A" as const,
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 5, from: "2026-02-01" },
    ],
    leave: [
      {
        period: "L1",
        startingRosterBlock: rosterBlock("2026-01-13"),
        start: "2026-01-13",
        end: "2026-02-09",
      },
      {
        period: "L2",
        startingRosterBlock: rosterBlock("2026-02-10"),
        start: "2026-02-10",
        end: "2026-03-09",
      },
    ],
  };
  const whole = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-03-31",
  }).gearReminders;
  const split = [
    ...generateRoster({ ...base, from: "2026-01-01", to: "2026-01-12" })
      .gearReminders,
    ...generateRoster({ ...base, from: "2026-01-13", to: "2026-03-31" })
      .gearReminders,
  ];
  assert.deepEqual(split, whole);
  assert.ok(whole.some((r) => r.title === "Move FF Gear to FS5"));
});
test("consecutive single-shift reliefs preserve split-window reminders", () => {
  const relief = [
    "2026-01-13",
    "2026-01-14",
    "2026-01-19",
    "2026-01-20",
    "2026-01-21",
    "2026-01-22",
    "2026-01-27",
    "2026-01-28",
    "2026-01-29",
    "2026-01-30",
  ].map((d) => ({
    stationId: 22,
    from: d,
    to: d,
    temporary: true,
    oneShiftRelief: true,
  }));
  const base = {
    platoon: "A" as const,
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 5, from: "2026-02-01" },
      ...relief,
    ],
  };
  const whole = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-02-28",
  }).gearReminders;
  const split = [
    ...generateRoster({ ...base, from: "2026-01-01", to: "2026-01-12" })
      .gearReminders,
    ...generateRoster({ ...base, from: "2026-01-13", to: "2026-02-28" })
      .gearReminders,
  ];
  assert.deepEqual(split, whole);
  assert.ok(whole.some((r) => r.title === "Move FF Gear to FS5"));
});
test("every split boundary preserves reminder parity across a station move", () => {
  const base = {
    platoon: "A" as const,
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 5, from: "2026-01-11" },
    ],
  };
  const full = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-02-10",
  }).gearReminders;
  for (
    let d = Date.parse("2026-01-02T00:00:00Z");
    d < Date.parse("2026-02-10T00:00:00Z");
    d += 86400000
  ) {
    const a = new Date(d).toISOString().slice(0, 10);
    const b = new Date(d + 86400000).toISOString().slice(0, 10);
    const split = [
      ...generateRoster({ ...base, from: "2026-01-01", to: a }).gearReminders,
      ...generateRoster({ ...base, from: b, to: "2026-02-10" }).gearReminders,
    ];
    assert.deepEqual(split, full, a);
  }
});
test("Z platoon split-window and partial Day Work preserve reminder parity", () => {
  const base = {
    platoon: "Z" as const,
    stations: [
      { stationId: 1, from: "2026-10-01" },
      { stationId: 5, from: "2026-10-21" },
    ],
    dayWork: [
      { start: instant("2026-10-19", 10), end: instant("2026-10-19", 14) },
    ],
  };
  const whole = generateRoster({
    ...base,
    from: "2026-10-18",
    to: "2026-10-30",
  }).gearReminders;
  const split = [
    ...generateRoster({ ...base, from: "2026-10-18", to: "2026-10-20" })
      .gearReminders,
    ...generateRoster({ ...base, from: "2026-10-21", to: "2026-10-30" })
      .gearReminders,
  ];
  assert.deepEqual(split, whole);
});
test("reject unreasonably long leave instead of unbounded calculation", () => {
  assert.throws(
    () =>
      generateRoster({
        platoon: "A",
        from: "2026-01-01",
        to: "2026-01-31",
        leave: [
          {
            period: "excess",
            startingRosterBlock: rosterBlock("2026-01-01"),
            start: "2026-01-01",
            end: "2100-01-01",
          },
        ],
      }),
    /Invalid leave horizon/,
  );
});
test("night shift reminder across adjacent calendar windows remains uniquely owned", () => {
  const base = {
    platoon: "A" as const,
    stations: [
      { stationId: 1, from: "2026-01-01" },
      { stationId: 5, from: "2026-01-06" },
    ],
  };
  const a = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-01-05",
  }).gearReminders;
  const b = generateRoster({
    ...base,
    from: "2026-01-06",
    to: "2026-01-15",
  }).gearReminders;
  const whole = generateRoster({
    ...base,
    from: "2026-01-01",
    to: "2026-01-15",
  }).gearReminders;
  assert.deepEqual([...a, ...b], whole);
});
