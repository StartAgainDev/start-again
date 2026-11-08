// Renewable clocks, Phase 2 part 1 (2026-11-08).
//
// Locks in refresh rule A, approved by the user: clocks are never bought with coin.
// A fuse bought at the market and fitted where one blew restores that system's
// capacity: time left keeps the same share of the bigger budget, and at 4/4 the
// drain stops and the spent reserve refills over FULL_CAPACITY_REFILL_S.
//
// Also covers: the return report (what failed while away, why, and how to replace
// it), the fuse ledger counting the 24 grid fuses (audit F5), and the hidden dev
// time-skip, which must reproduce a real closed-tab absence exactly and must never
// appear on the public site.
//
// Play-test proposals (2026-11-08, the user asked for a fair, fun build to test):
// market earnings over time with collect -> reinvest or payout, a 32-fuse stock,
// prices every currency can pay, the F1/F2 fixes, real time left at low POWER,
// sabotage progress keeping its share, and the survival day count.
//
// RUN: node tests/renewable_clocks_phase2.cjs

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

// ---------- settings block ----------------------------------------------
test('one settings block holds every new number, each balance number labelled a proposal', () => {
  const h = makeHarness();
  const steps = h.ev('JSON.stringify(SA_RENEW.DEV_SKIP_STEPS)');
  eq(steps, JSON.stringify([
    { label: '+10m', secs: 600 }, { label: '+1h', secs: 3600 }, { label: '+8h', secs: 28800 },
    { label: '+24h', secs: 86400 }, { label: '+3d', secs: 259200 },
  ]), 'time-skip steps must be exactly the user\'s list');
  eq(h.ev('Object.keys(SA_RENEW).join(",")'), 'EARN_PER_DAY,SHOP_STOCK,PRICE_UNITS,STARTER_GRANT,INVEST_STEPS,TAP_SETTLE_MS,LIVE_DECIMALS_MAX,DEV_SKIP_STEPS,DEV_PRESETS',
    'the settings block holds the play-test proposals and the dev tooling, nothing else');
  eq(h.ev('SA_RENEW.EARN_PER_DAY'), 0.22, 'earnings proposal');
  eq(h.ev('SA_RENEW.SHOP_STOCK'), 32, 'stock proposal');
  eq(h.ev('JSON.stringify(SA_RENEW.PRICE_UNITS)'), JSON.stringify({ USD: 1, XRP: 1, GEARS: 0.2, BTC: 0.1, ETH: 0.01 }), 'price units proposal');
  eq(h.ev('JSON.stringify(SA_RENEW.STARTER_GRANT)'), JSON.stringify({ BTC: 25, XRP: 250, USD: 250, ETH: 2.5, GEARS: 50 }), 'starter grant proposal');
  eq(h.ev('JSON.stringify(SA_RENEW.INVEST_STEPS)'), JSON.stringify([0.25, 0.5, 1]), 'invest toggle proposal (UI only)');
  eq(h.ev('SA_RENEW.TAP_SETTLE_MS'), 300, 'double-tap guard proposal (UI only)');
  eq(h.ev('SA_RENEW.LIVE_DECIMALS_MAX'), 6, 'live counter decimals proposal (UI only)');
  const block = HTML.slice(HTML.indexOf('RENEWABLE_CLOCKS_SETTINGS_V1 (2026-11-08)'), HTML.indexOf('end RENEWABLE_CLOCKS_SETTINGS_V1'));
  for (const k of ['EARN_PER_DAY', 'SHOP_STOCK', 'PRICE_UNITS', 'STARTER_GRANT', 'INVEST_STEPS', 'TAP_SETTLE_MS', 'LIVE_DECIMALS_MAX']) {
    const before = block.slice(0, block.indexOf(k + ':'));
    assert(/\/\/ PROPOSAL[^\n]*\n(\s*\/\/[^\n]*\n)*\s*$/.test(before), `${k} carries a PROPOSAL label`);
  }
  assert(/var ECON_TOTAL_SUPPLY = SA_RENEW\.SHOP_STOCK;/.test(HTML), 'the stock comes from the settings block');
  assert(/var ECON_STARTER_GRANT = SA_RENEW\.STARTER_GRANT;/.test(HTML), 'the grant comes from the settings block');
});

