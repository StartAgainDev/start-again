// Local Economy v1 test suite.
//
// Locks in the shape of the earn -> buy -> replace-fuse loop that turns permanent
// fuse loss from a decline simulator into a real strategic game. Runs the terminal
// IIFE from index.html inside a Node VM with mocked DOM/clock/storage.
//
// Approved design references (user statements, dated in memory):
//   - shared finite fuse pool for whole bunker; buying/selling from main bunker
//     (25 Jul 2026, session 310546c6)
//   - five New Markets with fixed currencies (BTC/XRP/USD/ETH/GEARS) —
//     "the markets were the new income source we are done" (28 Jul 2026, 2a506c0d)
//   - vault reward is optional, password-gated, player-initiated, not automatic
//     (28 Jul 2026, 2a506c0d)
//   - bunker fuses are bought; Ring chips are conserved; no cross-tier resource flow
//     (docs/bunker-loss-condition.md 27-33)
//
// UNRESOLVED design questions carried over from the audit and NOT decided by this
// test suite (each is marked TODO in the tests below):
//   - first-investment source when the player skips every vault
//   - fuse lifecycle after a blown fuse (destroyed/repairable/returned to stock)
//   - exact numeric curves (base cost, growth rate, market yield, reinvest bonus)
// Tests use minimal placeholder values and check STRUCTURAL invariants only.
//
// Numeric constants that appear here MUST be treated as configuration knobs, not
// approved balance. They exist so the loop can be exercised end-to-end.
//
// RUN: node tests/local_economy_v1.cjs

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
        toggle: x => (s.has(x) ? s.delete(x) : s.add(x)),
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
    fireDoc: e => (docEv[e] || []).forEach(f => { try { f(); } catch(_){} }),
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

// ---------- structural: module surface -----------------------------------

test('economy module exposes the shared fuse ledger with the required fields', () => {
  const h = makeHarness();
  const inv = h.ev('typeof ECON === "object" && ECON.inventory ? JSON.parse(JSON.stringify(ECON.inventory)) : null');
  assert(inv, 'ECON.inventory must be defined');
  for (const k of ['totalSupply', 'availableStock', 'installed', 'heldByPlayer', 'destroyed']) {
    assert(k in inv, `ECON.inventory.${k} must exist`);
    assert(typeof inv[k] === 'number', `ECON.inventory.${k} must be a number`);
  }
  const sum = inv.availableStock + inv.installed + inv.heldByPlayer + inv.destroyed;
  eq(sum, inv.totalSupply, 'inventory must balance: available + installed + held + destroyed === totalSupply');
});

test('five New Markets exist with fixed currencies', () => {
  const h = makeHarness();
  const markets = h.ev('ECON.markets.map(function(m){ return {id:m.id, currency:m.currency}; })');
  const expected = [
    { id: 'ELSALVADOR', currency: 'BTC'   },
    { id: 'SAUDI',      currency: 'XRP'   },
    { id: 'USA',        currency: 'USD'   },
    { id: 'INDIA',      currency: 'ETH'   },
    { id: 'GEARS',      currency: 'GEARS' },
  ];
  eq(markets.length, 5, 'must be exactly five New Markets');
  for (const want of expected) {
    const got = markets.find(m => m.id === want.id);
    assert(got, `market ${want.id} must exist`);
    eq(got.currency, want.currency, `${want.id} currency`);
  }
});

test('player wallet starts empty and holds the five fixed currencies plus a placeholder seed', () => {
  const h = makeHarness();
  const w = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  for (const c of ['BTC', 'XRP', 'USD', 'ETH', 'GEARS']) {
    assert(c in w, `wallet.${c} must exist`);
    eq(typeof w[c], 'number', `wallet.${c} must be a number`);
  }
  // TODO(design): first-investment source is unresolved. For now a small labelled
  // starter grant lets the loop be exercised; a real seed must be an explicit
  // design decision, not a quietly-added freebie.
  assert(w.__starterGrant === true, 'wallet must carry the __starterGrant flag so it can be swapped for a real seed later');
});

// ---------- markets: invest and payout -----------------------------------

