// Bank board and tap-to-choose, v1 (2026-11-08).
//
// The user asked for a Bank that is friendly to use with a mouse or a finger, built the way
// AdVenture Capitalist / AdVenture Communist work. These checks lock in, using the real
// terminal code from index.html in a mocked browser:
//   - TAP_ANY_LINE_V1: the options a prompt lists become buttons; a tap is the same as typing
//     the key and pressing Enter; older screens stay plain text; a tap that began while text
//     was printing, or straight after a new prompt appeared, does nothing
//   - MARKETS_BOARD_V1: one Bank screen with every market and live earnings, COLLECT (which
//     still asks REINVEST or PAY OUT), COLLECT ALL, the invest toggle, BUY FUSE and fit-now
//   - RETURN_QUICK_ACTIONS_V1: after the return report, one tap to the Bank or FUSE PANEL
//   - LIVE_MARKETS_V1: earnings count up in real time, a meter and countdown run to the next
//     fuse, a live soonest-failure line; a collect pays exactly what the board shows
//   - RESUME_ALWAYS_TICKS_V1: a reload with every system full keeps the live tick running
//   - no tap, repeat or screen change ever adds clock time
// The invest toggle steps and the double-tap guard come from the settings block; they are
// UI proposals, not balance numbers.
//
// RUN: node tests/bank_board_v1.cjs

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

// ---------- TAP_ANY_LINE_V1 ---------------------------------------------------
test('the keys a prompt lists are the ones that become buttons', () => {
  const h = makeHarness();
  const keys = s => h.ev(`promptKeys(${JSON.stringify(s)}).join(",")`);
  eq(keys('MARKET [C / R / Y / I / B] >'), 'C,R,Y,I,B', 'market keys');
  eq(keys('SELECT [1-6] >'), '1,2,3,4,5,6', 'a range');
  eq(keys('FIT INTO [1-6] (X=cancel) >'), '1,2,3,4,5,6,X', 'a range plus the (X=) cancel');
  eq(keys('BANK [1-5 / A / F / V / S / L / B] >'), '1,2,3,4,5,A,F,V,S,L,B', 'the board prompt');
  eq(keys('INVEST USD > '), '', 'a typed amount has no buttons');
  eq(h.ev('choiceKeys("SELECT [1-6] >").indexOf("S") >= 0'), true, 'the hub adds [S] SOUND');
  eq(h.ev('choiceKeys("FUSE PANEL [M / I / C / B] >").indexOf("T")'), -1, 'no dev time-skip button on the live site');
  const t = makeHarness({}, { host: HOSTS.test });
  eq(t.ev('choiceKeys("FUSE PANEL [M / I / C / B] >").indexOf("T") >= 0'), true, 'test builds add [T] DEV TIME-SKIP');
});

test('the market screen options become buttons, newest copy only, and go plain when the prompt hides', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('mSel = "USA"; busy = true; marketDetail();');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  eq(clickKeys(h).sort().join(','), 'B,C,I,R,Y', 'C, R, Y, I and B are buttons, nothing else');
  // a newer line with the same key takes over; the older one goes back to text
  h.ev('addLine("saTerm-menukey").innerHTML = "  [C] NEWER COPY"; askInput(MARKET_PROMPT, {mode:"market", maxlength:2});');
  const cs = JSON.parse(h.ev('JSON.stringify(screen.children.filter(function(c){ return c.getAttribute("data-k")==="C"; }).map(function(c){ return c.innerHTML; }))'));
  eq(JSON.stringify(cs), JSON.stringify(['  [C] NEWER COPY']), 'only the newest [C] line is a button');
  h.ev('hideInput()');
  eq(clickKeys(h).length, 0, 'no line is clickable without a prompt');
  eq(h.ev('activeChoiceEls.length'), 0, 'nothing is left tracked');
});

