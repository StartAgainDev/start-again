// Play-test balance and fairness, v1 (2026-11-08).
//
// The user asked for a fair, fun build to play-test. These checks lock in what that build
// does, using the real terminal code from index.html in a mocked browser:
//   - markets earn over time (SA_RENEW.EARN_PER_DAY), only earnings come out, and the
//     terminal asks REINVEST or PAYOUT; no instant profit loop (audit F3)
//   - every currency can buy a fuse (audit F6), from a 32-fuse stock
//   - an Idle run can't take the Single Player door after a reload (audit F1)
//   - a hidden tab is billed exactly like a closed tab, with the return report (audit F2)
//   - sabotage progress keeps its share when DEFENSE changes level
//   - the survival day count, and the return report's market lines
// Every number checked here comes from the settings block; they are play-test proposals.
//
// RUN: node tests/playtest_balance_v1.cjs

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

// ---------- MARKET_EARNINGS_V1 (F3) -----------------------------------------
test('investing pays nothing instantly: the old 20-tap profit loop is gone', () => {
  const h = makeHarness();
  h.ev('ECON.wallet.USD = 500;');
  for (let i = 0; i < 20; i++) {
    h.ev('ECON.reinvest("USA", ECON.wallet.USD); ECON.collect("USA", "payout"); ECON.payout("USA");');
  }
  eq(wallet(h).USD + market(h, 'USA').position, 500, 'no money appears without time passing');
  eq(h.ev('ECON.ready("USA")'), 0, 'nothing ready to collect');
});

test('a market earns 22% of what is invested per day, on live time', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.wallet.XRP = 1000; ECON.reinvest("SAUDI", 1000); BASELINE_SECS = 0;');
  h.ev(`advanceBy(${DAY}, true)`);
  near(h.ev('ECON.ready("SAUDI")'), 220, 'one day of earnings', 0.01);
  eq(market(h, 'SAUDI').position, 1000, 'the investment itself is unchanged');
});

test('a closed tab, a dev skip and live play earn exactly the same', () => {
  const run = (how) => {
    const h = makeHarness({}, { host: HOSTS.local });
    h.ev('termActive = true; bunkerLive = true; applyDevPreset(SA_RENEW.DEV_PRESETS[3]); BASELINE_SECS = 0;');
    h.ev('ECON.wallet.USD = 250; ECON.reinvest("USA", 200); saveBunkerState();');
    if (how === 'live') h.ev(`advanceBy(${DAY}, true)`);
    if (how === 'skip') h.ev(`devTimeSkip(${DAY}, "+24h")`);
    if (how === 'closed') {
      const back = makeHarness({ ...h.storage }, { host: HOSTS.local, now: h.now() + DAY * 1000 });
      back.ev('restoreBunkerRun()');
      return back.ev('ECON.ready("USA")');
    }
    return h.ev('ECON.ready("USA")');
  };
  const live = run('live'), skip = run('skip'), closed = run('closed');
  near(live, 44, 'live: 22% of 200', 0.01);
  near(skip, live, 'dev skip = live', 0.01);
  near(closed, live, 'closed tab = live (earnings run at the full rate while away)', 0.01);
});

test('nothing is earned while Single Player has the bunker frozen', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.wallet.USD = 250; ECON.reinvest("USA", 200);');
  h.ev('freezeBunker()');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 3 * DAY * 1000 });
  const res = JSON.parse(back.ev('JSON.stringify(restoreBunkerRun())'));
  eq(res.frozen, true, 'the save was frozen');
  eq(back.ev('ECON.ready("USA")'), 0, 'no earnings for frozen time');
});

test('collect asks reinvest or payout, and invested money stays in', () => {
  const h = makeHarness();
  h.ev('ECON.wallet.ETH = 2.5; ECON.reinvest("INDIA", 2); ECON.accrue(2 * 86400);');
  near(h.ev('ECON.ready("INDIA")'), 0.88, 'two days at 22% of 2 ETH', 0.005);
  const r = h.ev('ECON.collect("INDIA", "reinvest")');
  near(market(h, 'INDIA').position, 2 + r, 'reinvest adds the earnings to the investment', 1e-9);
  h.ev('ECON.accrue(86400);');
  const before = wallet(h).ETH;
  const p = h.ev('ECON.collect("INDIA", "payout")');
  assert(p > 0, 'payout pays the new earnings');
  near(wallet(h).ETH, before + p, 'payout goes to the wallet', 1e-9);
  near(market(h, 'INDIA').position, 2 + r, 'the investment never comes back out', 1e-9);
  eq(h.ev('ECON.collect("INDIA", "payout")'), 0, 'nothing left to collect');
});