test('REINVEST spends the market currency and grows the market position', () => {
  const h = makeHarness();
  h.ev(`ECON.wallet.USD = 1000; ECON.wallet.__starterGrant = true;`);
  const before = h.ev('JSON.parse(JSON.stringify({usd: ECON.wallet.USD, pos: ECON.marketById("USA").position}))');
  const ok = h.ev('ECON.reinvest("USA", 400)');
  const after  = h.ev('JSON.parse(JSON.stringify({usd: ECON.wallet.USD, pos: ECON.marketById("USA").position}))');
  eq(ok, true, 'reinvest must succeed when funds are sufficient');
  eq(after.usd, before.usd - 400, 'USD wallet must debit by the reinvested amount');
  assert(after.pos > before.pos, `position must grow (before=${before.pos}, after=${after.pos})`);
});

test('REINVEST fails cleanly when the market currency balance is insufficient', () => {
  const h = makeHarness();
  h.ev(`ECON.wallet.USD = 100;`);
  const ok = h.ev('ECON.reinvest("USA", 500)');
  const usd = h.ev('ECON.wallet.USD');
  eq(ok, false, 'reinvest must return false on insufficient funds');
  eq(usd, 100, 'wallet must NOT be debited on a failed reinvest');
});

test('PAYOUT credits the market\'s fixed currency, never a different one', () => {
  const h = makeHarness();
  h.ev(`
    ECON.wallet.USD = 1000; ECON.reinvest("USA", 500);
    ECON.wallet.XRP = 0;
  `);
  const before = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  const paid = h.ev('ECON.payout("USA")');
  const after  = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  assert(paid > 0, 'payout must return a positive amount when a position exists');
  eq(after.USD, before.USD + paid, 'USA market must pay in USD');
  eq(after.XRP, before.XRP,        'USA market must NOT touch XRP');
  eq(after.BTC, before.BTC,        'USA market must NOT touch BTC');
});

test('payout with zero position is a no-op', () => {
  const h = makeHarness();
  const before = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  const paid = h.ev('ECON.payout("GEARS")');
  const after  = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  eq(paid, 0, 'payout on empty position returns 0');
  eq(JSON.stringify(after), JSON.stringify(before), 'wallet unchanged');
});

// ---------- vault seed: optional, one-time -------------------------------

test('vault seed claim requires the correct password and can only fire once per vault', () => {
  const h = makeHarness();
  const cur = h.ev('ECON.wallet.USD');
  const wrong = h.ev('ECON.claimVaultSeed("USA", "WRONG_PW")');
  const wrong2 = h.ev('ECON.wallet.USD');
  eq(wrong, false, 'wrong password must fail');
  eq(wrong2, cur,  'wrong password must NOT credit the wallet');

  // A vault's expected password is exposed for testing but must be player-solved in play.
  const pw = h.ev('ECON.vaultById("USA").password');
  assert(typeof pw === 'string' && pw.length > 0, 'each vault must define a password');
  const first  = h.ev(`ECON.claimVaultSeed("USA", ${JSON.stringify(pw)})`);
  const second = h.ev(`ECON.claimVaultSeed("USA", ${JSON.stringify(pw)})`);
  eq(first, true,  'correct password must succeed once');
  eq(second, false, 'a second claim on the same vault must fail (one-time bonus)');
  assert(h.ev('ECON.wallet.USD') > cur, 'wallet must be credited on the successful claim');
});

test('vault claim credits the vault\'s fixed currency only', () => {
  const h = makeHarness();
  const before = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  const pw = h.ev('ECON.vaultById("ELSALVADOR").password');
  h.ev(`ECON.claimVaultSeed("ELSALVADOR", ${JSON.stringify(pw)})`);
  const after = h.ev('JSON.parse(JSON.stringify(ECON.wallet))');
  assert(after.BTC > before.BTC, 'El Salvador vault must credit BTC');
  eq(after.USD, before.USD, 'El Salvador vault must NOT credit USD');
  eq(after.XRP, before.XRP, 'El Salvador vault must NOT credit XRP');
});

// ---------- vendor purchase: currency, debit, delivery -------------------

test('vendor quote uses the vendor\'s fixed currency', () => {
  const h = makeHarness();
  const q = h.ev('ECON.quote("USA")');
  eq(q.currency, 'USD', 'USA vendor must quote USD');
  assert(q.price > 0, 'quote must be a positive price');
});

