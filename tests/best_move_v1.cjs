// Best move, v1 (2026-11-08).
//
// The user asked for the game to work the way the best players play: easy, fun, functional.
// BEST_MOVE_V1 puts one line on the Bank board with the single best next move and a [G] DO IT
// button that does it, one step at a time; only the button for that step lights up. The advice
// follows the routine that lasted longest in the runway model. These checks lock in, using the
// real terminal code from index.html in a mocked browser:
//   - fix first (a held spare, else buy at the richest wallet, else pay out the market that
//     covers a fuse); the soonest failure COMMS lets you see comes first, then AIR, DEFENSE,
//     POWER, WATER, THERMAL; COMMS is never suggested
//   - collect once a visit (pay out while an earning wallet is short of a fuse, else reinvest);
//     earnings that arrive while you watch never nag
//   - invest the spare: one fuse's worth stays in each earning wallet; day one invests it all
//   - when the Bank can't pay for AIR or DEFENSE, move a COMMS fuse in on the FUSE PANEL
//     (the password gate stays; the panel repeats the keys once); the advice never moves a fuse itself
//   - COLLECT shows what REINVEST and PAY OUT each do; the return report names the best move
//   - DO IT adds no clock time; nothing is advised while frozen; the BEST_MOVE switch hides it
//
// RUN: node tests/best_move_v1.cjs

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const INDEX = path.resolve(__dirname, '..', 'index.html');
const HTML  = fs.readFileSync(INDEX, 'utf8');
const HR = 3600, DAY = 86400;

function terminalScript() {
  const scripts = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
  const found = scripts.find(s => s.includes('var PASSWORD = "START AGAIN"'));
  if (!found) throw new Error('Terminal IIFE not found in index.html');
  return found.replace(/\}\)\(\);\s*$/, 'window.__audit = { ev: function(s){ return eval(s); } };})();');
}

const HOSTS = {
  prod:  { protocol: 'https:', hostname: 'start-again.pplx.app' },
  test:  { protocol: 'https:', hostname: 'raw.githack.com' },
  local: { protocol: 'http:',  hostname: 'localhost' },
  file:  { protocol: 'file:',  hostname: '' },
};