test('several options on one line become one button each', () => {
  const h = makeHarness();
  h.ev('clearScreen(); addLine("saTerm-menukey").innerHTML = "  [M] MOVE  [I] FIT A SPARE  [C] AIM SENSORS  [B] BACK"; askInput(FUSE_PROMPT, {mode:"fuse", maxlength:2});');
  const html = h.ev('screen.children[0].innerHTML');
  for (const k of ['M', 'I', 'C', 'B']) assert(html.includes(`<span class="saTerm-click" data-k="${k}" role="button">[${k}]`), `[${k}] is its own button: ${html}`);
  assert(html.includes('[M] MOVE</span>  <span'), 'the gap between options is not part of a button: ' + html);
});

test('a tap is the same as typing the key and pressing Enter', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 100; ECON.marketById("USA").earned = 5;');
  h.ev('mSel = "USA"; busy = true; marketDetail();');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  settle(h);
  tapKey(h, 'C');
  await pump(h, () => mode(h) === 'marketCollect');
  eq(mode(h), 'marketCollect', 'tapping [C] asks REINVEST or PAY OUT, exactly like typing C');
});

test('a tap only counts once the prompt is up and settled', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('window.__held = 0; hold().then(function(){ window.__held = 1; });');
  tapEl(h, 'screen');
  await flush();
  eq(h.ev('window.__held'), 0, 'a tap straight after the prompt appears is ignored (double-tap guard)');
  settle(h);
  h.ev('busy = true; onScreenDown(); busy = false; onScreenClick({target: screen, detail: 1, preventDefault: function(){}})');
  await flush();
  eq(h.ev('window.__held'), 0, 'a tap that began while text was printing does not continue');
  settle(h);
  tapEl(h, 'screen');
  await flush();
  eq(h.ev('window.__held'), 1, 'a settled tap anywhere continues');
});

// ---------- MARKETS_BOARD_V1 --------------------------------------------------
test('the Bank opens on one board: every market, prices, COLLECT ALL and the invest toggle', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('openBoard()');
  eq(mode(h), 'board', 'board prompt is up');
  eq(h.ev('promptEl.textContent'), 'BANK [1-5 / A / F / V / S / L / B] >', 'the keyboard still works');
  const html = boardHtml(h);
  ['El Salvador', 'Saudi Arabia', 'United States', 'India', 'Gears Corp'].forEach((name, i) =>
    assert(html.includes(`[${i + 1}] ${name}`), `market row ${name}`));
  for (const act of ['collect', 'invest', 'buy']) eq((html.match(new RegExp(`data-act="${act}"`, 'g')) || []).length, 5, `a ${act} button on every market`);
  assert(html.includes('data-act="collectAll"'), 'COLLECT ALL');
  assert(/class="saB-btn on" data-act="step" data-v="0">25%</.test(html), 'the toggle starts on 25%');
  assert(html.includes('>50%<') && html.includes('>ALL<'), 'and offers 50% and ALL');
  assert(html.includes('BUY FUSE ' + fmt(h, 'ECON.quote("USA").price')), 'the live price is on the button');
  eq(h.lines().length, 1, 'one screen, nothing stacked under it');
});

test('the invest toggle sets how much each INVEST moves, and it stays invested', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.wallet.USD = 200; openBoard();');
  h.ev('boardAct("step", "1")');
  let html = boardHtml(h);
  assert(/class="saB-btn on" data-act="step" data-v="1">50%</.test(html), '50% is on');
  assert(html.includes(`data-act="invest" data-v="USA">INVEST ${fmt(h, 100)}<`), 'INVEST shows half the USD wallet');
  const msg = h.ev('boardAct("invest", "USA")');
  near(wallet(h).USD, 100, 'half the wallet moved');
  near(market(h, 'USA').position, 100, 'into the market');
  assert(msg.startsWith(`Invested ${fmt(h, 100)} USD.`) && msg.includes('It stays invested'), msg);
  eq(JSON.parse(h.storage.SA_ECON_STATE_V1).markets.find(m => m.id === 'USA').position, 100, 'saved straight away');
  h.ev('boardAct("step", "2")');
  h.ev('boardAct("invest", "USA")');
  near(wallet(h).USD, 0, 'ALL moves the rest');
  assert(h.ev('boardAct("invest", "USA")').startsWith('No USD in your wallet'), 'an empty wallet says so');
  h.ev('boardAct("step", "9")');
  eq(h.ev('board.step'), 2, 'an unknown step is ignored');
});