test('the market screen offers collect, then asks reinvest or payout', async () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.wallet.USD = 250; ECON.reinvest("USA", 200); ECON.accrue(86400);');
  h.ev('mSel = "USA"; marketDetail();');
  await pump(h, () => h.ev('mode') === 'market');
  assert(h.lines().some(l => l.includes('[C] COLLECT EARNINGS')), 'collect is on the market screen');
  assert(h.lines().some(l => l.includes('Ready:') && l.includes('44 USD')), 'shows what is ready');
  h.ev('onMarket("C")');
  await pump(h, () => h.ev('mode') === 'marketCollect');
  eq(h.ev('mode'), 'marketCollect', 'the collect question is asked');
  assert(h.lines().some(l => l.includes('Reinvest or pay out?')), 'reinvest or payout');
  h.ev('onMarketCollect("P")');
  await pump(h, () => h.ev('mode') === 'market');
  near(wallet(h).USD, 50 + 44, 'paid out to the wallet', 0.01);
  near(JSON.parse(h.storage.SA_ECON_STATE_V1).wallet.USD, 94, 'and saved straight away', 0.01);
});

test('earnings and investments survive a reload', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.wallet.GEARS = 50; ECON.reinvest("GEARS", 40); ECON.accrue(43200);');
  h.ev('saveBunkerState()');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 10 * 1000 });   // under 20 s: no drift
  back.ev('restoreBunkerRun()');
  eq(market(back, 'GEARS').position, 40, 'investment restored');
  near(back.ev('ECON.ready("GEARS")'), 4.4, 'earnings restored', 0.005);
});

// ---------- prices (F6) and stock -------------------------------------------
test('every currency can buy a fuse from the starting wallet', () => {
  const h = makeHarness();
  const q = JSON.parse(h.ev('JSON.stringify(ECON.markets.map(function(m){ return [m.currency, ECON.quote(m.id).price, ECON.wallet[m.currency]]; }))'));
  eq(JSON.stringify(q.map(x => [x[0], x[1]])), JSON.stringify([['BTC', 10], ['XRP', 100], ['USD', 100], ['ETH', 1], ['GEARS', 20]]), 'first-fuse prices');
  for (const [cur, price, held] of q) assert(held >= price, `${cur}: the starting wallet (${held}) can pay ${price}`);
  for (const id of ['ELSALVADOR', 'SAUDI', 'USA', 'INDIA', 'GEARS']) eq(h.ev(`ECON.buyFuse("${id}")`), true, id + ' sells a fuse');
  eq(h.ev('ECON.inventory.heldByPlayer'), 5, 'five fuses, one from each seller');
  near(h.ev('ECON.quote("USA").price'), 100 * Math.pow(1.08, 5), 'the price rise is shared by every seller', 0.01);
});

test('a fresh run has 32 fuses for sale', () => {
  const h = makeHarness();
  eq(h.ev('ECON.inventory.availableStock'), 32, 'stock');
  eq(h.ev('ECON.inventory.totalSupply'), 56, '24 in the grid + 32 for sale');
});

// ---------- F1: the door choice is saved ------------------------------------
test('an Idle run stays Idle after a reload: no Single Player door, no free pause', async () => {
  const h = makeHarness();
  liveRun(h, { defense: 3, air: 3, power: 4, water: 4, thermal: 4, comms: 1 });
  h.ev('window.saDoorChosen = "idle"; saveBunkerState();');
  eq(JSON.parse(h.storage.SA_BUNKER_STATE_V1).door, 'idle', 'the choice is in the save');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 60 * 1000 });
  back.ev('restoreBunkerRun()');
  eq(back.ev('doorChosen()'), true, 'the door is still chosen after the reload');
  back.ev('printMenu()');
  await pump(back, () => back.lines().some(l => l.includes('[6] BUNKER NETWORK')));
  assert(!back.lines().some(l => l.includes('[5] PROCEED')), '[5] PROCEED is not offered');
  back.ev('onHub("5")');
  await pump(back, () => back.ev('mode') === 'hub');
  assert(back.lines().some(l => l.includes('That decision is already made.')), '[5] is refused');
});

