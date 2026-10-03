// Bunker Integrity test suite.
//
// Executes the real terminal IIFE from index.html inside a Node VM with
// mocked DOM/clock/storage. Each test targets one defect from the Sept-7
// audit. RUN: node tests/bunker_integrity.cjs
//
// Exit code 0 = every test passes. Any failure prints [FAIL] with detail
// and exits 1. No repository files are touched at run time.

'use strict';

const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const INDEX = path.resolve(__dirname, '..', 'index.html');
const HTML  = fs.readFileSync(INDEX, 'utf8');

// Locate the terminal IIFE by a unique in-source marker.
function terminalScript() {
  const scripts = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(m => m[1]);
  const found = scripts.find(s => s.includes('var PASSWORD = "START AGAIN"'));
  if (!found) throw new Error('Terminal IIFE not found in index.html');
  // Expose internals for the harness. Replace only the final closer.
  return found.replace(/\}\)\(\);\s*$/, 'window.__audit = { ev: function(s){ return eval(s); } };})();');
}

// Minimal DOM/window/clock harness. Deterministic Math.random for baseline decay.
function makeHarness(storage = {}) {
  let now  = 1_800_000_000_000;
  let seq  = 0;
  const tasks   = new Map();          // id -> {f, at, ms, interval}
  const els     = new Map();
  const winEv   = {};
  const docEv   = {};

  class El {
    constructor(id = '') {
      this.id = id; this.style = {}; this.attrs = {}; this.children = [];
      this._html = ''; this.value = ''; this.className = ''; this.parentNode = null;
      const set = new Set();
      this.classList = {
        add:      (...x) => x.forEach(y => set.add(y)),
        remove:   (...x) => x.forEach(y => set.delete(y)),
        contains: x => set.has(x),
        toggle:   x => (set.has(x) ? set.delete(x) : set.add(x)),
      };
    }
    set innerHTML(s) { this._html = s; this.children = []; }
    get innerHTML() { return this._html; }
    get lastChild()  { return this.children.at(-1) || null; }
    get firstChild() { return this.children[0] || null; }
    appendChild(e)   { this.children.push(e); e.parentNode = this; return e; }
    removeChild(e)   { this.children = this.children.filter(x => x !== e); e.parentNode = null; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getAttribute(k)    { return this.attrs[k] ?? null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {} removeEventListener() {}
    focus() {} select() {}
    querySelector() { return null; } querySelectorAll() { return []; }
  }
  function get(id) { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); }

  const document = {
    readyState: 'loading',
    visibilityState: 'visible',
    getElementById: get,
    createElement: () => new El(),
    querySelector: () => null,
    body: new El(),
    addEventListener: (e, f) => (docEv[e] ??= []).push(f),
    removeEventListener: () => {},
  };

  class Clock extends Date {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }

  const context = {
    console,
    document,
    Date: Clock,
    Promise,
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
  context.Math.random = () => 0; // deterministic baseline decay target = AIR

  vm.createContext(context);
  vm.runInContext(terminalScript(), context);
  context.__audit.ev('boot()');   // wire up boot() so DOM elements exist

  return {
    context, storage, tasks, winEv, docEv,
    ev:      s => context.__audit.ev(s),
    now:     () => now,
    setNow:  x => { now = x; },
    advance: ms => { now += ms; },
    fire:    e => (winEv[e]  || []).forEach(f => { try { f(); } catch (_) {} }),
    fireDoc: e => (docEv[e]  || []).forEach(f => { try { f(); } catch (_) {} }),
    get,
  };
}

// ---------- test runner --------------------------------------------------

const results = [];
const _pending = [];
function test(name, fn) {
  const p = Promise.resolve().then(fn).then(
    () => { results.push({ name, ok: true }); console.log(`[PASS] ${name}`); },
    e => { results.push({ name, ok: false, err: e && e.message || String(e) });
           console.log(`[FAIL] ${name}\n       ${e && e.stack || e}`); }
  );
  _pending.push(p);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// ---------- helpers shared by tests --------------------------------------

// Put a harness into a live, post-opening state with the AIR clock running.
function armedLiveRun(h) {
  h.ev(`
    openingApplied = true;
    termActive     = true;
    bunkerLive     = true;
    FUSE.air.lit     = 3; // one AIR fuse lost, so AIR has a real countdown
    FUSE.comms.lit   = 0;
    reconcileAll();
    rem.air        = 12345;
    baselineAccum  = 4321;
    sabotageAccum  = 123;
    armClocks();
  `);
}
function snapshot(h) {
  return JSON.parse(h.ev(`JSON.stringify({
    lit: Object.fromEntries(Object.entries(FUSE).map(([k,v]) => [k, v.lit])),
    rem, clocksArmed, base: baselineAccum, sab: sabotageAccum,
    opening: openingApplied, bunkerLive
  })`));
}

// ---------- 1. Disconnect after Idle must preserve survival budgets -----

test('disconnect after Idle preserves live clock budgets', () => {
  const h = makeHarness();
  armedLiveRun(h);
  h.ev('window.saDoorChosen = "idle"; saveBunkerState();');
  const before = snapshot(h);
  h.ev('close()');
  h.fire('pagehide');

  const saved = JSON.parse(h.storage.SA_BUNKER_STATE_V1);
  eq(saved.lit.air, before.lit.air, 'saved AIR fuse count');
  eq(saved.rem.air, before.rem.air, 'saved AIR remaining');
  eq(saved.base,    before.base,    'saved baseline accumulator');
  eq(saved.sab,     before.sab,     'saved sabotage accumulator');

  // Resume in a fresh harness and confirm the run comes back alive.
  const h2 = makeHarness({ ...h.storage });
  const r  = h2.ev('restoreBunkerRun()');
  assert(r && !r.died, 'resumed run must survive with no lethal drift');
  const restored = snapshot(h2);
  eq(restored.lit.air, before.lit.air, 'restored AIR fuse count');
  assert(restored.rem.air > 0, 'restored AIR budget must be > 0');
});

// ---------- 2. Death must not be resurrected by lifecycle handlers ------

test('death never recreates a persisted save', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    termActive     = true;
    FUSE.air.lit     = 0;
    FUSE.defense.lit = 3;
    reconcileAll();
    armClocks();
    saveBunkerState();
    systemFailure("air");
  `);
  assert(!h.storage.SA_BUNKER_STATE_V1, 'save should be cleared by systemFailure');

  // Every registered lifecycle handler must be safe to fire after death.
  h.fire('pagehide');
  h.fire('beforeunload');
  h.fireDoc('visibilitychange');
  assert(!h.storage.SA_BUNKER_STATE_V1, 'no lifecycle handler may recreate the save after death');

  // A fresh harness reading the (still absent) save must NOT restore a corpse.
  const h2 = makeHarness({ ...h.storage });
  const r  = h2.ev('hasResumableSave()');
  eq(r, false, 'hasResumableSave() must be false after death');
});

// ---------- 3. Reversible fuse move must not fabricate survival time ----

test('adding a fuse preserves the FRACTION of remaining budget (proportional rule)', () => {
  // AIR 3/4 with 50% of the 2-day budget remaining. Move a fuse away (AIR 2/4) then
  // back (AIR 3/4). Round-trip must return to the SAME 50% share, and the intermediate
  // 2/4 state must be at 50% of the new (smaller) tier ceiling.
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    FUSE.air.lit   = 3;
    FUSE.water.lit = 3;
    FUSE.comms.lit = 1;
    reconcileAll();
    rem.air = 86400;              // exactly 50% of the 2-day (172800s) tier
    moveFrom = 2; onFuseTo("4");  // AIR 3/4 -> 2/4
  `);
  const midAir = h.ev('rem.air');
  const midBudget = h.ev('CLOCK_MIN.air[FUSE.air.lit]');
  const midFrac = midAir / midBudget;
  assert(Math.abs(midFrac - 0.5) < 0.01,
    `AIR fraction must be preserved (~0.5), got ${midFrac.toFixed(3)} (${midAir}/${midBudget})`);

  h.ev('moveFrom = 4; onFuseTo("2");'); // AIR 2/4 -> 3/4
  const backAir = h.ev('rem.air');
  assert(Math.abs(backAir - 86400) < 1,
    `AIR must return to the original 86400s after A\u2192B\u2192A, got ${backAir}`);
});

test('reversible AIR->WATER->AIR move does not manufacture AIR time', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    FUSE.air.lit   = 3;
    FUSE.water.lit = 3;
    FUSE.comms.lit = 1;
    reconcileAll();
    rem.air = 100;
    moveFrom = 2;          // 2 = air in FUSE_ORDER (defense, air, power, water, thermal, comms)
    onFuseTo("4");         // 4 = water -> air fuse leaves AIR
  `);
  // Now reverse it: water -> air.
  h.ev('moveFrom = 4; onFuseTo("2");');

  const airLit = h.ev('FUSE.air.lit');
  const wLit   = h.ev('FUSE.water.lit');
  const airRem = h.ev('rem.air');

  eq(airLit, 3, 'AIR fuse count restored');
  eq(wLit,   3, 'WATER fuse count restored');
  assert(
    airRem <= 100 + 1,
    `AIR remaining must not increase on a reversible move (was 100, now ${airRem})`
  );
});

// ---------- 4. Move/Aim dialogs must not offer indefinite free pause ----

test('MOVE dialog cannot indefinitely pause all clocks', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    termActive     = true;
    bunkerLive     = true;
    FUSE.water.lit = 3;
    FUSE.comms.lit = 0;
    reconcileAll();
    rem.water = 259200; // 3 days
    armClocks();
    onFuse("M");        // enter MOVE dialog -> actionPause becomes true
  `);
  const before = h.ev('rem.water');

  // Simulate 8 real hours while the player sits at the MOVE prompt.
  h.advance(8 * 3600 * 1000);
  h.ev('clockStep()');
  const after = h.ev('rem.water');

  const drained = before - after;
  // Intended reprieve is a bounded window (see ACTION_PAUSE_CAP_V1). At minimum, the
  // player must not gain more than ~1 minute of free pause across an 8-hour absence.
  assert(
    drained >= 8 * 3600 - 60,
    `WATER budget must drain during a long MOVE hold (before=${before}, after=${after}, drained=${drained})`
  );
});