test('COLLECT asks REINVEST or PAY OUT in place, and PAY OUT keeps the invested amount', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 100; ECON.marketById("USA").earned = 22; ECON.wallet.USD = 0; openBoard();');
  h.ev('boardAct("collect", "USA")');
  eq(mode(h), 'boardAsk', 'it asks first (the 27 July rule)');
  const html = boardHtml(h);
  assert(html.includes('[R] REINVEST ' + fmt(h, 22)) && html.includes('[P] PAY OUT ' + fmt(h, 22)), 'both choices, on the market row');
  const msg = h.ev('boardAct("payout", "USA")');
  near(wallet(h).USD, 22, 'earnings to the wallet');
  near(market(h, 'USA').position, 100, 'the invested amount stays in');
  assert(msg.startsWith('Paid out'), msg);
  eq(mode(h), 'board', 'back on the board');
  eq(h.lines().length, 1, 'still one screen');
  h.ev('ECON.marketById("USA").earned = 10; boardAct("collect", "USA"); onBoardAsk("R");');
  near(market(h, 'USA').position, 110, 'typed R reinvests, so it earns too');
  const none = h.ev('boardAct("collect", "USA")');
  assert(none.startsWith('Nothing ready yet'), none);
  eq(mode(h), 'board', 'no question when nothing is ready');
});

test('COLLECT ALL asks once for every market', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev(`ECON.wallet.USD = 0; ECON.wallet.XRP = 0;
        ECON.marketById("USA").position = 100; ECON.marketById("USA").earned = 10;
        ECON.marketById("SAUDI").position = 100; ECON.marketById("SAUDI").earned = 5; openBoard();`);
  assert(boardHtml(h).includes('[A] COLLECT ALL \u00b7 2 ready'), 'it counts the markets ready');
  h.ev('boardAct("collectAll")');
  eq(mode(h), 'boardAll', 'one question for all of them');
  const html = boardHtml(h);
  assert(html.includes('[R] REINVEST ALL') && html.includes('[P] PAY OUT ALL'), 'both choices');
  const msg = h.ev('boardAct("payoutAll")');
  near(wallet(h).USD, 10, 'USD paid out');
  near(wallet(h).XRP, 5, 'XRP paid out');
  near(market(h, 'USA').position, 100, 'invested amounts stay in');
  assert(msg.startsWith('Paid out') && msg.includes('USD') && msg.includes('XRP'), msg);
  h.ev('ECON.marketById("USA").earned = 4; onBoard("A");');
  eq(mode(h), 'boardAll', 'typed A asks too');
  h.ev('onBoardAll("R")');
  near(market(h, 'USA').position, 104, 'typed R reinvests them all');
  eq(h.ev('boardAct("collectAll")'), 'Nothing ready to collect yet.', 'nothing ready, no question');
});

