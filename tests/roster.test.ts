import test from 'node:test'
import assert from 'node:assert/strict'
import {generateRoster,instant,rosterBlock} from '../lib/roster/engine.ts'
import {resolveDayPlatoon,resolveNightPlatoon} from '../lib/platoon/resolveOperationalPlatoon.js'
test('four platoons match authoritative resolver for 3200 days',()=>{for(let j=0;j<3200;j++){const date=new Date(Date.UTC(2026,0,3)+j*86400000).toISOString().slice(0,10);for(const p of ['A','B','C','D'] as const){const got=generateRoster({platoon:p,from:date,to:date}).shifts;assert.deepEqual(got.map(s=>s.kind),[...(resolveDayPlatoon(date)===p?['Day']:[]),...(resolveNightPlatoon(date)===p?['Night']:[])])}}})
test('Melbourne daylight saving is timezone-correct',()=>{assert.equal(instant('2027-04-04',18),'2027-04-04T08:00:00.000Z');assert.equal(instant('2027-10-03',18),'2027-10-03T07:00:00.000Z')})
test('28 day roster blocks',()=>{assert.equal(rosterBlock('2026-10-02'),1654);assert.equal(rosterBlock('2026-10-30'),1655)})
test('Z day work Monday through Thursday, no holiday suppression',()=>{assert.deepEqual(generateRoster({platoon:'Z',from:'2026-10-19',to:'2026-10-25'}).shifts.map(s=>s.date),['2026-10-19','2026-10-20','2026-10-21','2026-10-22'])})
test('explicit leave suppresses roster intervals, no automatic recurrence',()=>{const base=generateRoster({platoon:'A',from:'2026-01-03',to:'2026-01-10'});const leave=generateRoster({platoon:'A',from:'2026-01-03',to:'2026-01-10',leave:[{period:'period-1',startingRosterBlock:rosterBlock('2026-01-03'),start:'2026-01-03',end:'2026-01-04'}]});assert.ok(leave.shifts.length<base.shifts.length)})
test('temporary allocation wins and gear transfer is bounded',()=>{const result=generateRoster({platoon:'A',from:'2026-01-03',to:'2026-01-11',stations:[{stationId:1,from:'2026-01-01'},{stationId:22,from:'2026-01-05',temporary:true}]});assert.ok(result.shifts.some(s=>s.stationId===22));assert.ok(result.gearReminders.some(r=>r.title==='Move FF Gear to FS22'))})
test('idempotent and invalid input rejected',()=>{const i={platoon:'D' as const,from:'2027-01-01',to:'2027-02-01'};assert.deepEqual(generateRoster(i),generateRoster(i));assert.throws(()=>generateRoster({...i,from:'not-date'}))})