// ---------- 5. Offline catch-up: bulk and chronological must agree ------

test('offline catch-up bulk-vs-halves agree on death outcome for a 72h absence', () => {
  // Same total call, one issued as one shot, the other split in two halves back-to-back.
  // Both must agree on whether the player survives: the tier changes caused by fuses
  // blowing must feed into subsequent drain within a single call.
  const one = makeHarness();
  const two = makeHarness();
  const setup = `
    openingApplied = true;
    termActive     = true;
    FUSE.air.lit     = 4;
    FUSE.thermal.lit = 3;
    FUSE.comms.lit   = 0;
    reconcileAll();
    armClocks();
  `;
  one.ev(setup); two.ev(setup);

  const HOURS = 72;
  const eff  = (12 * 0.35 + (HOURS - 12)) * 3600; // 231120s
  const full = HOURS * 3600;                       // 259200s

  const oneDied = one.ev(`advanceBy(${eff}, false, ${full})`);
  const halfEff = eff / 2, halfFull = full / 2;
  let twoDied = two.ev(`advanceBy(${halfEff}, false, ${halfFull})`);
  if (!twoDied) twoDied = two.ev(`advanceBy(${halfEff}, false, ${halfFull})`);

  eq(!!oneDied, !!twoDied,
    `one-shot death=${oneDied} but two-halves death=${twoDied} — a single advanceBy must not "skip past" tier changes`);
});