test('purchase debits the correct currency and adds a spare fuse to heldByPlayer', () => {
  const h = makeHarness();
  h.ev(`ECON.wallet.USD = 100000;`);
  const beforeUsd = h.ev('ECON.wallet.USD');
  const beforeHeld = h.ev('ECON.inventory.heldByPlayer');
  const beforeStock = h.ev('ECON.inventory.availableStock');
  const q = h.ev('ECON.quote("USA")');
  const ok = h.ev('ECON.buyFuse("USA")');
  eq(ok, true, 'buyFuse must succeed with sufficient funds and stock');
  const afterUsd = h.ev('ECON.wallet.USD');
  const afterHeld = h.ev('ECON.inventory.heldByPlayer');
  const afterStock = h.ev('ECON.inventory.availableStock');
  eq(afterUsd,  beforeUsd - q.price, 'USD wallet debited by the quoted price');
  eq(afterHeld, beforeHeld + 1,      'one fuse now in heldByPlayer');
  eq(afterStock, beforeStock - 1,    'one fuse removed from availableStock');
});

test('purchase fails when availableStock is 0 (no fuse printer)', () => {
  const h = makeHarness();
  h.ev(`
    ECON.wallet.USD = 100000;
    ECON.inventory.availableStock = 0;
    ECON.inventory.installed = ECON.inventory.totalSupply; // simulate every fuse installed
  `);
  const usd = h.ev('ECON.wallet.USD');
  const ok = h.ev('ECON.buyFuse("USA")');
  eq(ok, false, 'buyFuse must refuse when availableStock is 0');
  eq(h.ev('ECON.wallet.USD'), usd, 'wallet must NOT be debited on a failed purchase');
});

test('purchase fails when wallet lacks the vendor\'s currency', () => {
  const h = makeHarness();
  h.ev(`ECON.wallet.USD = 10;`);
  const beforeStock = h.ev('ECON.inventory.availableStock');
  const beforeHeld = h.ev('ECON.inventory.heldByPlayer');
  const ok = h.ev('ECON.buyFuse("USA")');
  eq(ok, false, 'buyFuse must refuse when funds are insufficient');
  eq(h.ev('ECON.inventory.availableStock'), beforeStock, 'availableStock unchanged');
  eq(h.ev('ECON.inventory.heldByPlayer'),   beforeHeld,  'heldByPlayer unchanged');
});

// ---------- install: replace a fuse in the live grid ---------------------

