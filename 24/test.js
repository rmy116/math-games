// Rocket 24 logic tests. Run from the repo root: node 24/test.js
// Pulls the <script id="core"> block straight out of index.html next to this file, so it tests exactly what ships.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('core script not found'); process.exit(1); }
const sandbox = { module: { exports: {} } };
vm.runInNewContext(m[1], sandbox);
const C = sandbox.module.exports;

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) pass++; else { fail++; console.log('FAIL:', name); } }

// --- fractions ---
const F = C.F;
ok(C.eq(C.div(F(8), C.sub(F(3), C.div(F(8), F(3)))), F(24)), '8/(3-8/3) == 24 exactly');
ok(C.div(F(1), F(0)) === null, 'divide by zero returns null');
ok(C.fracText(F(-3, 4)) === '\u22123/4', 'fraction text');

// --- solver: known cards ---
for (const c of [[1, 2, 3, 4], [4, 7, 8, 8], [3, 3, 8, 8], [1, 5, 5, 5], [6, 6, 6, 6], [1, 3, 4, 6]]) {
  const info = C.analyze(c);
  ok(info.solvable, c.join(' ') + ' solvable');
  // every solution the solver returns really makes 24 when re-parsed from its text
  info.solutions.forEach(t => {
    const r = C.check(C.toText(t), c);
    ok(r.ok, c.join(' ') + ' solution re-checks: ' + C.toText(t));
  });
}
for (const c of [[1, 1, 1, 1], [1, 1, 1, 2], [9, 9, 9, 9], [4, 4, 6, 6]]) ok(!C.analyze(c).solvable, c.join(' ') + ' unsolvable');
ok(C.analyze([3, 3, 8, 8]).dots === 3, '3 3 8 8 is a 3-dot card');
ok(C.analyze([1, 5, 5, 5]).dots === 3, '1 5 5 5 is a 3-dot card');
ok(C.analyze([1, 2, 3, 4]).dots === 1, '1 2 3 4 is a 1-dot card');

// --- expression checker ---
const yes = [
  ['1*2*3*4', [1, 2, 3, 4]], ['(7-8/8)*4', [4, 7, 8, 8]], ['8/(3-8/3)', [3, 3, 8, 8]],
  ['8\u00f7(3\u22128\u00f73)', [3, 3, 8, 8]], ['4 x 3 x 2 x 1', [1, 2, 3, 4]], ['((1+2)+3)*4', [1, 2, 3, 4]],
  ['5*(5-1/5)', [1, 5, 5, 5]], ['6+6+6+6', [6, 6, 6, 6]]
];
yes.forEach(([e, c]) => ok(C.check(e, c).ok, 'accepts ' + e));
const no = [
  ['12+3*4', [1, 2, 3, 4], 'concat'], ['(1+2)*8', [1, 2, 3, 8], 'missing'], ['1*2*3*4*1', [1, 2, 3, 4], 'wrongnums'],
  ['1*2*3*5', [1, 2, 3, 4], 'wrongnums'], ['2*3*4*4', [1, 2, 3, 4], 'wrongnums'], ['1+2+3+4', [1, 2, 3, 4], 'not24'],
  ['(1+2*3*4', [1, 2, 3, 4], 'syntax'], ['1+2)*3*4', [1, 2, 3, 4], 'syntax'], ['-1+2*3*4', [1, 2, 3, 4], 'syntax'],
  ['1 2 3 4', [1, 2, 3, 4], 'syntax'], ['1'+'2'+'*3-4*3', [1, 2, 3, 4], 'concat'], ['2(3*4)1', [1, 2, 3, 4], 'syntax'], ['', [1, 2, 3, 4], 'empty'],
  ['alert(1)', [1, 2, 3, 4], 'bad'], ['4/(2-2)*1', [1, 2, 2, 4], 'divzero'], ['8/3-8/3', [3, 3, 8, 8], 'not24']
];
no.forEach(([e, c, code]) => { const r = C.check(e, c); ok(!r.ok && r.code === code, 'rejects ' + JSON.stringify(e) + ' as ' + code + ' (got ' + r.code + ')'); });

// --- deck: every card in every pool is solvable, and dealing never produces an unsolvable card ---
const all = C.allCards();
const total = all[1].length + all[2].length + all[3].length + all.unsolvable.length;
ok(total === 495, 'all 495 four-number combinations classified (got ' + total + ')');
[1, 2, 3].forEach(d => all[d].forEach(c => ok(C.analyze(c.nums).solvable && C.analyze(c.nums).dots === d, 'pool ' + d + ' card ' + c.nums)));
const dealt = { 1: 0, 2: 0, 3: 0 };
for (const d of [1, 2, 3]) {
  const recent = [];
  for (let i = 0; i < 1000; i++) {
    const card = C.deal(d, recent);
    recent.push(card.key); if (recent.length > 40) recent.shift();
    const info = C.analyze(card.nums);
    ok(info.solvable && card.nums.length === 4 && card.nums.every(n => n >= 1 && n <= 9), 'dealt card solvable ' + card.nums);
    const h = C.hints(info);
    ok(h.length === 4 && C.check(h[2].replace(' = 24', ''), card.nums).ok, 'hint 3 is a valid answer for ' + card.nums);
    dealt[d]++;
  }
}
console.log('Pools: 1-dot ' + all[1].length + ', 2-dot ' + all[2].length + ', 3-dot ' + all[3].length + ', unsolvable (never dealt) ' + all.unsolvable.length);
console.log('Dealt and verified: ' + JSON.stringify(dealt));
console.log('Hint examples:');
[[1, 2, 3, 4], [4, 7, 8, 8], [3, 3, 8, 8]].forEach(c => { const h = C.hints(C.analyze(c)); console.log('  ' + c.join(' ') + ' -> ' + h.slice(0, 3).join(' | ')); });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