// ---------- dev gate ------------------------------------------------------
test('the dev time-skip never runs on the public site', () => {
  const h = makeHarness({}, { host: HOSTS.prod });
  eq(h.ev('SA_DEV_HOST'), false, 'production host must not be a dev host');
  liveRun(h, { defense: 3, air: 3, power: 4, water: 4, thermal: 4, comms: 1 });
  const before = h.storage.SA_BUNKER_STATE_V1;
  eq(h.ev('devTimeSkip(86400, "+24h")'), false, 'devTimeSkip must refuse on production');
  eq(h.ev('applyDevPreset(SA_RENEW.DEV_PRESETS[0])'), false, 'dev presets must refuse on production');
  eq(h.storage.SA_BUNKER_STATE_V1, before, 'the save must be untouched');
  h.ev('onFuse("T")');
  assert(h.ev('mode') !== 'devSkip', '[T] must not open the dev menu on production');
  assert(!h.lines().some(l => l.includes('DEV TIME-SKIP')), 'no dev line on the public FUSE PANEL');
});

test('the dev time-skip is available on local copies and the private play-test link', () => {
  eq(makeHarness({}, { host: HOSTS.local }).ev('SA_DEV_HOST'), true, 'localhost is a dev host');
  eq(makeHarness({}, { host: HOSTS.file }).ev('SA_DEV_HOST'), true, 'file:// is a dev host');
  eq(makeHarness({}, { host: HOSTS.test }).ev('SA_DEV_HOST'), true, 'the raw.githack.com play-test link is a dev host');
  for (const hostname of ['start-again.pplx.app', 'www.start-again.pplx.app', 'evil-raw.githack.com.example', 'githack.com']) {
    eq(makeHarness({}, { host: { protocol: 'https:', hostname } }).ev('SA_DEV_HOST'), false, hostname + ' is not a dev host');
  }
});

// ---------- time-skip == real absence --------------------------------------
test('every dev skip reproduces a real closed-tab absence exactly', () => {
  const steps = [600, HR, 8 * HR, DAY, 3 * DAY];
  for (let p = 0; p < 3; p++) {                  // SECURE, TYPICAL, FRAGILE
    for (const secs of steps) {
      // A: dev skip inside one page.
      const a = makeHarness({}, { host: HOSTS.local });
      a.ev(`termActive = true; bunkerLive = true; applyDevPreset(SA_RENEW.DEV_PRESETS[${p}]);`);
      eq(a.ev(`devTimeSkip(${secs}, "t")`), true, `skip ${secs}s must run`);
      const sa = state(a);
      // B: the same grid, saved, then the page reopened `secs` later.
      const b = makeHarness({}, { host: HOSTS.local });
      b.ev(`termActive = true; bunkerLive = true; applyDevPreset(SA_RENEW.DEV_PRESETS[${p}]);`);
      const c = makeHarness({ ...b.storage }, { host: HOSTS.local, now: b.now() + secs * 1000 });
      const res = JSON.parse(c.ev('JSON.stringify(restoreBunkerRun())'));
      const sc = state(c);
      const tag = `preset ${p}, ${secs}s`;
      eq(sa.dead, !!res.died, `${tag}: same survival outcome`);
      if (res.died) continue;
      eq(JSON.stringify(sa.lit), JSON.stringify(sc.lit), `${tag}: same fuses`);
      for (const k of ['air', 'water', 'thermal']) {
        if (sc.rem[k] === null) eq(sa.rem[k], null, `${tag}: ${k} not draining in both`);
        else near(sa.rem[k], sc.rem[k], `${tag}: ${k} time left`);
        near(sa.reserve[k], sc.reserve[k], `${tag}: ${k} reserve`);
      }
      near(sa.sab, sc.sab, `${tag}: sabotage progress`);
      near(sa.base, sc.base, `${tag}: decay progress`);
      eq(JSON.stringify(sa.inv), JSON.stringify(sc.inv), `${tag}: same fuse ledger`);
    }
  }
});

test('a dev skip during Single Player adds no time, like a real return', () => {
  const h = makeHarness({}, { host: HOSTS.local });
  h.ev('applyDevPreset(SA_RENEW.DEV_PRESETS[1]); freezeBunker();');
  const before = state(h);
  eq(h.ev('devTimeSkip(259200, "+3d")'), true, 'skip runs');
  const after = state(h);
  eq(JSON.stringify(after.lit), JSON.stringify(before.lit), 'no fuse lost while frozen');
  near(after.rem.air, before.rem.air, 'AIR unchanged while frozen');
});

