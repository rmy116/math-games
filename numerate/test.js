// Node test for Reckon's solver and generator. Run: node test.js [puzzlesPerTierSlot]
'use strict';
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const C = new Function(src + '; return ReckonCore();')();
const N = +process.argv[2] || 60;
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// Apply steps from the starting numbers, enforcing the game rules.
function replay(nums, steps, target) {
  const pool = nums.slice();
  for (const s of steps) {
    const ia = pool.indexOf(s.a); if (ia < 0) return 'missing ' + s.a;
    pool.splice(ia, 1);
    const ib = pool.indexOf(s.b); if (ib < 0) return 'missing ' + s.b;
    pool.splice(ib, 1);
    const r = C.check(s.a, s.op, s.b);
    if (!r.ok || r.v !== s.v || !Number.isInteger(r.v) || r.v <= 0) return 'bad step ' + C.fmtStep(s);
    pool.push(r.v);
  }
  return pool.includes(target) && steps[steps.length - 1].v === target ? null : 'does not reach target';
}

// brute-force fewest ops for cross-checking the subset DP
function bruteMin(nums, target) {
  let best = Infinity;
  (function go(pool, depth) {
    if (depth >= best) return;
    for (let i = 0; i < pool.length; i++) for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      for (const op of C.OPS) {
        const r = C.check(pool[i], op, pool[j]); if (!r.ok) continue;
        if (r.v === target) { best = Math.min(best, depth + 1); continue; }
        go(pool.filter((_, k) => k !== i && k !== j).concat(r.v), depth + 1);
      }
    }
  })(nums, 0);
  return best;
}

// 1. scoring thresholds
[[0, 3], [1, 2], [-10, 2], [10, 2], [11, 1], [-25, 1], [25, 1], [26, 0], [-300, 0]].forEach(([d, s]) => ok(C.stars(d) === s, 'stars(' + d + ') should be ' + s));
// 2. rule checks
ok(!C.check(7, '÷', 2).ok && C.check(8, '÷', 2).v === 4, 'division must be exact');
ok(!C.check(3, '-', 5).ok && !C.check(5, '-', 5).ok, 'non-positive results rejected');
// 3. tier rotation
ok(['Easy', 'Medium', 'Hard', 'Easy', 'Medium', 'Hard', 'Easy'].every((t, i) => C.tierFor(i + 1) === t), 'tier cycle');

// 4. generator per tier & slot
const BOUNDS = { Easy: [2, 3], Medium: [3, 4], Hard: [4, 5] };
const times = [], nudges = { Easy: {}, Medium: {}, Hard: {} };
for (const tier of C.TIERS) {
  const perSlot = [];
  for (let i = 0; i < 5; i++) {
    const tgt = [], mins = [];
    for (let k = 0; k < N; k++) {
      const t0 = process.hrtime.bigint();
      const p = C.generate(tier, i);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      ok(p, tier + ' ' + i + ' generation failed'); if (!p) continue;
      const tag = tier + ' #' + (i + 1) + ' ' + p.nums.join(',') + ' -> ' + p.target;
      ok(p.nums.length === 6 && new Set(p.nums).size === 6, tag + ' needs 6 distinct numbers');
      ok(!p.nums.includes(p.target), tag + ' target equals a starting number');
      ok(p.min >= BOUNDS[tier][0] && p.min <= BOUNDS[tier][1], tag + ' fewest ops ' + p.min + ' outside ' + BOUNDS[tier]);
      ok(p.min >= 2, tag + ' reachable in one op');
      ok(p.shortest.length === p.min && p.longest.length === p.max && p.max >= p.min, tag + ' solution lengths');
      let e = replay(p.nums, p.shortest, p.target); ok(!e, tag + ' shortest: ' + e);
      e = replay(p.nums, p.longest, p.target); ok(!e, tag + ' longest: ' + e);
      ok(p.ways >= 1, tag + ' ways');
      ok(typeof p.nudge === 'string' && p.nudge.length > 10, tag + ' nudge');
      if (tier !== 'Easy') {
        const nums = (p.nudge.match(/\d+/g) || []).map(Number).filter(v => !p.nums.includes(v));
        ok(nums.every(v => Math.abs(v - p.target) > 0.1 * p.target), tag + ' hint 1 gives away a value near the target: ' + p.nudge);
        ok(!p.nudge.includes(String(p.target)), tag + ' hint 1 names the target');
      }
      nudges[tier][p.nudge.replace(/\d+/g, 'N')] = (nudges[tier][p.nudge.replace(/\d+/g, 'N')] || 0) + 1;
      if (k < 4) ok(bruteMin(p.nums, p.target) === p.min, tag + ' brute-force fewest ops mismatch');
      tgt.push(p.target); mins.push(p.min);
    }
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    perSlot.push({ slot: i + 1, avgTarget: Math.round(avg(tgt)), minT: Math.min(...tgt), maxT: Math.max(...tgt), avgFewest: avg(mins).toFixed(2) });
  }
  console.log(tier); console.table(perSlot);
  for (let i = 1; i < 5; i++) ok(perSlot[i].avgTarget >= perSlot[i - 1].avgTarget - 5, tier + ' ramp: slot ' + (i + 1) + ' easier than slot ' + i);
}
console.log('hint 1 styles:', JSON.stringify(nudges, null, 1));
times.sort((a, b) => a - b);
const p50 = times[Math.floor(times.length * .5)], p99 = times[Math.floor(times.length * .99)], max = times[times.length - 1];
console.log('generation ms: p50 ' + p50.toFixed(1) + ', p99 ' + p99.toFixed(1) + ', max ' + max.toFixed(1) + ' over ' + times.length + ' puzzles');
ok(p99 < 60, 'generation p99 should be well under 300ms on a phone (<60ms here)');
console.log(fails ? fails + ' FAILURES' : 'ALL TESTS PASSED');
process.exit(fails ? 1 : 0);