// ---------- 6. Emergency-resume input must be reachable before death ----

test('emergency resume reaches an actionable input before AIR runs out', async () => {
  // Player left with AIR at 0/4, ~7.5 min of reserve. Comes back 7.5 min later.
  const h = makeHarness();
  h.ev(`
    openingApplied = true; termActive = true;
    FUSE.air.lit     = 0; FUSE.defense.lit = 3;
    bunkerUnlocked   = true; bunkerPass = "ABCD";
    reconcileAll(); armClocks(); saveBunkerState();
  `);

  const resumed = makeHarness({ ...h.storage });
  resumed.setNow(h.now() + 450_000); // 7.5 min later
  const t0 = resumed.now();
  resumed.ev('resumeRun()');
  const rem = resumed.ev('rem.air');
  assert(rem !== null && rem > 0, `resume must land with AIR still ticking, got rem.air=${rem}`);

  // resumeRun() opens the input via a Promise chain (fusePanel().then(armClocks)).
  // Drain both the microtask queue and any scheduled callbacks until the input opens.
  async function flushMicro() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
  let promptAt = null;
  const cap = 400;
  await flushMicro();
  for (let i = 0; i < cap && promptAt == null; i++) {
    const modeNow = resumed.ev('typeof mode==="string" ? mode : ""');
    const busyNow = resumed.ev('!!busy');
    if (modeNow === 'fuse' && !busyNow) { promptAt = (resumed.now() - t0) / 1000; break; }
    const items = [...resumed.tasks.entries()].sort((a, b) => a[1].at - b[1].at);
    if (!items.length) break;
    const [id, t] = items[0];
    resumed.setNow(t.at);
    if (t.interval) t.at += t.ms; else resumed.tasks.delete(id);
    try { t.f(); } catch (_) {}
    await flushMicro();
  }
  const died = resumed.ev(`!!($("saTermDeath") && $("saTermDeath").classList && $("saTermDeath").classList.contains("on"))`);
  assert(promptAt != null, 'resume flow never produced an actionable input prompt');
  assert(!died, `player died before rescue input became available (prompt at ${promptAt}s)`);
  assert(promptAt < 5, `input opened too slowly (${promptAt}s); emergency resume must be near-instant`);
});