test('a Single Player run keeps its route back to the campaign', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 });
  h.ev('window.saDoorChosen = "single"; freezeBunker();');
  const back = makeHarness({ ...h.storage }, { now: h.now() + DAY * 1000 });
  const res = JSON.parse(back.ev('JSON.stringify(restoreBunkerRun())'));
  eq(res.frozen, true, 'paused while away, with no extra time');
  eq(back.ev('doorChosen()'), false, '[5] PROCEED still leads back to the doors');
});

// ---------- F2: a hidden tab is a closed tab --------------------------------
test('a tab hidden for 8 hours is billed like a closed tab, with the return report', async () => {
  const closed = makeHarness();
  liveRun(closed, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0;');
  const back = makeHarness({ ...closed.storage }, { now: closed.now() + 8 * HR * 1000 });
  back.ev('BASELINE_SECS = 0; restoreBunkerRun()');
  const closedAir = back.ev('rem.air');

  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0;');
  h.ev('askInput("FUSE PANEL [M / I / C / B] >", {mode:"fuse"});');
  h.ev('document.visibilityState = "hidden";'); h.fireDoc('visibilitychange');
  eq(h.ev('clocksArmed'), false, 'billing stops while hidden');
  const hiddenAt = h.now();
  h.advance(8 * HR * 1000);
  h.fireWin('pagehide');
  eq(JSON.parse(h.storage.SA_BUNKER_STATE_V1).ts, hiddenAt, 'a save while hidden keeps the moment it hid');
  h.ev('document.visibilityState = "visible";'); h.fireDoc('visibilitychange');
  // Measure the moment the report appears: printing it takes real time, and the live clock
  // rightly keeps running while it prints, so a longer report must not move this check.
  await pump(h, () => h.lines().join('\n').includes('SESSION RESTORED'));
  h.ev('BASELINE_SECS = 0;');
  near(h.ev('rem.air'), closedAir, 'AIR drained exactly as much as with the tab closed (2h 48m of drift)', 1);
  await pump(h, () => h.ev('mode') === 'reportNext');
  const text = h.lines().join('\n');
  assert(text.includes('SESSION RESTORED'), 'the return report is shown');
  assert(text.includes('You were away 8h 0m'), 'it reports the time hidden');
});

test('a short hide is billed live at the full rate, so tab-flicking gains nothing', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0;');
  const before = h.ev('rem.air');
  h.ev('document.visibilityState = "hidden";'); h.fireDoc('visibilitychange');
  h.advance(10 * 1000);
  h.ev('document.visibilityState = "visible";'); h.fireDoc('visibilitychange');
  near(before - h.ev('rem.air'), 10, '10 s hidden = 10 s drained', 0.01);
  eq(h.ev('clocksArmed'), true, 'the live clock runs again');
});

test('hiding the tab never pauses the opening assassination hunt', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'huntArmed = true; huntResolved = false;');
  h.ev('document.visibilityState = "hidden";'); h.fireDoc('visibilitychange');
  eq(h.ev('hiddenAt'), 0, 'no away-billing while the hunt is live');
  eq(h.ev('clocksArmed'), true, 'the clock keeps running');
});