test('BUY FUSE offers to fit it straight away, and one fuse fits once', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 3, thermal: 4, comms: 4 });
  h.ev('ECON.wallet.USD = 1000; openBoard();');
  const price = h.ev('ECON.quote("USA").price');
  h.ev('boardAct("buy", "USA")');
  eq(mode(h), 'boardFit', 'the fit picker opens');
  eq(ledger(h).heldByPlayer, 1, 'one fuse held');
  near(wallet(h).USD, 1000 - price, 'paid the quoted price');
  let html = boardHtml(h);
  assert(html.includes(`Bought 1 fuse for ${fmt(h, price)} USD. Fit it now?`), 'says what was bought');
  assert(html.includes('[2] AIR  3/4 \u2192 4/4'), 'AIR shows what a fit does');
  assert(html.includes('[1] DEFENSE  4/4 \u00b7 full'), 'a full system says so');
  const msg = h.ev('boardAct("fit", "air")');
  eq(h.ev('FUSE.air.lit'), 4, 'AIR back to 4/4');
  eq(ledger(h).heldByPlayer, 0, 'the fuse is used up');
  assert(msg.startsWith('Fitted into AIR: 3/4 \u2192 4/4'), msg);
  eq(mode(h), 'board', 'back on the board');
  assert(balanced(ledger(h)), 'the fuse ledger balances');
  // Hold a spare, buy another, fit one: a second tap on an old fit button must not fit the spare.
  h.ev('boardAct("buy", "USA"); boardAct("fitClose"); boardAct("buy", "USA");');
  eq(ledger(h).heldByPlayer, 2, 'two held');
  h.ev('FUSE.air.lit = 3; reconcileClock("air"); boardAct("fit", "air");');
  eq(ledger(h).heldByPlayer, 1, 'one fit spends one fuse');
  eq(h.ev('boardAct("fit", "water")'), null, 'a stale fit button does nothing once the picker closed');
  eq(h.ev('FUSE.water.lit'), 3, 'WATER untouched');
  eq(ledger(h).heldByPlayer, 1, 'the spare is still held');
  h.ev('boardAct("fitOpen"); onBoardFit("4");');
  eq(h.ev('FUSE.water.lit'), 4, 'typed 4 fits WATER');
  eq(ledger(h).heldByPlayer, 0, 'one fuse, one fit');
});

test('KEEP AS SPARE keeps the fuse for later', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 });
  h.ev('ECON.wallet.USD = 1000; openBoard(); boardAct("buy", "USA");');
  const msg = h.ev('boardAct("fitClose")');
  eq(msg, 'Kept as a spare. Fit it from here or with [I] on the FUSE PANEL.', msg);
  eq(ledger(h).heldByPlayer, 1, 'still held');
  eq(h.ev('FUSE.air.lit'), 3, 'nothing fitted');
  h.ev('boardAct("fitOpen")');
  eq(mode(h), 'boardFit', '[F] opens the picker again');
  assert(boardHtml(h).includes('Fit a fuse. You hold 1.'), 'it says how many are held');
  h.ev('onBoardFit("X")');
  eq(mode(h), 'board', 'X closes it');
  eq(ledger(h).heldByPlayer, 1, 'still held');
});

test('a fuse you cannot afford says what it costs; an empty stock says so', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.wallet.USD = 0; openBoard();');
  const msg = h.ev('boardAct("buy", "USA")');
  assert(msg.startsWith('A fuse here costs ' + fmt(h, 'ECON.quote("USA").price') + ' USD. You have 0.'), msg);
  eq(ledger(h).heldByPlayer, 0, 'nothing bought');
  eq(mode(h), 'board', 'still on the board');
  h.ev('ECON.inventory.availableStock = 0; ECON.wallet.USD = 100000;');
  eq(h.ev('boardAct("buy", "USA")'), 'No fuses left for sale.', 'empty stock');
});

test('taps, repeats and screen changes on the board never add clock time', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 2, power: 4, water: 3, thermal: 4, comms: 4 });
  const before = state(h);
  for (let i = 0; i < 20; i++) {
    h.ev(`openBoard(); boardAct("step", "1"); boardAct("collect", "USA"); boardAct("collectAll");
          boardAct("fitOpen"); boardAct("fitClose"); boardAct("fit", "air"); boardAct("invest", "USA");
          boardAct("tab", "M"); onBoard(""); onBoard("A"); onBoardAll("B"); onBoard("F"); onBoard("Q");`);
  }
  const after = state(h);
  eq(JSON.stringify(after.lit), JSON.stringify(before.lit), 'no fuse moved');
  near(after.rem.air, before.rem.air, 'AIR unchanged', 0);
  near(after.rem.water, before.rem.water, 'WATER unchanged', 0);
  eq(JSON.stringify(after.reserve), JSON.stringify(before.reserve), 'reserves unchanged');
  eq(after.inv.heldByPlayer, 0, 'no fuse appeared');
  assert(balanced(after.inv), 'the fuse ledger balances');
});

