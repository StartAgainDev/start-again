'use strict';

// HOST_FRAME_POLICY_V1: the live host forbids framing any page by URL, so the game must
// render the Presidential Command panel through srcdoc. These checks pin that loader.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/\/\* COMMAND_PANEL_LOADER_START \*\/([\s\S]*?)\/\* COMMAND_PANEL_LOADER_END \*\//);
assert.ok(match, 'Command panel loader must exist');

function makeFrame() {
  const attrs = {};
  return {
    attrs,
    srcdoc: undefined,
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; if (k === 'srcdoc') this.srcdoc = undefined; },
  };
}
function harness({ protocol = 'https:', fetchImpl } = {}) {
  const calls = [];
  const ctx = vm.createContext({
    location: { protocol },
    fetch: fetchImpl === null ? undefined : (url, opts) => { calls.push({ url, opts }); return fetchImpl(url, opts); },
    Error,
  });
  vm.runInContext(match[1], ctx);
  return { load: ctx.saLoadCommandPanel, calls };
}
const ok = (body) => () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
const settle = () => new Promise((r) => setImmediate(r));

let checks = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('a fetched panel renders through srcdoc, never a framed URL', async () => {
  const h = harness({ fetchImpl: ok('<title>PANEL</title>') });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  await settle();
  assert.equal(frame.srcdoc, '<title>PANEL</title>');
  assert.equal(frame.getAttribute('src'), null);
  assert.equal(frame.getAttribute('data-command-src'), 'presidential_command.html');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].opts.credentials, 'same-origin');
});

test('a network failure falls back to loading by URL', async () => {
  const h = harness({ fetchImpl: () => Promise.reject(new Error('offline')) });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  await settle();
  assert.equal(frame.getAttribute('src'), 'presidential_command.html');
  assert.equal(frame.srcdoc, undefined);
});

test('an HTTP error falls back to loading by URL', async () => {
  const h = harness({ fetchImpl: () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('missing') }) });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  await settle();
  assert.equal(frame.getAttribute('src'), 'presidential_command.html');
  assert.equal(frame.srcdoc, undefined, 'an error page must never be rendered as the panel');
});

test('a game opened from disk loads by URL without fetching', async () => {
  const h = harness({ protocol: 'file:', fetchImpl: ok('unused') });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  await settle();
  assert.equal(h.calls.length, 0);
  assert.equal(frame.getAttribute('src'), 'presidential_command.html');
});

test('browsers without fetch load by URL', async () => {
  const h = harness({ fetchImpl: null });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  assert.equal(frame.getAttribute('src'), 'presidential_command.html');
});

test('re-entering command reuses the loaded panel', async () => {
  const h = harness({ fetchImpl: ok('<title>PANEL</title>') });
  const frame = makeFrame();
  h.load(frame, 'presidential_command.html');
  await settle();
  h.load(frame, 'presidential_command.html');
  await settle();
  assert.equal(h.calls.length, 1, 'the running panel (and its battle state) must not be reloaded');
});

test('a superseded panel response cannot replace the current panel', async () => {
  let releaseOld;
  const pending = new Promise((r) => { releaseOld = r; });
  const h = harness({
    fetchImpl: (url) => (url === 'old.html'
      ? pending.then(() => ({ ok: true, status: 200, text: () => Promise.resolve('OLD') }))
      : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('NEW') })),
  });
  const frame = makeFrame();
  h.load(frame, 'old.html');
  h.load(frame, 'new.html');
  await settle();
  releaseOld();
  await settle();
  assert.equal(frame.srcdoc, 'NEW');
  assert.equal(frame.getAttribute('data-command-src'), 'new.html');
});

test('the parent bridge recognises srcdoc-loaded command frames', () => {
  assert.ok(/getAttribute\("data-command-src"\) \|\| commandFrame\.getAttribute\("src"\)/.test(html),
    'advisor/battle intents must derive the expected origin from the logical panel URL');
  assert.ok(/!\(frame\.getAttribute\("data-command-src"\) \|\| frame\.getAttribute\("src"\)\)/.test(html),
    'the parent relay must forward results to a srcdoc-loaded panel');
  assert.ok(!/frame\.setAttribute\("src", src\); \}\s*\n\s*host\.classList/.test(html),
    'command entry must not load the panel by URL directly');
});

(async () => {
  for (const t of tests) {
    await t.fn();
    checks++;
    console.log(`[PASS] ${t.name}`);
  }
  console.log(`\n${checks}/${tests.length} passing`);
})().catch((e) => { console.error(e); process.exit(1); });
