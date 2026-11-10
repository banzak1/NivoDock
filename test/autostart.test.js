const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createAutostart } = require('../autostart');

test('startup toggles NivoDock entries and removes duplicates without touching other programs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nivodock-startup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const startup = path.join(root, 'Startup');
  fs.mkdirSync(startup);
  const exe = 'C:\\Usuário\\Games With Spaces\\NivoDock.exe';
  const service = createAutostart(startup, exe);
  for (const entry of ['NivoDock.bat', 'NivoDock.lnk']) {
    fs.writeFileSync(path.join(startup, entry), 'startup');
    assert.equal(service.enabled(), true);
    assert.equal(service.toggle(), false);
    assert.equal(fs.existsSync(path.join(startup, entry)), false);
  }
  fs.writeFileSync(path.join(startup, 'AnotherApp.lnk'), 'other');
  assert.equal(service.toggle(), true);
  assert.equal(fs.readFileSync(path.join(startup, 'NivoDock.bat'), 'utf8'), `@echo off\r\nchcp 65001 >nul\r\nstart "" "${exe}"\r\n`);
  fs.writeFileSync(path.join(startup, 'NivoDock.lnk'), 'duplicate');
  assert.equal(service.toggle(), false);
  assert.deepEqual(fs.readdirSync(startup), ['AnotherApp.lnk']);
});