test('a double-tap cannot press the button that appears under the finger', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 100; ECON.marketById("USA").earned = 10; ECON.wallet.USD = 0; openBoard();');
  settle(h);
  tapEl(h, btn('collect', 'USA'));
  eq(mode(h), 'boardAsk', 'the first tap asks');
  h.advance(120);
  tapEl(h, btn('reinvest', 'USA'));
  eq(mode(h), 'boardAsk', 'the second tap of a double-tap is ignored');
  near(market(h, 'USA').position, 100, 'nothing reinvested by accident');
  settle(h);
  tapEl(h, btn('payout', 'USA'));
  near(wallet(h).USD, 10, 'a deliberate tap works');
});

test('board buttons do nothing while text prints or away from the board', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 100; ECON.marketById("USA").earned = 10; openBoard(); busy = true;');
  h.ev(`boardClick(${btn('collectAll')})`);
  eq(h.ev('board.askAll'), false, 'ignored while busy');
  h.ev('busy = false; mode = "hub";');
  h.ev(`boardClick(${btn('collectAll')})`);
  eq(h.ev('board.askAll'), false, 'ignored outside a board prompt');
});

test('a market number opens its full screen on a clean screen; BACK returns to the board', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('openBoard(); onBoard("3");');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  eq(h.ev('mSel'), 'USA', 'market 3 is the United States');
  const lines = h.lines();
  assert(lines.some(l => l.includes('// UNITED STATES')), 'the full market screen');
  assert(!lines.some(l => l.includes('saB-')), 'the board is gone from the screen');
  eq(h.ev('board.open'), false, 'the board is closed');
  eq(h.ev('board.timer'), null, 'its live timer stopped');
  h.ev('onMarket("B")');
  eq(mode(h), 'board', 'B goes back to the board');
});

test('the hub [2] BANK and the ledger [M] both open the board; [L] reaches the ledger', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('busy = false; onHub("2");');
  await pump(h, () => mode(h) === 'board');
  eq(mode(h), 'board', 'hub [2] opens the board');
  h.ev('onBoard("L")');
  await pump(h, () => !h.ev('busy') && mode(h) === 'bank');
  eq(h.ev('promptEl.textContent'), 'BANK [V / M / B] >', 'the old-world ledger');
  h.ev('onBank("M")');
  await pump(h, () => mode(h) === 'board');
  eq(mode(h), 'board', 'ledger [M] opens the board');
});

test('the classic market screen redraws instead of stacking copies', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.wallet.USD = 1000; mSel = "USA"; busy = true; marketDetail();');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  for (let i = 0; i < 2; i++) {
    h.ev('onMarket("Y")');
    await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  }
  const lines = h.lines();
  eq(lines.filter(l => l.includes('// UNITED STATES')).length, 1, 'one copy of the market screen');
  assert(lines.at(-1).includes('Purchased 1 fuse for'), 'the last result shows under it: ' + lines.at(-1));
  eq(ledger(h).heldByPlayer, 2, 'two fuses bought');
});

test('INVEST on the full market screen offers quick amounts beside the input', async () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.wallet.USD = 200; mSel = "USA"; busy = true; marketDetail();');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  h.ev('onMarket("R")');
  await pump(h, () => !h.ev('busy') && mode(h) === 'marketReinvest');
  const chips = JSON.parse(h.ev('JSON.stringify(chipsEl.children.map(function(b){ return [b.textContent, b.getAttribute("data-v")]; }))'));
  eq(JSON.stringify(chips), JSON.stringify([['25%', '50'], ['50%', '100'], ['ALL', 'ALL']]), 'chips from the settings block');
  eq(h.ev('chipsEl.style.display'), 'inline-flex', 'shown');
  h.ev('submitKey("50")');
  await pump(h, () => !h.ev('busy') && mode(h) === 'market');
  near(market(h, 'USA').position, 50, 'the chip amount is invested');
  eq(h.ev('chipsEl.style.display'), 'none', 'the chips go with the prompt');
});

