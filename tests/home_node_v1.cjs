// Home Node v1 test suite.
//
// Locks in the Home / sleep bunker contract. Runs the terminal IIFE from
// index.html inside a Node VM with mocked DOM/clock/storage.
//
// Approved design (memory citations):
//   - resting freezes HOSTILE timers only (DEFENSE sabotage). Baseline decay
//     and life-support drain continue. (docs/offline-drain.md:97)
//   - entry is gated so the player cannot flee mid-crisis. (docs/offline-drain.md:97)
//   - early return carries a cost. (docs/offline-drain.md:97)
//   - the fatigue lever as drafted was REJECTED as the cost mechanism.
//     v1 uses a FUSE cost (rest consumes one fuse from the shared pool) to tie
//     Home to the Local Economy loop and preserve scarcity.
//
// UNRESOLVED and deliberately not decided here:
//   - exact sleep-duration options and per-tier costs. v1 exposes them as
//     configuration knobs (HOME_SLEEP_OPTIONS, HOME_EARLY_RETURN_REFUND).
//   - the exact "crisis" definition that gates entry. v1 uses a clear rule:
//     any LETHAL system with < 60 real seconds remaining, or DEFENSE at 0/4.
//
// RUN: node tests/home_node_v1.cjs

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const INDEX = path.resolve(__dirname, '..', 'index.html');
const HTML  = fs.readFileSync(INDEX, 'utf8');

function terminalScript() {
  const scripts = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(m => m[1]);
  const found = scripts.find(s => s.includes('var PASSWORD = "START AGAIN"'));
  if (!found) throw new Error('Terminal IIFE not found');
  return found.replace(/\}\)\(\);\s*$/, 'window.__audit = { ev: function(s){ return eval(s); } };})();');
}