test('the dev skip shows a before/after block after the real report', async () => {
  const h = makeHarness({}, { host: HOSTS.local });
  h.ev('termActive = true; bunkerLive = true; applyDevPreset(SA_RENEW.DEV_PRESETS[1]);');
  h.ev('devTimeSkip(28800, "+8h")');
  for (let i = 0; i < 200; i++) await Promise.resolve();
  for (let i = 0; i < 4000 && h.ev('mode') !== 'reportNext'; i++) {   // let the typewriter finish
    const items = [...h.tasks.entries()].sort((x, y) => x[1].at - y[1].at);
    const nxt = items.find(([, t]) => !t.interval);
    if (!nxt) break;
    const [id, t] = nxt; h.tasks.delete(id); h.setNow(Math.max(h.now(), t.at));
    try { t.f(); } catch (_) {}
    for (let j = 0; j < 20; j++) await Promise.resolve();
  }
  const text = h.lines().join('\n');
  assert(text.includes('SESSION RESTORED'), 'the real return report is shown');
  assert(text.includes('You were away 8h 0m'), 'it reports the skipped time');
  assert(text.includes('DEV TIME-SKIP +8h'), 'the dev before/after block follows it');
});

// ---------- return report ---------------------------------------------------
test('the return report lists each fuse lost while away, its cause and when', () => {
  const h = makeHarness();
  liveRun(h, { defense: 2, air: 4, power: 4, water: 4, thermal: 4, comms: 4 });   // sabotage 1 per 24h
  const back = makeHarness({ ...h.storage }, { now: h.now() + 25 * HR * 1000 });
  const res = JSON.parse(back.ev('JSON.stringify(restoreBunkerRun())'));
  eq(res.blown.length, 2, 'one sabotage blow and one decay blow in 25 hours');
  eq(res.blown.map(b => b.cause).sort().join(','), 'decay,sabotage', 'both causes recorded');
  for (const b of res.blown) near((b.at - res.fromTs) / 1000, DAY, 'each failed 24h after leaving', 1);
  const text = back.ev('offlineReportLines(' + JSON.stringify(res) + ').map(function(l){ return l.t; }).join("\\n")');
  assert(text.includes('Fuses lost while you were away: 2'), 'count of lost fuses');
  assert(text.includes('AIR sabotaged, 1d 0h after you left'), 'sabotage line with timing');
  assert(text.includes('AIR burned out, 1d 0h after you left'), 'decay line with timing');
  assert(text.includes('Spare fuses held: 0.'), 'held spares');
  assert(text.includes('To replace a blown fuse: buy one at [2] BANK'), 'how to replace');
  assert(text.includes('Soonest failure you can see: AIR in 23h 0m.'), 'soonest visible failure');
});

test('the report never previews a countdown that COMMS cannot see', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 0 });
  const text = h.ev('replacementLines().map(function(l){ return l.t; }).join("\\n")');
  assert(!text.includes('Soonest failure'), 'no sensor on AIR, so no AIR countdown');
  eq(h.ev('fitPreview("air")'), 'no sensor on it', 'the fit preview hides it too');
});

test('an absence with nothing lost says so', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 4, power: 4, water: 4, thermal: 4, comms: 4 });
  const back = makeHarness({ ...h.storage }, { now: h.now() + 2 * HR * 1000 });
  const text = back.ev('offlineReportLines(restoreBunkerRun()).map(function(l){ return l.t; }).join("\\n")');
  assert(text.includes('No fuses failed while you were away.'), 'explicit all-clear');
});

// ---------- rule A: fitting a bought fuse --------------------------------------
test('rule A: a fitted fuse raises the level and keeps the same share of time', async () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 2, power: 4, water: 4, thermal: 4, comms: 4 },
    'rem.air = CLOCK_MIN.air[2] * 0.5; ECON.inventory.availableStock -= 2; ECON.inventory.heldByPlayer = 2;');
  eq(h.ev('fitPreview("air")'), '12h 0m \u2192 1d 0h left', 'preview before fitting');
  h.ev('onFuse("I")');
  for (let i = 0; i < 50; i++) await Promise.resolve();      // let the prompt open
  eq(h.ev('mode'), 'fuseFit', '[I] opens the fit prompt when a spare is held');
  assert(h.lines().some(l => l.includes('[2] AIR') && l.includes('1d 0h left')), 'the choice list previews AIR');
  h.ev('onFuseFit("2")');                                     // [2] = AIR, as on the panel
  eq(h.ev('FUSE.air.lit'), 3, 'AIR up one level');
  near(h.ev('clockLeft("air")'), DAY, 'AIR now has 24h left (50% of 48h)');
  eq(h.ev('ECON.inventory.heldByPlayer'), 1, 'one held fuse spent');
  eq(JSON.parse(h.storage.SA_BUNKER_STATE_V1).lit.air, 3, 'saved straight away');
  eq(h.ev('fitPreview("air")'), 'drain stops \u00b7 full again in 12h 0m', 'preview for the last fuse');
  h.ev('onFuseFit("2")');
  eq(h.ev('FUSE.air.lit'), 4, 'AIR full');
  eq(h.ev('rem.air'), null, 'the drain stops at 4/4');
  near(h.ev('reserve.air'), 0.5, 'the spent reserve is kept, not reset');
  h.ev(`advanceBy(${6 * HR}, false, ${6 * HR})`);
  near(h.ev('reserve.air'), 0.75, 'refills a quarter in 6h', 1e-9);
  h.ev(`advanceBy(${6 * HR}, false, ${6 * HR})`);
  near(h.ev('reserve.air'), 1, 'full after 12h', 1e-9);
});