// ---------- release regression probes (2026-10-03) ----------------------

test('consecutive post-pause ticks bill each elapsed second only once', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    FUSE.water.lit=3; FUSE.comms.lit=0;
    reconcileAll(); armClocks(); onFuse("M");
  `);
  const before = h.ev('rem.water');
  for (let i=0; i<80; i++) {
    h.advance(500);
    h.ev('clockStep()');
  }
  const charged = before - h.ev('rem.water');
  assert(Math.abs(charged - 10) < 0.01,
    `40 seconds with a 30-second pause must drain 10 seconds, not ${charged}`);
});

test('a selected source that loses its last fuse cannot create a negative fuse', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    FUSE.air.lit=1; FUSE.water.lit=3;
    reconcileAll();
    moveFrom=2;
    baselineBlowOne();
    onFuseTo("4");
  `);
  eq(h.ev('FUSE.air.lit'), 0, 'depleted source must stay at zero');
  eq(h.ev('FUSE.water.lit'), 3, 'destination must not receive a nonexistent fuse');
});

test('a move without a valid source is refused without throwing', () => {
  const h = makeHarness();
  h.ev('openingApplied=true; FUSE.air.lit=3; reconcileAll(); moveFrom=-1;');
  h.ev('onFuseTo("2")');
  eq(h.ev('FUSE.air.lit'), 3, 'invalid source must not mutate destination');
});