function makeHarness(storage = {}) {
  let now = 1_800_000_000_000;
  let seq = 0;
  const tasks = new Map();
  const els   = new Map();
  const winEv = {}, docEv = {};

  class El {
    constructor(id = '') {
      this.id = id; this.style = {}; this.attrs = {}; this.children = [];
      this._html = ''; this.value = ''; this.className = ''; this.parentNode = null;
      const s = new Set();
      this.classList = {
        add: (...x) => x.forEach(y => s.add(y)),
        remove: (...x) => x.forEach(y => s.delete(y)),
        contains: x => s.has(x),
      };
    }
    set innerHTML(s) { this._html = s; this.children = []; }
    get innerHTML() { return this._html; }
    get lastChild() { return this.children.at(-1) || null; }
    appendChild(e) { this.children.push(e); e.parentNode = this; return e; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k) { return this.attrs[k] ?? null; }
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
    location: { protocol: 'https:', hostname: 'example.test' },
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
  context.Math.random = () => 0;
  vm.createContext(context);
  vm.runInContext(terminalScript(), context);
  context.__audit.ev('boot()');
  return {
    ev: s => context.__audit.ev(s),
    storage, tasks, get,
    now: () => now, advance: ms => { now += ms; },
    fire: e => (winEv[e] || []).forEach(f => { try { f(); } catch(_){} }),
  };
}

// ---------- runner -----------------------------------------------------

const results = [];
const _pending = [];
function test(name, fn) {
  _pending.push(
    Promise.resolve().then(fn).then(
      () => { results.push({ name, ok: true }); console.log(`[PASS] ${name}`); },
      e  => { results.push({ name, ok: false, err: e && e.message || String(e) });
              console.log(`[FAIL] ${name}\n       ${e && e.stack || e}`); }
    )
  );
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ---------- module surface ---------------------------------------------

test('HOME module exists with the required surface', () => {
  const h = makeHarness();
  for (const fn of ['start', 'wake', 'isAsleep', 'sleepRemaining']) {
    assert(h.ev(`typeof HOME.${fn}`) === 'function', `HOME.${fn} must be a function`);
  }
  for (const cfg of ['HOME_SLEEP_OPTIONS', 'HOME_ENTRY_GATE_S']) {
    assert(h.ev(`typeof ${cfg}`) !== 'undefined', `${cfg} must be defined`);
  }
});

test('HOME sleep options are non-empty and each carries a fuse cost', () => {
  const h = makeHarness();
  const opts = h.ev('JSON.parse(JSON.stringify(HOME_SLEEP_OPTIONS))');
  assert(Array.isArray(opts) && opts.length > 0, 'must have at least one sleep option');
  for (const o of opts) {
    assert(typeof o.durationS === 'number' && o.durationS > 0, `option durationS invalid: ${JSON.stringify(o)}`);
    assert(typeof o.cost === 'number' && o.cost > 0, `option cost invalid: ${JSON.stringify(o)}`);
  }
});

// ---------- sleep freezes HOSTILE only ---------------------------------

test('sleep freezes DEFENSE sabotage but NOT baseline decay or life-support', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[0].durationS'); // shortest option
  h.ev(`
    openingApplied = true; termActive = true; bunkerLive = true;
    FUSE.defense.lit = 2;   // sabotage will hit
    FUSE.air.lit     = 3;   // AIR clock ticking
    FUSE.comms.lit   = 0;
    reconcileAll();
    ECON.inventory.heldByPlayer = 5; ECON.inventory.availableStock -= 5; // fund the sleep
    HOME.start(${dur});
  `);
  const beforeAir  = h.ev('rem.air');
  const beforeSab  = h.ev('sabotageAccum');
  const beforeBase = h.ev('baselineAccum');

  // Simulate the full sleep duration.
  h.ev(`advanceBy(${dur}, false, ${dur})`);

  const afterAir  = h.ev('rem.air');
  const afterSab  = h.ev('sabotageAccum');
  const afterBase = h.ev('baselineAccum');

  // Life-support drained normally (about `dur` seconds at POWER 4/4 = 1x).
  assert(beforeAir - afterAir >= dur - 10,
    `AIR must drain during sleep (before=${beforeAir}, after=${afterAir})`);

  // Baseline decay accrued normally.
  assert(afterBase - beforeBase >= dur - 10,
    `baseline decay must accrue during sleep (before=${beforeBase}, after=${afterBase})`);

  // Sabotage frozen: no accrual.
  eq(afterSab, beforeSab, 'sabotage accumulator must NOT advance during sleep');
});

// ---------- entry gate: cannot flee mid-crisis --------------------------

test('sleep entry refuses when a lethal system is in critical range', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[0].durationS');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 0; reconcileAll(); rem.air = 30; // 30s of AIR reserve left
    ECON.inventory.heldByPlayer = 5; ECON.inventory.availableStock -= 5;
  `);
  const ok = h.ev(`HOME.start(${dur})`);
  eq(ok, false, 'HOME.start must refuse mid-crisis (AIR < entry gate)');
  eq(h.ev('HOME.isAsleep()'), false, 'must NOT be asleep after a refused start');
});

test('sleep entry refuses when DEFENSE is breached (0/4)', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[0].durationS');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.defense.lit = 0; reconcileAll();
    ECON.inventory.heldByPlayer = 5; ECON.inventory.availableStock -= 5;
  `);
  const ok = h.ev(`HOME.start(${dur})`);
  eq(ok, false, 'HOME.start must refuse when perimeter is breached');
});

// ---------- fuse cost: rest consumes one fuse from the shared pool ------

test('starting sleep spends the option fuse cost from heldByPlayer', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.inventory.heldByPlayer = 3; ECON.inventory.availableStock -= 3;
  `);
  const before = h.ev('ECON.inventory.heldByPlayer');
  const opt = h.ev('HOME_SLEEP_OPTIONS[0]');
  const ok = h.ev(`HOME.start(${opt.durationS})`);
  eq(ok, true, 'HOME.start must succeed with sufficient held fuses');
  eq(h.ev('ECON.inventory.heldByPlayer'), before - opt.cost, `held fuses must debit by option cost (${opt.cost})`);
});

test('sleep refuses when the player has no held fuses to spend', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.inventory.heldByPlayer = 0;
  `);
  const ok = h.ev('HOME.start(HOME_SLEEP_OPTIONS[0].durationS)');
  eq(ok, false, 'HOME.start must refuse without a held fuse to pay');
});