test('fit previews for DEFENSE, POWER and COMMS describe what changes', () => {
  const h = makeHarness();
  liveRun(h, { defense: 2, air: 4, power: 3, water: 4, thermal: 4, comms: 3 });
  h.ev('commsWatch = {defense:true, air:true, water:true, thermal:false};');
  eq(h.ev('fitPreview("defense")'), 'sabotage 1 per 24h \u2192 1 per 48h', 'DEFENSE 2/4 -> 3/4');
  eq(h.ev('fitPreview("power")'), 'life support x1.5 \u2192 x1.0', 'POWER 3/4 -> 4/4');
  eq(h.ev('fitPreview("comms")'), '+1 sensor channel', 'COMMS');
  eq(h.ev('fitPreview("water")'), 'full', 'a full system');
  h.ev('FUSE.defense.lit = 3');
  eq(h.ev('fitPreview("defense")'), 'sabotage stops', 'DEFENSE 3/4 -> 4/4');
});

test('previews and the report read the same clock as the panel, even at low POWER', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 2, power: 3, water: 4, thermal: 4, comms: 4 },
    'rem.air = CLOCK_MIN.air[2] * 0.5;');
  const panel = h.ev('liveLabel("air")').replace('\u25b8 ', '');
  eq(panel, '8h 0m', 'the panel shows the REAL time left at POWER 3/4 (12h of budget at x1.5)');
  eq(h.ev('fitPreview("air")'), '8h 0m \u2192 16h 0m left', 'the fit preview starts from the panel reading');
  const soon = h.ev('replacementLines().map(function(l){ return l.t; }).join("\\n")');
  assert(soon.includes('Soonest failure you can see: AIR in 8h 0m.'), 'the report matches the panel: ' + soon);
  // and that reading is the truth: AIR fails 8 hours later, not 12
  h.ev(`BASELINE_SECS = 0; advanceBy(${8 * HR - 60}, false, ${8 * HR - 60})`);
  eq(h.ev('deadRun || FUSE.air.lit === 0'), false, 'alive a minute before');
  const died = h.ev(`advanceBy(120, false, 120)`);
  eq(died, 'air', 'AIR fails when the panel said it would');
});

test('coin never buys time: only fitting a fuse changes a clock', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'ECON.wallet.USD = 100000;');
  const before = h.ev('rem.air');
  h.ev('ECON.reinvest("USA", 5000); ECON.payout("USA"); ECON.buyFuse("USA"); ECON.buyFuse("USA");');
  eq(h.ev('rem.air'), before, 'spending, investing and buying leave AIR untouched');
  eq(h.ev('ECON.inventory.heldByPlayer'), 2, 'the bought fuses are held, not fitted');
  h.ev('fitSpare("air")');
  assert(h.ev('rem.air') === null && h.ev('FUSE.air.lit') === 4, 'fitting is what restores AIR');
});

test('moving a fitted fuse away and back, or reloading, adds no time', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 2, power: 4, water: 3, thermal: 4, comms: 4 },
    'rem.air = CLOCK_MIN.air[2] * 0.5; ECON.inventory.availableStock -= 1; ECON.inventory.heldByPlayer = 1;');
  h.ev('fitSpare("air")');
  const t0 = h.ev('rem.air');
  h.ev('onFuse("M"); onFuseFrom("2"); onFuseTo("4");');       // AIR -> WATER
  h.ev('onFuse("M"); onFuseFrom("4"); onFuseTo("2");');       // WATER -> AIR
  near(h.ev('rem.air'), t0, 'away and back is a no-op');
  h.ev('saveBunkerState()');
  const back = makeHarness({ ...h.storage }, { now: h.now() + 5000 });   // reload 5s later
  back.ev('restoreBunkerRun()');
  near(back.ev('rem.air'), t0, 'a reload adds nothing');
});