test('a quick 4/4 round trip keeps a depleted reserve', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    FUSE.air.lit=3; reconcileAll(); rem.air=100;
    moveFrom=4; onFuseTo("2");
  `);
  eq(h.ev('FUSE.air.lit'), 4, 'AIR restored to full');
  eq(h.ev('rem.air'), null, 'full capacity has no countdown');
  assert(Math.abs(h.ev('reserve.air') - 100 / h.ev('CLOCK_MIN.air[3]')) < 1e-12, 'the spent reserve is kept at 4/4');
  h.ev('moveFrom=2; onFuseTo("4");');
  assert(Math.abs(h.ev('rem.air') - 100) < 1e-6, `moving the fuse straight back out must not refill AIR, got ${h.ev('rem.air')}`);
});


test('24-hour resume applies the rest rate before the full-speed rate', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    reconcileAll(); armClocks();
    baselineAccum=BASELINE_SECS-6*3600;
    saveBunkerState();
  `);
  const resumed = makeHarness({ ...h.storage });
  resumed.setNow(h.now()+24*3600*1000);
  const result = resumed.ev('restoreBunkerRun()');
  assert(!result.died, 'reference absence must survive');

  const chronological = makeHarness({ ...h.storage });
  chronological.ev(`
    restoreBunkerRun();
    advanceBy(12*3600*OFFLINE_REST_RATE, false, 12*3600);
    advanceBy(12*3600*OFFLINE_FULL_RATE, false, 12*3600);
  `);
  const expected = chronological.ev('rem.air');
  const actual = resumed.ev('rem.air');
  assert(Math.abs(actual-expected) < 0.01,
    `resume must preserve early rest then full-rate chronology: expected ${expected}, got ${actual}`);
});

test('a fuse failure inside a minute applies at its actual event time', () => {
  const one = makeHarness(), split = makeHarness();
  const setup = `
    openingApplied=true; termActive=true; bunkerLive=true;
    reconcileAll(); armClocks();
    baselineAccum=BASELINE_SECS-10;
  `;
  one.ev(setup); split.ev(setup);
  one.ev('advanceBy(60, false, 60)');
  split.ev('advanceBy(10, false, 10); advanceBy(50, false, 50)');
  assert(Math.abs(one.ev('rem.air')-split.ev('rem.air')) < 0.01,
    `one-minute catch-up must not grant time after a fuse failure (${one.ev('rem.air')} vs ${split.ev('rem.air')})`);
});


test('long absence settles once when the resumed state is checkpointed', () => {
  const h = makeHarness();
  armedLiveRun(h);
  h.ev('saveBunkerState()');
  const resumed = makeHarness({ ...h.storage });
  resumed.setNow(h.now()+60_000);
  resumed.ev('restoreBunkerRun(); saveBunkerState();');
  const once = resumed.ev('rem.air');
  resumed.ev('restoreBunkerRun()');
  eq(resumed.ev('rem.air'), once, 'a second resume must not charge the same absence');
  assert(Math.abs(12345-once-21) < 0.01, 'one minute away charges 21 life-support seconds');
});