test('the board numbers update live while it is open, but never mid-tap', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 1000; openBoard();');
  const before = boardHtml(h);
  h.ev('ECON.accrue(86400); board.pressing = true; board.pressAt = Date.now(); boardTick();');
  eq(boardHtml(h), before, 'no redraw while a finger is down');
  h.advance(3500);
  h.ev('boardTick()');
  assert(boardHtml(h).includes('<b>220.00</b>'), 'a day of earnings shows (a stuck press frees itself)');
  h.ev('leaveBoard("B")');
  eq(h.ev('board.timer'), null, 'leaving the board stops its timer');
});

// ---------- LIVE_MARKETS_V1 ----------------------------------------------------
test('earnings count up between ticks, exactly as the next tick credits them', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 125; ECON.marketById("USA").earned = 0; lastTickTs = Date.now();');
  h.advance(400);
  const shown = h.ev('liveEarned(ECON.marketById("USA"))');
  near(shown, 125 * 0.22 * 0.4 / 86400, 'the counter moves before the tick', 1e-12);
  h.ev('clockStep()');
  near(h.ev('ECON.marketById("USA").earned'), shown, 'the tick credits exactly what was shown', 1e-12);
  h.advance(5000);
  near(h.ev('liveEarned(ECON.marketById("USA"))'), shown + 125 * 0.22 / 86400, 'never carried forward more than one second', 1e-12);
});

test('the counter shows the cents you can collect, then just enough finer digits', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  const parts = (pos, earned) => h.ev(`(function(){ var m=ECON.marketById("USA"); m.position=${pos}; m.earned=${earned}; lastTickTs=Date.now(); return JSON.stringify(readyParts(m)); })()`);
  eq(parts(125, 0.3841736), JSON.stringify({ bright: '0.38', dim: '41' }), '125 USD earns about 0.0003 a second: 4 places');
  eq(parts(100000, 1234.5678), JSON.stringify({ bright: '1,234.56', dim: '' }), 'a big stake moves the cents every second: no extra digits');
  eq(parts(0.01, 0.0000123), JSON.stringify({ bright: '0.00', dim: '0012' }), 'a tiny stake stops at LIVE_DECIMALS_MAX (6)');
  eq(parts(0, 0.5), JSON.stringify({ bright: '0.50', dim: '' }), 'nothing invested: just the cents');
});

test('a collect pays exactly what the board shows', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.wallet.USD = 0; ECON.marketById("USA").position = 1000; ECON.marketById("USA").earned = 0.0099; lastTickTs = Date.now(); openBoard();');
  h.advance(1000);
  eq(h.ev('readyParts(ECON.marketById("USA")).bright'), '0.01', 'the board shows a cent arriving between ticks');
  eq(h.ev('ECON.ready("USA")'), 0, 'not credited yet');
  h.ev('boardAct("collect", "USA")');
  eq(mode(h), 'boardAsk', 'COLLECT settles the time first, so that cent is there to collect');
  h.ev('boardAct("payout", "USA")');
  near(wallet(h).USD, 0.01, 'and it pays out', 1e-9);
});

