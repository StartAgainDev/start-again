'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '..', 'presidential_command.html'), 'utf8');
const match = html.match(/\/\* BATTLE_MESSAGE_SAFETY_START \*\/([\s\S]*?)\/\* BATTLE_MESSAGE_SAFETY_END \*\//);
assert.ok(match, 'Production message guards must exist');
const api = vm.createContext({});
vm.runInContext(match[1], api);
const game = {}, parent = {}, self = {}, stranger = {};
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log(`[PASS] ${name}`);
}
const trusted = (source, origin, parentOrigin='https://start-again.pplx.app') =>
  api.trustedBattleSender({source, origin}, game, parent, self, 'https://start-again.pplx.app', parentOrigin);
const record = {type:'START_AGAIN_RESULT', result:'win', battleId:'current', ts:101};

test('winner markup is escaped and non-string values are ignored', () => {
  const escaped = api.escapeBattleWinner('<img src=x onerror="alert(1)"> & \'test\'');
  assert.ok(!escaped.includes('<'));
  assert.ok(escaped.includes('&lt;img'));
  assert.ok(escaped.includes('&quot;'));
  assert.ok(escaped.includes('&#39;'));
  assert.equal(api.escapeBattleWinner({html:'bad'}), '');
});
test('oversized winner labels are bounded', () => {
  assert.equal(api.escapeBattleWinner('x'.repeat(10000)).length, 160);
});
test('only the expected popup with an allowed origin is trusted', () => {
  assert.equal(trusted(game, 'https://start-again.pplx.app'), true);
  assert.equal(trusted(game, 'https://attacker.example'), false);
  assert.equal(trusted(stranger, 'https://start-again.pplx.app'), false);
});
test('opaque-origin compatibility never grants trust to an unknown window', () => {
  assert.equal(trusted(game, 'null'), true);
  assert.equal(trusted(parent, 'null'), true);
  assert.equal(trusted(stranger, 'null'), false);
  assert.equal(trusted(null, 'null'), false);
});
test('direct parent relay checks its expected origin', () => {
  assert.equal(trusted(parent, 'https://preview.example', 'https://preview.example'), true);
  assert.equal(trusted(parent, 'https://attacker.example'), false);
});
test('fresh results are correlated with the currently launched battle', () => {
  assert.equal(api.currentBattleResult(record, 'current', 100), true);
  assert.equal(api.currentBattleResult({...record,battleId:'old'}, 'current', 100), false);
  assert.equal(api.currentBattleResult({...record,ts:99}, 'current', 100), false);
  assert.equal(api.currentBattleResult(record, '', 100), false);
});
test('malformed timestamps and results are rejected', () => {
  for (const ts of [NaN, Infinity, '101', null]) {
    assert.equal(api.currentBattleResult({...record,ts}, 'current', 100), false);
  }
  assert.equal(api.currentBattleResult({...record,result:'other'}, 'current', 100), false);
});
test('game reporting and parent relay both carry battle correlation', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(index.includes("new URLSearchParams(window.location.search).get('battleId')"));
  assert.ok(index.includes('battleId:rec.battleId, ts:rec.ts'));
  assert.ok(index.includes('ev.source!==commandFrame.contentWindow'));
});
console.log(`\n${checks}/${checks} passing`);