test('a weak POWER state uses real seconds to trigger emergency resume', async () => {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    FUSE.air.lit=3; FUSE.power.lit=0; reconcileAll(); rem.air=100;
    bunkerUnlocked=true; saveBunkerState();
  `);
  const resumed = makeHarness({ ...h.storage });
  resumed.ev('resumeRun()');
  for (let i=0; i<100; i++) await Promise.resolve();
  eq(resumed.ev('mode'), 'fuse', '20 real seconds at POWER x5 must take the emergency path');
  eq(resumed.ev('busy'), false, 'emergency command input must be ready without animated reports');
});

test('partial-capacity round trips preserve depleted reserves in every lethal system', () => {
  for (const key of ['air', 'water', 'thermal']) {
    for (let tier=0; tier<3; tier++) {
      const h = makeHarness();
      h.ev(`
        FUSE.${key}.lit=${tier}; reconcileAll();
        rem.${key}=CLOCK_MIN.${key}[${tier}]*0.27;
      `);
      const before = h.ev(`rem.${key}`);
      h.ev(`FUSE.${key}.lit=${tier+1}; reconcileClock("${key}");
            FUSE.${key}.lit=${tier}; reconcileClock("${key}");`);
      assert(Math.abs(h.ev(`rem.${key}`)-before) < 0.00001,
        `${key} ${tier}->${tier+1}->${tier} must preserve its reserve`);
    }
  }
});

test('invalid elapsed-time inputs cannot mutate or hang the engine', () => {
  const h = makeHarness();
  armedLiveRun(h);
  const before = snapshot(h);
  h.ev('advanceBy(Infinity,false); advanceBy(NaN,false); advanceBy(-1,false);');
  eq(JSON.stringify(snapshot(h)), JSON.stringify(before), 'invalid elapsed input must be a no-op');
});

test('disconnect after the assault preserves the run before any door is chosen', () => {
  const h = makeHarness();
  armedLiveRun(h);
  h.ev('bunkerLive=false; window.saDoorChosen=null; saveBunkerState();');
  const before = snapshot(h);
  h.ev('close()');
  h.fire('pagehide');
  const saved = JSON.parse(h.storage.SA_BUNKER_STATE_V1);
  eq(saved.rem.air, before.rem.air, 'pre-door disconnect must retain AIR reserve');
  eq(saved.base, before.base, 'pre-door disconnect must retain decay progress');
});

test('assassination clears an already-started bunker run immediately', () => {
  const h = makeHarness();
  armedLiveRun(h);
  h.ev('saveBunkerState(); huntArmed=true; huntResolved=false; assassinationDeath();');
  h.fire('pagehide');
  assert(!h.storage.SA_BUNKER_STATE_V1, 'assassinated run must never be resumable');
  eq(h.ev('deadRun'), true, 'assassination latches death');
  eq(h.ev('clocksArmed'), false, 'assassination stops the survival engine');
});

test('password lockout clears the save before the death animation', () => {
  const h = makeHarness();
  armedLiveRun(h);
  h.ev('saveBunkerState(); fails=3; denied();');
  h.fire('beforeunload');
  assert(!h.storage.SA_BUNKER_STATE_V1, 'lockout must not be undone by reloading mid-animation');
  eq(h.ev('deadRun'), true, 'password lockout latches death');
});

test('short offline reports display seconds instead of zero minutes', () => {
  const h = makeHarness();
  eq(h.ev('fmtAway(21)'), '21s', 'short drift must be visible');
});

test('public hosts do not expose local terminal inspection hooks', () => {
  const h = makeHarness(); // example.test, not localhost
  eq(h.ev('typeof window.__saFuse'), 'undefined', 'mutable inspection hook is local-only');
  eq(h.ev('typeof window.render_game_to_text'), 'undefined', 'QA text hook is local-only');
});

// ---------- FULL_CAPACITY_REFILL_V1 -------------------------------------

function fullAirAt(fraction) {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=true; bunkerLive=true;
    BASELINE_SECS=0; FUSE.air.lit=3; reconcileAll(); rem.air=CLOCK_MIN.air[3]*${fraction};
    FUSE.air.lit=4; reconcileClock("air");
  `);
  return h;
}

test('a full system refills its reserve gradually over 24 hours', () => {
  const h = fullAirAt(0.25);
  h.ev('advanceBy(12*3600, false, 12*3600)');
  assert(Math.abs(h.ev('reserve.air') - 0.75) < 1e-9, `12h at 4/4 refills half an empty reserve, got ${h.ev('reserve.air')}`);
  h.ev('FUSE.air.lit=3; reconcileClock("air")');
  assert(Math.abs(h.ev('rem.air') - 0.75 * h.ev('CLOCK_MIN.air[3]')) < 1e-6, 'a later loss starts from the refilled reserve');
});

test('refill stops at a full reserve', () => {
  const h = fullAirAt(0.1);
  h.ev('advanceBy(30*3600, false, 30*3600)');
  eq(h.ev('reserve.air'), 1, 'reserve is capped at full');
  h.ev('FUSE.air.lit=3; reconcileClock("air")');
  eq(h.ev('rem.air'), h.ev('CLOCK_MIN.air[3]'), 'a full reserve gives the full 3/4 budget');
});

test('refill uses wall time offline, not the life-support rest rate', () => {
  const h = fullAirAt(0.4);
  h.ev('saveBunkerState()');
  h.advance(6 * 3600 * 1000);
  h.ev('restoreBunkerRun()');
  assert(Math.abs(h.ev('reserve.air') - 0.65) < 1e-9, `6h away refills a quarter of the reserve, got ${h.ev('reserve.air')}`);
});