test('installFuse consumes a held fuse and adds it to a chosen slot in the live grid', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    FUSE.air.lit = 2;   // AIR is down two fuses
    reconcileAll();
    ECON.inventory.heldByPlayer = 1;
    ECON.inventory.installed = 3;   // arbitrary sane start
  `);
  const beforeHeld = h.ev('ECON.inventory.heldByPlayer');
  const beforeInstalled = h.ev('ECON.inventory.installed');
  const beforeAir  = h.ev('FUSE.air.lit');
  const ok = h.ev('ECON.installFuse("air")');
  eq(ok, true, 'installFuse must succeed when a held fuse is available and the slot has room');
  eq(h.ev('ECON.inventory.heldByPlayer'), beforeHeld - 1, 'one fuse leaves heldByPlayer');
  eq(h.ev('ECON.inventory.installed'),    beforeInstalled + 1, 'one fuse enters installed');
  eq(h.ev('FUSE.air.lit'), beforeAir + 1, 'AIR gains one lit fuse');
});

test('installFuse refuses if the target system is already 4/4', () => {
  const h = makeHarness();
  h.ev(`
    FUSE.water.lit = 4; reconcileAll();
    ECON.inventory.heldByPlayer = 1;
  `);
  const ok = h.ev('ECON.installFuse("water")');
  eq(ok, false, 'installFuse must refuse when target is at max');
  eq(h.ev('ECON.inventory.heldByPlayer'), 1, 'heldByPlayer unchanged on refused install');
});

test('installFuse refuses if the player holds no spare fuse', () => {
  const h = makeHarness();
  h.ev(`
    FUSE.air.lit = 2; reconcileAll();
    ECON.inventory.heldByPlayer = 0;
  `);
  const ok = h.ev('ECON.installFuse("air")');
  eq(ok, false, 'installFuse must refuse when heldByPlayer is 0');
});

// ---------- persistence: round-trips across a fresh harness --------------

test('economy state persists across a save/reload cycle', () => {
  const h = makeHarness();
  h.ev(`
    openingApplied = true;
    ECON.wallet.USD = 500;
    ECON.reinvest("USA", 250);
    ECON.inventory.heldByPlayer = 2;
    ECON.inventory.availableStock -= 2;
    saveBunkerState();
  `);
  const snapshot = h.ev(`JSON.stringify({
    wallet: ECON.wallet,
    inv: ECON.inventory,
    pos: ECON.marketById("USA").position
  })`);

  const h2 = makeHarness({ ...h.storage });
  h2.ev('restoreBunkerRun()');
  const restored = h2.ev(`JSON.stringify({
    wallet: ECON.wallet,
    inv: ECON.inventory,
    pos: ECON.marketById("USA").position
  })`);
  eq(restored, snapshot, 'economy state must round-trip exactly through save/load');
});

// ---------- end-to-end loop: decay -> earn -> buy -> replace -------------

test('one full decay -> earn -> buy -> replace loop advances the game state coherently', () => {
  const h = makeHarness();
  // Setup: player is in a live run with a market position and some starter cash.
  h.ev(`
    openingApplied = true;
    termActive = true; bunkerLive = true;
    FUSE.air.lit = 3; reconcileAll();
    ECON.wallet.USD = 10000;
    ECON.reinvest("USA", 5000);
  `);
  // 1. Decay: baseline blow takes one AIR fuse.
  h.ev('baselineBlowOne();');
  const airAfterDecay = h.ev('FUSE.air.lit');
  assert(airAfterDecay <= 3, 'a baseline blow must not increase AIR');

  // 2. Earn: cash out the market position.
  const paidUsd = h.ev('ECON.payout("USA")');
  assert(paidUsd > 0, `payout must yield USD (got ${paidUsd})`);

  // 3. Buy: purchase a spare fuse.
  const q = h.ev('ECON.quote("USA")');
  h.ev(`ECON.wallet.USD = Math.max(ECON.wallet.USD, ${q.price});`); // ensure funds
  const bought = h.ev('ECON.buyFuse("USA")');
  eq(bought, true, 'buyFuse must succeed');

  // 4. Install: replace the fuse in AIR.
  const airBeforeInstall = h.ev('FUSE.air.lit');
  const installed = h.ev('ECON.installFuse("air")');
  eq(installed, true, 'installFuse must succeed');
  eq(h.ev('FUSE.air.lit'), airBeforeInstall + 1, 'AIR restored by one fuse');

  // 5. Global invariant: the shared inventory ledger still balances.
  const inv = h.ev('JSON.parse(JSON.stringify(ECON.inventory))');
  const sum = inv.availableStock + inv.installed + inv.heldByPlayer + inv.destroyed;
  eq(sum, inv.totalSupply, `inventory must balance after the full loop (sum=${sum}, total=${inv.totalSupply})`);
});

// ---------- boundary: no cross-tier resource flow ------------------------

test('economy module does not read or write Ring/district/chip state', () => {
  const h = makeHarness();
  // Load the terminal source and check the ECON module's function bodies for
  // forbidden identifiers. This is a static-string check; it catches accidental
  // additions during future work.
  const src = fs.readFileSync(INDEX, 'utf8');
  // Extract just the ECON block by markers. We enforce presence and cleanliness.
  // Match the whole /* LOCAL_ECONOMY_V1_START ... LOCAL_ECONOMY_V1_END ... */ block
  // (a multi-line block comment plus everything through the module's closing marker).
  const m = src.match(/\/\*\s*LOCAL_ECONOMY_V1_START[\s\S]*?LOCAL_ECONOMY_V1_END[\s\S]*?\*\//);
  assert(m, 'ECON module must be bounded by LOCAL_ECONOMY_V1_START / LOCAL_ECONOMY_V1_END markers');
  const body = m[0];
  // Strip the module's own doc comments so intentional references to forbidden words
  // in the header ("no Ring, district, biome, or chip identifier") don't trip the guard.
  // The guard is about identifiers in code, not prose in comments.
  const codeOnly = body
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/\/\/[^\n]*/g, '');       // line comments
  for (const forbidden of ['RING_ECON', 'TERRITORIES', 'biome', 'chip', 'district', '__reportBattleResult']) {
    assert(!codeOnly.match(new RegExp('\\b' + forbidden + '\\b')),
      `ECON module code must not reference '${forbidden}' (would break tier separation)`);
  }
});

// ---------- summary -----------------------------------------------------

(async () => {
  await Promise.all(_pending);
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passing`);
  if (failed.length) process.exit(1);
})();