function makeHarness(storage = {}, opts = {}) {
  let now = opts.now || 1_800_000_000_000;
  let seq = 0;
  const tasks = new Map();
  const els   = new Map();
  const winEv = {}, docEv = {};

  class El {
    constructor(id = '') {
      this.id = id; this.style = {}; this.attrs = {}; this.children = [];
      this._html = ''; this.value = ''; this.className = ''; this.parentNode = null;
      const set = new Set();
      this.classList = {
        add: (...x) => x.forEach(y => set.add(y)),
        remove: (...x) => x.forEach(y => set.delete(y)),
        contains: x => set.has(x),
        toggle: x => (set.has(x) ? set.delete(x) : set.add(x)),
      };
    }
    set innerHTML(s) { this._html = s; this.children = []; }
    get innerHTML() { return this._html; }
    get lastChild()  { return this.children.at(-1) || null; }
    get firstChild() { return this.children[0] || null; }
    appendChild(e) { this.children.push(e); e.parentNode = this; return e; }
    removeChild(e) { this.children = this.children.filter(x => x !== e); e.parentNode = null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {} removeEventListener() {}
    focus() {} select() {}
    querySelector() { return null; } querySelectorAll() { return []; }
    closest(sel) {
      const has = (e, c) => e.classList.contains(c) || (' ' + (e.className || '') + ' ').includes(' ' + c + ' ');
      for (let e = this; e; e = e.parentNode) {
        if (sel.includes('.saTerm-click') && (has(e, 'saTerm-click') || e.attrs['data-act'] != null)) return e;
        if (sel === '.saTerm-chip' && has(e, 'saTerm-chip')) return e;
      }
      return null;
    }
  }
  function get(id) { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); }

  const document = {
    readyState: 'loading', visibilityState: 'visible',
    getElementById: get, createElement: () => new El(),
    querySelector: () => null, body: new El(),
    addEventListener: (e, f) => (docEv[e] ??= []).push(f),
    removeEventListener: () => {},
  };
  class Clock extends Date {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  const context = {
    console, document, Date: Clock, Promise,
    Math: Object.create(Math),
    location: { ...(opts.host || HOSTS.prod) },
    localStorage: {
      getItem: k => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: k => { delete storage[k]; },
    },
    setTimeout:  (f, ms = 0) => { const id = ++seq; tasks.set(id, { f, at: now + ms, ms, interval: false }); return id; },
    setInterval: (f, ms)     => { const id = ++seq; tasks.set(id, { f, at: now + ms, ms, interval: true  }); return id; },
    clearTimeout:  id => tasks.delete(id),
    clearInterval: id => tasks.delete(id),
    addEventListener:    (e, f) => (winEv[e] ??= []).push(f),
    removeEventListener: () => {},
  };
  context.window = context;
  context.Math.random = () => 0;   // deterministic: baseline decay always picks the first candidate
  vm.createContext(context);
  vm.runInContext(terminalScript(), context);
  context.__audit.ev('boot()');
  return {
    storage, tasks,
    ev: s => context.__audit.ev(s),
    now: () => now, setNow: x => { now = x; }, advance: ms => { now += ms; },
    lines: () => get('saTermScreen').children.map(c => c.innerHTML),
    fireDoc: e => (docEv[e] || []).forEach(f => f()),
    fireWin: e => (winEv[e] || []).forEach(f => f()),
  };
}

// ---------- runner -------------------------------------------------------
const results = [];
const pending = [];
function test(name, fn) {
  pending.push(Promise.resolve().then(fn).then(
    () => { results.push({ name, ok: true }); console.log(`[PASS] ${name}`); },
    e  => { results.push({ name, ok: false }); console.log(`[FAIL] ${name}\n       ${e && e.stack || e}`); }
  ));
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function near(a, b, m, tol = 1e-6) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m}: expected ~${b}, got ${a}`); }

// A live run past the opening assault, with an explicit grid.
function liveRun(h, lit, extra = '') {
  h.ev(`
    openingApplied = true; fuseTriggerFired = true; termActive = true; bunkerLive = true;
    ${Object.entries(lit).map(([k, v]) => `FUSE.${k}.lit = ${v};`).join(' ')}
    lastLit = {air:4, water:4, thermal:4, defense:4};
    rem = {air:null, water:null, thermal:null, defense:null};
    reserve = {air:1, water:1, thermal:1};
    reconcileAll(); sabotageAccum = 0; baselineAccum = 0;
    commsWatch = {defense:true, air:true, water:true, thermal:true}; clampComms();
    ECON.syncLedger();
    ${extra}
    armClocks(); saveBunkerState();
  `);
}
const SUM_LIT = 'FUSE.air.lit+FUSE.water.lit+FUSE.thermal.lit+FUSE.defense.lit+FUSE.power.lit+FUSE.comms.lit';
function ledger(h) { return JSON.parse(h.ev(`ECON.syncLedger(), JSON.stringify(ECON.inventory)`)); }
function balanced(inv) { return inv.availableStock + inv.installed + inv.heldByPlayer + inv.destroyed === inv.totalSupply; }
function state(h) {
  return JSON.parse(h.ev(`JSON.stringify({
    lit: {defense:FUSE.defense.lit, air:FUSE.air.lit, power:FUSE.power.lit, water:FUSE.water.lit, thermal:FUSE.thermal.lit, comms:FUSE.comms.lit},
    rem: rem, reserve: reserve, sab: sabotageAccum, base: baselineAccum, dead: deadRun,
    inv: (ECON.syncLedger(), ECON.inventory)
  })`));
}


// Drive timers and promise chains until `done()` or the budget runs out.
async function pump(h, done, maxSteps = 6000) {
  for (let i = 0; i < 200; i++) await Promise.resolve();
  for (let i = 0; i < maxSteps && !done(); i++) {
    const items = [...h.tasks.entries()].sort((x, y) => x[1].at - y[1].at);
    if (!items.length) break;
    const [id, t] = items[0];
    if (t.interval) { t.at += t.ms; } else { h.tasks.delete(id); }
    h.setNow(Math.max(h.now(), t.at - (t.interval ? t.ms : 0)));
    try { t.f(); } catch (_) {}
    for (let j = 0; j < 20; j++) await Promise.resolve();
  }
}
function wallet(h) { return JSON.parse(h.ev('JSON.stringify(ECON.wallet)')); }
function market(h, id) { return JSON.parse(h.ev(`JSON.stringify(ECON.marketById("${id}"))`)); }


const FULL = { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 };
const mode = h => h.ev('mode');
const boardHtml = h => h.ev('board.el ? board.el.innerHTML : ""');
const fmt = (h, n) => h.ev(`fmtMoney(${n})`);
const clickKeys = h => JSON.parse(h.ev('JSON.stringify(screen.children.filter(function(c){ return c.classList.contains("saTerm-click"); }).map(function(c){ return c.getAttribute("data-k"); }))'));
const btn = (act, v) => `(function(){ var b=document.createElement("button"); b.setAttribute("data-act","${act}");${v != null ? ` b.setAttribute("data-v","${v}");` : ''} return b; })()`;
// A real tap: the finger goes down, then the click lands on the element.
const tapEl = (h, expr) => h.ev(`onScreenDown(); onScreenClick({target: ${expr}, detail: 1, preventDefault: function(){}})`);
const tapKey = (h, k) => tapEl(h, `screen.children.filter(function(c){ return c.getAttribute("data-k")==="${k}"; }).pop()`);
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
const settle = h => h.advance(h.ev('SA_RENEW.TAP_SETTLE_MS') + 1);


const best = h => JSON.parse(h.ev('JSON.stringify(bestMove())'));
const doIt = h => h.ev('boardAct("best")');
const CUR = ['BTC', 'XRP', 'USD', 'ETH', 'GEARS'];
const zeroWallets = (h, keep = []) => h.ev(CUR.filter(c => !keep.includes(c)).map(c => `ECON.wallet.${c} = 0;`).join(' '));
const coins = w => JSON.stringify(CUR.map(c => +(w[c] || 0).toFixed(6)));
const lit = (h, k) => h.ev(`FUSE.${k}.lit`);
const lit4 = { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 };
const highlighted = h => (boardHtml(h).match(/class="saB-btn[^"]* best"/g) || []).length;

// ---------- the order of advice ------------------------------------------------
test('day one: fix first, then invest the whole starting wallet (three taps)', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3 });
  h.ev('openBoard()');
  let mv = best(h);
  eq(mv.act, 'buy', 'AIR is down and a wallet covers a fuse: buy one');
  eq(mv.v, 'ELSALVADOR', 'at the wallet with the most fuses\u2019 worth (all equal on day one: the first)');
  assert(/class="saB-btn go best" data-act="buy" data-v="ELSALVADOR"/.test(boardHtml(h)), 'that BUY FUSE button lights up');
  assert(boardHtml(h).includes('data-act="best"') && boardHtml(h).includes('[G] DO IT'), 'with a DO IT button');
  doIt(h);
  eq(h.ev('board.fit'), true, 'DO IT bought the fuse and opened the fit list');
  mv = best(h);
  eq(mv.act + ':' + mv.v, 'fit:air', 'next: fit it into AIR');
  doIt(h);
  eq(lit(h, 'air'), 4, 'DO IT fitted it into AIR');
  mv = best(h);
  eq(mv.act, 'investSpare', 'then invest');
  assert(mv.text.includes('starting wallet'), 'day one says: invest your starting wallet');
  doIt(h);
  const w = wallet(h);
  eq(coins(w), coins({}), 'day one keeps nothing back: it all earns');
  near(market(h, 'ELSALVADOR').position, 15, 'El Salvador invests what the fuse left');
  mv = best(h);
  eq(mv.act, null, 'nothing left to do');
  assert(mv.text.startsWith('ALL GOOD'), 'ALL GOOD: ' + mv.text);
  assert(!boardHtml(h).includes('data-act="best"'), 'no DO IT button when there is nothing to do');
});

test('only the button for the best move lights up', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3 }, 'ECON.marketById("USA").position = 1000; ECON.marketById("USA").earned = 30;');
  h.ev('openBoard()');
  eq(highlighted(h), 1, 'one highlighted button, although COLLECT and several BUY FUSE buttons are usable');
  assert(boardHtml(h).includes('class="saB-btn go" data-act="collect" data-v="USA"'), 'a usable COLLECT stays bright but does not compete');
});

test('collect once a visit: pay out while a wallet is short of a fuse, then invest the spare', () => {
  const h = makeHarness();
  liveRun(h, lit4, 'ECON.marketById("USA").position = 1000; ECON.wallet.USD = 50; ECON.accrue(86400);');
  zeroWallets(h, ['USD']);   // only the United States is in play
  h.ev('openBoard()');
  let mv = best(h);
  eq(mv.act, 'collectAll', 'earnings were waiting: collect all');
  assert(mv.text.includes('pay out'), 'and pay out, because the USD wallet holds less than a fuse: ' + mv.text);
  doIt(h);
  eq(mode(h), 'boardAll', 'DO IT asks the 27 July question for every market');
  mv = best(h);
  eq(mv.act, 'payoutAll', 'the advice answers PAY OUT ALL');
  assert(/class="saB-btn go best" data-act="payoutAll"/.test(boardHtml(h)), 'PAY OUT ALL lights up, REINVEST ALL does not');
  doIt(h);
  near(wallet(h).USD, 270, 'paid out');
  eq(best(h).act, 'investSpare', 'then invest the spare');
  doIt(h);
  near(wallet(h).USD, 100, 'one fuse\u2019s worth stays in the earning USD wallet');
  near(market(h, 'USA').position, 1170, 'the rest is invested');
  eq(best(h).act, null, 'ALL GOOD');
  h.advance(90 * 1000); h.ev('clockStep(); boardTick();');
  assert(h.ev('ECON.ready("USA")') > 0, 'new earnings arrive while the board is open');
  eq(best(h).act, null, 'but they never nag: one collect per visit');
  h.ev('openBoard()');
  mv = best(h);
  eq(mv.act, 'collectAll', 'the next visit collects again');
  assert(mv.text.includes('reinvest'), 'and reinvests, because every earning wallet already holds a fuse\u2019s worth: ' + mv.text);
});

test('when no wallet covers a fuse, pay out the market whose earnings do; COLLECT shows both answers', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3 });
  zeroWallets(h);
  h.ev('ECON.wallet.USD = 60; ECON.marketById("USA").position = 1000; ECON.marketById("USA").earned = 50; openBoard();');
  let mv = best(h);
  eq(mv.act + ':' + mv.v, 'collect:USA', 'collect the United States');
  doIt(h);
  eq(mode(h), 'boardAsk', 'COLLECT still asks REINVEST or PAY OUT');
  const html = boardHtml(h);
  assert(html.includes('REINVEST: earns ' + fmt(h, 1050 * 0.22) + ' a day (now ' + fmt(h, 220) + ')'), 'what REINVEST does: ' + html.match(/saB-askinfo">[^<]*/));
  assert(html.includes('PAY OUT: wallet ' + fmt(h, 110) + ' USD; a fuse costs ' + fmt(h, 100)), 'what PAY OUT does');
  mv = best(h);
  eq(mv.act, 'payout', 'the advice answers PAY OUT (the wallet is short of a fuse)');
  doIt(h); doIt(h); doIt(h);
  eq(lit(h, 'air'), 4, 'pay out, buy, fit: AIR is full');
});

test('the soonest failure you can see comes first; hidden clocks never reorder the advice', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3, water: 3 }, 'rem.water = 3600;');
  eq(h.ev('fixTarget()'), 'water', 'WATER fails in 1 h and COMMS watches it: WATER first');
  h.ev('commsWatch.water = false;');
  eq(h.ev('fixTarget()'), 'air', 'no sensor on WATER: the advice can\u2019t know, so AIR comes first');
  const g = makeHarness();
  liveRun(g, { ...lit4, defense: 3, power: 3 });
  eq(g.ev('fixTarget()'), 'defense', 'no countdowns: DEFENSE before POWER');
});

test('COMMS is never suggested', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, comms: 2 });
  h.ev('ECON.buyFuse("USA"); openBoard();');
  eq(h.ev('ECON.inventory.heldByPlayer'), 1, 'holding a spare');
  eq(h.ev('fixTarget()'), null, 'COMMS only changes what you see: no fix');
  assert(best(h).act !== 'fitOpen', 'the spare is not pushed into COMMS');
});

test('when the Bank can\u2019t pay for AIR, move a COMMS fuse in on the FUSE PANEL (password kept)', async () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 2, comms: 2 }, 'bunkerUnlocked = true;');
  zeroWallets(h);
  h.ev('openBoard()');
  const mv = best(h);
  eq(mv.act + ':' + mv.v, 'fuseMove:air', 'no money: move a COMMS fuse');
  assert(mv.text.includes('[M] MOVE, 6, then 2') && mv.text.includes('You lose a sensor, not time'), mv.text);
  doIt(h);
  await pump(h, () => !h.ev('busy') && mode(h) === 'fuse');
  eq(mode(h), 'fuse', 'DO IT opens the FUSE PANEL');
  eq(lit(h, 'air') + ':' + lit(h, 'comms'), '2:2', 'the advice never moves a fuse itself');
  const note = h.lines().filter(t => t.includes('BEST MOVE'));
  eq(note.length, 1, 'the FUSE PANEL repeats the keys once');
  assert(note[0].includes('[M] MOVE, then 6 (COMMS), then 2 (AIR)'), note[0]);
  h.ev('fusePanel();');
  const drawn = () => !h.ev('panelRendering') && h.lines().some(t => t.includes('data-k="M"'));
  await pump(h, drawn);
  assert(drawn(), 'the panel drew again');
  eq(h.lines().filter(t => t.includes('BEST MOVE')).length, 0, 'the note shows once, then goes');
  const g = makeHarness();
  liveRun(g, { ...lit4, air: 2, comms: 2 }, 'bunkerUnlocked = false;');
  zeroWallets(g);
  g.ev('openBoard(); boardAct("best");');
  await pump(g, () => !g.ev('busy'));
  assert(mode(g) !== 'fuse' && g.lines().join('\n').includes('PASSWORD-PROTECTED'), 'a locked bunker still asks for the password');
});

test('waiting: the advice counts down to the fuse your earnings will buy', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3, comms: 0 });
  zeroWallets(h);
  h.ev('ECON.marketById("USA").position = 1000; openBoard();');
  const mv = best(h);
  eq(mv.act, null, 'nothing to tap');
  eq(mv.m, 'USA', 'the United States earns a fuse soonest');
  assert(mv.text.includes('AIR needs a fuse. Your earnings pay for one at United States in'), mv.text);
  eq((boardHtml(h).match(/data-live="eta" data-m="USA"/g) || []).length, 2, 'the countdown is live, in the advice and in the row');
  assert(!boardHtml(h).includes('data-act="best"'), 'no DO IT button while waiting');
});

test('sold out: no buying advice, but a held spare still goes in', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3, comms: 0 }, 'ECON.buyFuse("USA"); ECON.inventory.availableStock = 0;');
  h.ev('openBoard()');
  eq(best(h).act, 'fitOpen', 'fit the spare you hold');
  doIt(h); doIt(h);
  eq(lit(h, 'air'), 4, 'fitted');
  h.ev('FUSE.air.lit = 3; reconcileAll(); renderBoard();');
  const mv = best(h);
  eq(mv.act, null, 'nothing to buy');
  assert(mv.text.startsWith('SOLD OUT'), mv.text);
});

// ---------- fairness and switches ---------------------------------------------
test('DO IT never adds clock time', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3, comms: 0 });
  zeroWallets(h);
  h.ev('ECON.marketById("USA").position = 1000; ECON.marketById("USA").earned = 50; openBoard();');
  const before = state(h);
  for (let i = 0; i < 12; i++) { doIt(h); h.ev('onBoard("G")'); }
  const after = state(h);
  eq(JSON.stringify(after.rem) + after.sab + after.base, JSON.stringify(before.rem) + before.sab + before.base, 'collecting, paying out and repeated taps change no clock');
  near(wallet(h).USD, 50, 'it paid out the 50 USD waiting');
  eq(best(h).act, null, 'then waited');
});

test('nothing is advised while frozen; the BEST_MOVE switch hides it', () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3 });
  h.ev('freezeBunker();');
  eq(h.ev('bestMove()'), null, 'Single Player has the bunker frozen: no advice');
  const g = makeHarness();
  liveRun(g, { ...lit4, air: 3 }, 'SA_RENEW.BEST_MOVE = false;');
  g.ev('openBoard()');
  eq(g.ev('bestMove()'), null, 'switched off');
  assert(!boardHtml(g).includes('BEST MOVE') && highlighted(g) === 0, 'no advice line and no highlight');
  g.ev('onBoard("G")');
  eq(lit(g, 'air'), 3, 'G does nothing');
});

test('the return report names the best move and where to do it', async () => {
  const h = makeHarness();
  liveRun(h, { ...lit4, air: 3 }, 'BASELINE_SECS = 0;');
  const b = makeHarness({ ...h.storage }, { now: h.now() + 8 * HR * 1000 });
  b.ev('BASELINE_SECS = 0; resumeRun()');
  await pump(b, () => mode(b) === 'reportNext');
  const text = b.lines().join('\n');
  assert(/BEST MOVE {2}\[M\] BANK: Buy a fuse at El Salvador \(10 BTC\) and fit it into AIR\./.test(text.replace(/&nbsp;/g, ' ')), 'the report says it: ' + (text.match(/BEST MOVE[^\n]*/) || ['(missing)'])[0]);
});

test('following DO IT always finishes a visit in a few taps', () => {
  // This harness's wear-out always hits the first system, so AIR loses a fuse every day: a
  // worst case. The runway model (random wear-out) measures how long players last.
  const h = makeHarness();
  liveRun(h, { defense: 3, air: 3, power: 4, water: 4, thermal: 4, comms: 1 });
  const taps = [], ends = [];
  for (let day = 0; day < 5 && !h.ev('deadRun'); day++) {
    h.ev('openBoard()');
    let n = 0, mv = best(h);
    while (n < 30 && mv && mv.act && mv.act !== 'fuseMove') { doIt(h); n++; mv = best(h); }
    taps.push(n); ends.push(mv ? (mv.act || mv.text.split('.')[0]) : 'none');
    assert(n < 30, 'day ' + day + ': the advice finishes');
    assert(balanced(ledger(h)), 'day ' + day + ': the fuse ledger still adds up');
    if (mv && mv.act === 'fuseMove') h.ev(`FUSE.comms.lit--; FUSE.${mv.v}.lit++; reconcileAll(); refitComms();`);   // the player follows it
    h.ev('closeBoardState(); advanceOffline(86400);');
  }
  assert(taps[0] >= 3 && Math.max(...taps) <= 12, 'a handful of taps a visit: ' + taps.join(','));
  assert(ends.every(e => e === 'fuseMove' || /^(ALL GOOD|AIR needs|DEFENSE needs|POWER needs|WATER needs|THERMAL needs|SOLD OUT)/.test(e)), 'each visit ends with nothing left to tap in the Bank: ' + ends.join(' | '));
});

Promise.all(pending).then(() => {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passing`);
  process.exit(pass === results.length ? 0 : 1);
});