// ---------- SABOTAGE_SHARE_V1 -----------------------------------------------
test('sabotage progress keeps its share when DEFENSE drops, so no instant double hit', () => {
  const h = makeHarness();
  liveRun(h, { defense: 3, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0;');
  h.ev(`advanceBy(${30 * HR}, false, ${30 * HR})`);          // 30 h of the 48 h at 3/4
  near(h.ev('sabotageAccum'), 30 * HR, '30 h of progress', 1);
  h.ev('FUSE.defense.lit = 2;');                               // decay knocks DEFENSE to 2/4
  h.ev('advanceBy(1, false, 1)');
  eq(h.ev('FUSE.air.lit'), 4, 'no sabotage the moment DEFENSE drops');
  near(h.ev('sabotageAccum'), 15 * HR + 1, '62.5% of the 24 h interval', 1);
  h.ev(`advanceBy(${9 * HR - 10}, false, ${9 * HR - 10})`);
  eq(h.ev('FUSE.air.lit'), 4, 'still none just before');
  h.ev('advanceBy(20, false, 20)');
  eq(h.ev('FUSE.air.lit'), 3, 'the next sabotage comes 9 h later, at the 2/4 rate');
});

test('the sabotage rates themselves are unchanged', () => {
  const h = makeHarness();
  eq(h.ev('JSON.stringify([SABOTAGE_SECS[3], SABOTAGE_SECS[2], SABOTAGE_SECS[1]])'), JSON.stringify([48 * HR, 24 * HR, 8 * HR]), 'one per 48 h, 24 h, 8 h');
});

// ---------- SURVIVAL_TIME_V1 and the return report -----------------------------
test('the day count follows bunker time and skips frozen time', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0;');
  eq(h.ev('bunkerDay()'), 1, 'day 1 at the start');
  h.ev(`advanceBy(${DAY + HR}, true)`);
  eq(h.ev('bunkerDay()'), 2, 'day 2 after 25 h');
  h.ev('freezeBunker()');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 5 * DAY * 1000 });
  back.ev('restoreBunkerRun()');
  eq(back.ev('bunkerDay()'), 2, 'five frozen days do not count');
  assert(back.ev('fmtSurvived(aliveS)') === '1 day, 1 hour', 'the death screen wording');
});

test('the return report shows market earnings and what to do next', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.reinvest("SAUDI", 200); BASELINE_SECS = 0;');
  const back = makeHarness({ ...h.storage }, { now: h.now() + DAY * 1000 });
  const res = JSON.parse(back.ev('BASELINE_SECS = 0; JSON.stringify(restoreBunkerRun())'));
  near(res.earned.XRP, 44, 'earned while away', 0.01);
  const text = back.ev('offlineReportLines(' + JSON.stringify(res) + ').map(function(l){ return l.t; }).join("\\n")');
  assert(text.includes('DAY 2'), 'the day count is in the header');
  assert(text.includes('Markets earned +44 XRP while you were away.'), 'what the markets made');
  assert(text.includes('Ready to collect at [2] BANK: 44 XRP.'), 'where to collect it');
  assert(text.includes('You can buy a fuse now for'), 'which sellers you can pay');
  const fresh = makeHarness();
  liveRun(fresh, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 });
  const t2 = fresh.ev('replacementLines({}).map(function(l){ return l.t; }).join("\\n")');
  assert(t2.includes('Nothing is invested, so nothing is earning.'), 'a nudge to invest when nothing is');
});

test('the return report hides clocks COMMS is not watching, like the FUSE PANEL', () => {
  const h = makeHarness();
  liveRun(h, { defense: 3, air: 3, power: 4, water: 4, thermal: 3, comms: 1 }, 'BASELINE_SECS = 0; commsWatch = {defense:false, air:true, water:false, thermal:false};');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 2 * HR * 1000 });
  const res = JSON.parse(back.ev('BASELINE_SECS = 0; JSON.stringify(restoreBunkerRun())'));
  const rows = back.ev('offlineReportLines(' + JSON.stringify(res) + ').map(function(l){ return l.t; }).join("\\n")').split('\n');
  const row = (name) => rows.find(r => r.trim().startsWith(name)) || '';
  assert(/\u25b8 \d/.test(row('AIR')), 'AIR is watched, so its countdown shows: ' + row('AIR'));
  assert(row('THERMAL').includes('NO SIGNAL'), 'THERMAL is not watched: ' + row('THERMAL'));
  assert(row('DEFENSE').includes('NO SIGNAL'), 'DEFENSE is not watched: ' + row('DEFENSE'));
  assert(row('THERMAL').includes('3/4'), 'the fuse count itself is still shown');
});

Promise.all(pending).then(() => {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passing`);
  process.exit(pass === results.length ? 0 : 1);
});