test('repeated taps cannot fit the same fuse twice', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 2, power: 4, water: 4, thermal: 4, comms: 4 },
    'ECON.inventory.availableStock -= 1; ECON.inventory.heldByPlayer = 1;');
  h.ev('onFuseFit("2"); onFuseFit("2"); onFuseFit("2");');
  eq(h.ev('FUSE.air.lit'), 3, 'one held fuse = one fit');
  eq(h.ev('ECON.inventory.heldByPlayer'), 0, 'nothing left to fit');
  assert(/form\.addEventListener\("submit", onFormSubmit\);/.test(HTML) &&
         /function onFormSubmit\(e\)\{\s*e\.preventDefault\(\);\s*if\(busy\) return;/.test(HTML),
    'the input form ignores submits while a command is running');
});

test('the market install uses the FUSE PANEL numbering', () => {
  const h = makeHarness();
  eq(h.ev('JSON.stringify(INSTALL_KEY_MAP)'),
     h.ev('JSON.stringify(FUSE_ORDER.reduce(function(m,k,i){ m[String(i+1)]=k; return m; }, {}))'),
     '[1]-[6] mean the same systems on both screens');
});

// ---------- ledger (F5) ---------------------------------------------------
test('the fuse ledger counts the grid: opening, decay, buy, fit, Home and reload', () => {
  const h = makeHarness();
  let inv = ledger(h);
  eq(inv.totalSupply, 56, '24 grid + 32 shop fuses');
  eq(inv.installed, 24, 'the grid starts full');
  eq(inv.destroyed, 0, 'nothing destroyed yet');
  h.ev('termActive = true; bunkerLive = true; fusePanel();');   // the opening assault
  inv = ledger(h);
  eq(inv.installed, 19, 'opening assault: 5 fuses gone');
  eq(inv.destroyed, 5, 'and counted as destroyed');
  h.ev('baselineBlowOne()');
  inv = ledger(h);
  eq(inv.destroyed, 6, 'decay destroys a grid fuse');
  h.ev('ECON.wallet.USD = 1000; ECON.buyFuse("USA"); ECON.buyFuse("USA");');
  h.ev('fitSpare("air")');
  inv = ledger(h);
  eq(inv.availableStock, 30, 'two bought');
  eq(inv.heldByPlayer, 1, 'one held');
  eq(inv.installed, h.ev(SUM_LIT), 'installed equals the grid');
  assert(balanced(inv), 'ledger balances');
  h.ev('saveBunkerState()');
  const back = makeHarness({ ...h.storage });
  back.ev('restoreBunkerRun()');
  eq(JSON.stringify(ledger(back)), JSON.stringify(inv), 'the ledger survives a reload');
});

test('a save from before the grid was counted migrates cleanly', () => {
  const h = makeHarness();
  liveRun(h, { defense: 3, air: 3, power: 4, water: 4, thermal: 3, comms: 2 });   // 19 lit
  const econ = JSON.parse(h.storage.SA_ECON_STATE_V1);
  econ.inv = { totalSupply: 24, availableStock: 20, installed: 0, heldByPlayer: 1, destroyed: 3, purchaseCount: 4 };
  const back = makeHarness({ ...h.storage, SA_ECON_STATE_V1: JSON.stringify(econ) });
  back.ev('restoreBunkerRun()');
  const inv = ledger(back);
  eq(inv.totalSupply, 48, 'grid added to the total');
  eq(inv.installed, 19, 'installed taken from the grid');
  eq(inv.destroyed, 8, 'destroyed = 48 - 20 stock - 1 held - 19 lit');
  eq(inv.gridCounted, true, 'marked as migrated');
  assert(balanced(inv), 'ledger balances');
});

// ---------- labels ----------------------------------------------------------
test('the development build is labelled v8.90-dev', () => {
  eq((HTML.match(/v8\.90-dev/g) || []).length >= 2, true, 'footer and build tag');
  assert(!/sa-intro-foot">[^<]*v8\.89/.test(HTML), 'the footer no longer says v8.89');
});

Promise.all(pending).then(() => {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passing`);
  process.exit(pass === results.length ? 0 : 1);
});
