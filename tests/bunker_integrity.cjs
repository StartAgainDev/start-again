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

// ---------- summary -----------------------------------------------------

(async () => {
  await Promise.all(_pending);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passing`);
  if (failed.length) process.exit(1);
})();