test('the fuse meter and countdown: wallet plus earnings against the live price', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  const race = () => JSON.parse(h.ev('JSON.stringify(fuseRace(ECON.marketById("USA")))'));
  h.ev('ECON.wallet.USD = 25; ECON.marketById("USA").position = 125; ECON.marketById("USA").earned = 27.5; lastTickTs = Date.now();');
  const price = h.ev('ECON.quote("USA").price');
  const rc = race();
  eq(rc.state, 'eta', 'counting down');
  near(rc.frac, 52.5 / price, 'the meter is wallet plus earnings over the price');
  near(rc.secs, (price - 52.5) / (125 * 0.22 / 86400), 'the countdown is what is missing over the earning rate', 1e-6);
  eq(h.ev('raceText(fuseRace(ECON.marketById("USA")))'), h.ev(`fmtClock(${rc.secs})`), 'shown as a ticking clock');
  h.ev('ECON.collect("USA", "payout")');
  near(race().frac, rc.frac, 'paying out only changes pocket, so the meter stays put', 1e-9);
  h.ev('ECON.wallet.USD = 25; ECON.marketById("USA").position = 125; ECON.marketById("USA").earned = 27.5;');
  h.ev('ECON.collect("USA", "reinvest")');
  assert(race().secs > rc.secs, 'reinvesting puts the next fuse further off, while it all earns more: the real choice, shown');
});

test('READY, pay out first, SOLD OUT and invest to earn one', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  const race = () => h.ev('raceText(fuseRace(ECON.marketById("USA")))');
  const price = h.ev('ECON.quote("USA").price');
  h.ev(`ECON.wallet.USD = ${price}; ECON.marketById("USA").position = 0; ECON.marketById("USA").earned = 0; lastTickTs = Date.now();`);
  eq(race(), 'READY \u00b7 buy it now', 'the wallet covers a fuse');
  h.ev(`ECON.wallet.USD = ${price} - 1; ECON.marketById("USA").position = 10; ECON.marketById("USA").earned = 2;`);
  eq(race(), 'READY \u00b7 pay out first', 'wallet plus earnings cover it');
  h.ev('ECON.wallet.USD = 0; ECON.marketById("USA").position = 0; ECON.marketById("USA").earned = 0;');
  eq(race(), 'invest to earn one', 'nothing invested and nothing in the wallet');
  h.ev('ECON.inventory.availableStock = 0;');
  eq(race(), 'SOLD OUT', 'no fuses left for sale');
});

test('the countdown reads like a clock', () => {
  const h = makeHarness();
  const c = x => h.ev(`fmtClock(${x})`);
  eq(c(0), '00:00:00', 'zero');
  eq(c(0.2), '00:00:01', 'part of a second rounds up, so it never shows 0 too early');
  eq(c(59), '00:00:59', 'seconds');
  eq(c(3600), '01:00:00', 'an hour');
  eq(c(90061), '1d 01:01:01', 'past a day');
});

test('the board shows the soonest failure COMMS can see, counting down between ticks', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 });
  h.ev('lastTickTs = Date.now();');
  const left = h.ev('clockLeft("air")');
  eq(h.ev('failText()'), 'Soonest failure you can see: AIR\u00a0in\u00a0' + h.ev(`fmtClock(${left})`), 'AIR is watched ("AIR in 04:20:13" never splits across lines)');
  h.advance(600);
  near(h.ev('liveFailure().secs'), left - 0.6, 'it counts down between ticks', 1e-6);
  h.ev('commsWatch.air = false;');
  eq(h.ev('failText()'), '', 'no sensor on AIR, no countdown (COMMS only changes what you see)');
  h.ev('openBoard()');
  assert(boardHtml(h).includes('data-live="fail" style="display:none"'), 'the line is hidden');
});

test('nothing moves while the bunker is frozen', () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 });
  h.ev('ECON.marketById("USA").position = 1000; lastTickTs = Date.now(); freezeBunker();');
  const a = h.ev('JSON.stringify([readyParts(ECON.marketById("USA")), liveFailure()])');
  h.advance(900);
  eq(h.ev('JSON.stringify([readyParts(ECON.marketById("USA")), liveFailure()])'), a, 'frozen: the counter and the countdown stand still');
});