test('legacy saves without reserve data load as full', () => {
  const h = fullAirAt(0.2);
  h.ev('saveBunkerState()');
  const s = JSON.parse(h.storage.SA_BUNKER_STATE_V1); delete s.reserve;
  h.storage.SA_BUNKER_STATE_V1 = JSON.stringify(s);
  h.ev('restoreBunkerRun()');
  eq(h.ev('reserve.air'), 1, 'pre-refill saves keep the old full-capacity meaning');
});

test('the panel shows a refilling reserve at 4/4', () => {
  const h = fullAirAt(0.5);
  const cell = h.ev('commsCell("air")');
  assert(/full in 12h 0m/.test(cell), `refilling AIR shows time to full, got ${cell}`);
  assert(cell.startsWith('\u2588\u2588\u2588\u2591\u2591\u2591'), `bar shows the reserve, got ${cell}`);
  h.ev('reserve.air=1');
  assert(/\u221e/.test(h.ev('commsCell("air")')), 'a full reserve shows the unlimited marker');
});

test('a new run starts with full reserves', () => {
  const h = fullAirAt(0.3);
  h.ev('disarmClocks()');
  eq(h.ev('reserve.air'), 1, 'reserves reset with the run');
});

// ---------- SINGLE_PLAYER_FREEZE_V1 -------------------------------------

function runningRun() {
  const h = makeHarness();
  h.ev(`
    openingApplied=true; termActive=false; bunkerLive=true;
    BASELINE_SECS=0; FUSE.air.lit=1; reconcileAll(); rem.air=3000;
    armClocks();
  `);
  return h;
}

test('choosing Single Player freezes life support where it is', () => {
  const h = runningRun();
  h.advance(10 * 1000);
  eq(h.ev('freezeBunker()'), true, 'a live run freezes');
  const frozenAt = h.ev('rem.air');
  assert(Math.abs(frozenAt - 2990) < 1e-6, `live seconds up to the door are billed, got ${frozenAt}`);
  eq(h.ev('clockTick'), null, 'the live tick stops');
  h.advance(3600 * 1000);
  h.ev('clockStep()');
  eq(h.ev('rem.air'), frozenAt, 'no drain while frozen');
  eq(JSON.parse(h.storage.SA_BUNKER_STATE_V1).frozen, true, 'the save is marked frozen');
});

test('a frozen run is not charged for time away', () => {
  const h = runningRun();
  h.ev('freezeBunker()');
  const frozenAt = h.ev('rem.air');
  h.advance(10 * 3600 * 1000);
  const res = h.ev('restoreBunkerRun()');
  eq(res.frozen, true, 'restore reports the freeze');
  eq(res.eff, 0, 'no offline drift is applied');
  eq(h.ev('rem.air'), frozenAt, 'the countdown is exactly where it was frozen');
  eq(h.ev('bunkerFrozen'), false, 'returning to the bunker thaws it');
});

test('a thawed run drains normally again', () => {
  const h = runningRun();
  h.ev('freezeBunker()');
  h.advance(5000);
  h.ev('restoreBunkerRun(); saveBunkerState(); termActive=true; armClocks();');
  eq(h.ev('clocksArmed'), true, 'resuming re-arms the live tick');
  const before = h.ev('rem.air');
  h.advance(20 * 1000);
  h.ev('clockStep()');
  assert(Math.abs(before - h.ev('rem.air') - 20) < 1e-6, 'live drain resumes after the freeze');
  eq(JSON.parse(h.storage.SA_BUNKER_STATE_V1).frozen, false, 'the thawed save is no longer frozen');
});

test('assassins cannot follow the player into Single Player', () => {
  const h = makeHarness();
  h.ev('termActive=true; huntResolved=false; huntArmed=false; armHunt(); termActive=false; bunkerLive=true;');
  eq(h.ev('huntArmed'), true, 'hunt armed on the doors');
  h.ev('freezeBunker()');
  eq(h.ev('huntArmed'), false, 'leaving for Single Player disarms the hunt');
  eq(h.ev('huntTimeout'), null, 'no assassination is scheduled');
});