// ---------- early return: costs a partial refund ------------------------

test('waking before duration completes forfeits at least part of the fuse cost', () => {
  const h = makeHarness();
  // Pick the LONGEST option so 60s in still leaves plenty of headroom.
  const opt = h.ev('HOME_SLEEP_OPTIONS[HOME_SLEEP_OPTIONS.length-1]');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.inventory.heldByPlayer = 10; ECON.inventory.availableStock -= 10;
    HOME.start(${opt.durationS});
  `);
  const spentHeld = h.ev('ECON.inventory.heldByPlayer');
  h.advance(60_000);   // advance our mock clock by 60s (well before duration ends)
  const woke = h.ev('HOME.wake()');
  eq(woke, true, 'wake() must succeed while asleep');
  const afterHeld = h.ev('ECON.inventory.heldByPlayer');
  const refund = afterHeld - spentHeld;
  assert(refund < opt.cost,
    `early return must not refund the full fuse cost (refund=${refund}, cost=${opt.cost})`);
});

test('waking after the full duration cleans up sleep state', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[0].durationS');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.inventory.heldByPlayer = 5; ECON.inventory.availableStock -= 5;
    HOME.start(${dur});
  `);
  // Advance the mock wall-clock AND drive advanceBy so auto-wake can trigger.
  h.advance(dur * 1000);
  h.ev(`advanceBy(${dur}, false, ${dur})`);
  eq(h.ev('HOME.isAsleep()'), false, 'auto-wake once duration elapsed');
});

// ---------- persistence: sleep survives a save/reload ------------------

test('sleep state round-trips across save/reload', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[HOME_SLEEP_OPTIONS.length-1].durationS');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.inventory.heldByPlayer = 10; ECON.inventory.availableStock -= 10;
    HOME.start(${dur});
    saveBunkerState();
  `);
  const remBefore = h.ev('HOME.sleepRemaining()');
  const h2 = makeHarness({ ...h.storage });
  h2.ev('restoreBunkerRun()');
  const remAfter = h2.ev('HOME.sleepRemaining()');
  assert(remAfter > 0, `sleep must persist across reload (rem=${remAfter})`);
  // A live-tick delta of 0 was applied, so the difference should be tiny.
  assert(Math.abs(remBefore - remAfter) < 5,
    `sleep remaining must match closely (before=${remBefore}, after=${remAfter})`);
});

// ---------- death-latch discipline -------------------------------------

test('death clears sleep state (dead-run latch)', () => {
  const h = makeHarness();
  const dur = h.ev('HOME_SLEEP_OPTIONS[0].durationS');
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit = 1; reconcileAll();
    ECON.inventory.heldByPlayer = 5; ECON.inventory.availableStock -= 5;
    HOME.start(${dur});
    systemFailure("air");
  `);
  eq(h.ev('HOME.isAsleep()'), false, 'sleep must be cleared on death');
  assert(!h.storage.SA_BUNKER_STATE_V1, 'save must be cleared');
});

// ---------- static: HOME cannot cross tier boundaries ------------------

test('HOME module code does not reference Ring/district/chip/biome', () => {
  const src = fs.readFileSync(INDEX, 'utf8');
  const m = src.match(/\/\*\s*HOME_NODE_V1_START[\s\S]*?HOME_NODE_V1_END[\s\S]*?\*\//);
  assert(m, 'HOME module must be bounded by HOME_NODE_V1_START / HOME_NODE_V1_END markers');
  const codeOnly = m[0]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  for (const forbidden of ['RING_ECON', 'TERRITORIES', 'biome', 'chip', 'district', '__reportBattleResult']) {
    assert(!codeOnly.match(new RegExp('\\b' + forbidden + '\\b')),
      `HOME module code must not reference '${forbidden}'`);
  }
});

// ---------- summary -----------------------------------------------------

(async () => {
  await Promise.all(_pending);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passing`);
  if (failed.length) process.exit(1);
})();