test('the board redraws only when more than the moving numbers change', () => {
  const h = makeHarness();
  liveRun(h, FULL);
  h.ev('ECON.marketById("USA").position = 125; ECON.marketById("USA").earned = 0.001; openBoard();');
  const last = h.ev('board.last');
  h.ev('ECON.accrue(10); boardTick();');
  eq(h.ev('board.last'), last, '10 s of earnings changes only the moving numbers: no redraw');
  h.ev('ECON.accrue(86400); boardTick();');
  assert(h.ev('board.last') !== last, 'a cent ready lights up COLLECT: that is a redraw');
});

// ---------- RESUME_ALWAYS_TICKS_V1 --------------------------------------------
test('a reload with every system full keeps the live tick running', () => {
  const h = makeHarness();
  liveRun(h, FULL, 'ECON.marketById("USA").position = 1000;');
  const b = makeHarness({ ...h.storage }, { now: h.now() + 60 * 1000 });
  b.ev('resumeRun()');
  eq(b.ev('clocksArmed'), true, 'the live tick runs after a reload, even with every system full');
  const e0 = b.ev('ECON.marketById("USA").earned'), w0 = b.ev('baselineAccum');
  b.advance(10 * 1000);
  b.ev('clockStep()');
  near(b.ev('ECON.marketById("USA").earned') - e0, 1000 * 0.22 * 10 / 86400, 'markets earn live', 1e-9);
  near(b.ev('baselineAccum') - w0, 10, 'wear-out runs live at full rate', 1e-6);
});

// ---------- RETURN_QUICK_ACTIONS_V1 -------------------------------------------
test('after the return report, one tap goes to the Bank or the FUSE PANEL', async () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0; bunkerUnlocked = true;');
  const back = async () => {
    const b = makeHarness({ ...h.storage }, { now: h.now() + 8 * HR * 1000 });
    b.ev('BASELINE_SECS = 0; resumeRun()');
    await pump(b, () => mode(b) === 'reportNext');
    return b;
  };
  let b = await back();
  const text = b.lines().join('\n');
  assert(text.includes('SESSION RESTORED'), 'the report');
  for (const l of ['[M] BANK', '[F] FUSE PANEL', '[H] HUB MENU']) assert(text.includes(l), l);
  eq(b.ev('promptEl.textContent'), 'NEXT [M / F / H] >', 'the prompt');
  eq(clickKeys(b).sort().join(','), 'F,H,M', 'all three are buttons');
  b.ev('onReportNext("M")');
  eq(mode(b), 'board', 'M opens the Bank board');
  b = await back();
  b.ev('onReportNext("F")');
  await pump(b, () => !b.ev('busy') && mode(b) === 'fuse');
  eq(mode(b), 'fuse', 'F opens the FUSE PANEL');
  b = await back();
  b.ev('onReportNext("")');
  await pump(b, () => !b.ev('busy') && mode(b) === 'hub');
  eq(mode(b), 'hub', 'Enter alone goes to the hub, as before');
  b = await back();
  b.ev('onReportNext("H")');
  await pump(b, () => !b.ev('busy') && mode(b) === 'hub');
  eq(mode(b), 'hub', 'H goes to the hub');
});

test('the FUSE PANEL shortcut keeps the bunker password gate', async () => {
  const h = makeHarness();
  liveRun(h, { defense: 4, air: 3, power: 4, water: 4, thermal: 4, comms: 4 }, 'BASELINE_SECS = 0; bunkerUnlocked = false;');
  const b = makeHarness({ ...h.storage }, { now: h.now() + 8 * HR * 1000 });
  b.ev('BASELINE_SECS = 0; resumeRun()');
  await pump(b, () => mode(b) === 'reportNext');
  b.ev('onReportNext("F")');
  await pump(b, () => !b.ev('busy') && mode(b) !== 'reportNext');
  assert(mode(b) !== 'fuse', 'a locked bunker does not skip the password: ' + mode(b));
  assert(b.lines().join('\n').includes('PASSWORD-PROTECTED'), 'it asks for the password');
});

Promise.all(pending).then(() => {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passing`);
  process.exit(pass === results.length ? 0 : 1);
});