test('a malformed frozen flag cannot suppress offline drain', () => {
  const h = runningRun();
  h.ev('saveBunkerState()');
  const s = JSON.parse(h.storage.SA_BUNKER_STATE_V1); s.frozen = 'false';
  h.storage.SA_BUNKER_STATE_V1 = JSON.stringify(s);
  h.advance(3600 * 1000);
  const res = h.ev('restoreBunkerRun()');
  eq(res.frozen, false, 'only a boolean true freezes the bunker');
  assert(res.eff > 0, 'the hour away is billed normally');
});

test('opening a prompt re-scrolls so the last menu lines stay visible', () => {
  const body = HTML.slice(HTML.indexOf('function askInput(promptSym, opts){'));
  const fn = body.slice(0, body.indexOf('function hideInput'));
  assert(fn.indexOf('scrollEnd()') > fn.indexOf('form.style.display="flex"'), 'askInput must scroll after showing the prompt');
});

test('freezing before the run has started writes no save', () => {
  const h = makeHarness();
  h.ev('freezeBunker()');
  assert(!h.storage.SA_BUNKER_STATE_V1, 'nothing to persist yet');
});

test('the Single Player door freezes the bunker before opening the nations', () => {
  const door = HTML.slice(HTML.indexOf('if(single) single.addEventListener("click"'));
  const handler = door.slice(0, door.indexOf('});') + 3);
  assert(handler.indexOf('saFreezeBunker') > 0 && handler.indexOf('saFreezeBunker') < handler.indexOf('saOpenNationSelect'),
    'the door must freeze the bunker first');
});

// ---------- FAIR_HUNT_CLOCK_V1 + TERMINAL_PACING_V1 ----------------------

function armedHunt() {
  const h = makeHarness();
  h.ev('termActive=true; huntResolved=false; huntArmed=false; armHunt();');
  return h;
}

test('printing time is not charged to the hostile clock', () => {
  const h = armedHunt();
  h.advance(10 * 1000);
  h.ev('typingBegin()');
  h.advance(20 * 1000);
  eq(h.ev('huntRemain()'), 80, 'time spent printing is frozen');
  h.ev('typingEnd()');
  h.advance(5 * 1000);
  eq(h.ev('huntRemain()'), 75, 'only the 15 player seconds count');
});

test('the assassination waits for credited printing time', () => {
  const h = armedHunt();
  h.ev('typingBegin()'); h.advance(20 * 1000); h.ev('typingEnd()');
  h.advance(70 * 1000);           // 90s of wall time, but only 70s of player time
  const id = h.ev('huntTimeout');
  h.tasks.get(id).f();            // the original 90s timer fires
  eq(h.ev('huntResolved'), false, 'no assassination yet');
  eq(h.ev('huntArmed'), true, 'hunt still running');
  h.advance(20 * 1000);
  h.tasks.get(h.ev('huntTimeout')).f();
  eq(h.ev('huntResolved'), true, 'assassination at 90 player seconds');
});

test('GUARDS works for a player who reaches it within 30 player seconds', () => {
  const h = armedHunt();
  h.ev('typingBegin()'); h.advance(40 * 1000); h.ev('typingEnd()');
  h.advance(29 * 1000);
  assert(h.ev('huntRemain()') >= 60, 'GUARDS window still open after 40s of printing');
});

test('text prints twice as fast with a readable floor', () => {
  const h = makeHarness();
  eq(h.ev('TYPE_SCALE'), 0.5, 'half the previous duration');
  eq(h.ev('TYPE_FLOOR'), 8, '8ms per character minimum');
});

test('a skip finishes printing instantly and ends at the next prompt', async () => {
  const h = makeHarness();
  h.ev('skipTyping=true; window.__done=false; typeLine("A long line of terminal text", {speed:45}).then(function(){ window.__done=true; });');
  await Promise.resolve(); await Promise.resolve();
  eq(h.ev('window.__done'), true, 'skipped text resolves without waiting for timers');
  h.ev('askInput("SELECT [1-6] >", {mode:"hub"})');
  eq(h.ev('skipTyping'), false, 'the skip ends when the player is asked for input');
});

// ---------- summary -----------------------------------------------------

(async () => {
  await Promise.all(_pending);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passing`);
  if (failed.length) process.exit(1);
})();
