'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
let scripts = 0;
for (const file of ['index.html', 'presidential_command.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!match[2].trim() || /type\s*=\s*["'](?:application\/ld\+json|importmap)/i.test(match[1])) continue;
    new vm.Script(match[2], { filename: `${file}:inline-${++scripts}` });
  }
}
console.log(`[PASS] ${scripts} inline scripts parse in both game entry points`);

const suites = ['bunker_integrity.cjs', 'battle_result_security.cjs', 'command_panel_loader.cjs', 'local_economy_v1.cjs', 'home_node_v1.cjs'];
let ran = 0;
for (const suite of suites) {
  const file = path.join(__dirname, suite);
  if (!fs.existsSync(file)) continue; // An isolated hotfix intentionally excludes later features.
  ran++;
  const result = spawnSync(process.execPath, [file], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!ran) throw new Error('No regression suites found');
console.log(`\nRelease checks passed: ${ran} suite(s), ${scripts} inline scripts.`);
