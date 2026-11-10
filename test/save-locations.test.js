const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getSaveLocations, inferTitleId } = require('../save-locations');

test('save lookup uses the current user and the actual game ID instead of fixed slots', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'banzak-saves-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const appData = path.join(root, 'NewUser', 'Roaming');
  for (const [slot, id] of [['0009', '010003F003A34000'], ['0010', '0100F43008C44000']]) {
    const dir = path.join(appData, 'Ryujinx', 'bis', 'user', 'save', slot);
    fs.mkdirSync(path.join(dir, 'profile'), { recursive: true });
    const meta = Buffer.alloc(512); meta.writeBigUInt64LE(BigInt('0x' + id));
    fs.writeFileSync(path.join(dir, 'ExtraData0'), meta);
    fs.writeFileSync(path.join(dir, 'profile', 'savedata.bin'), 'save');
  }
  const game = { id: 'lets-go', title: "Pokémon: Let's Go, Pikachu!", type: 'emulator' };
  const candidates = getSaveLocations(game, { userProfile: path.join(root, 'NewUser'), appData }, {});
  assert.ok(candidates.some(c => c.path.includes('0009') && c.path.endsWith('savedata.bin')));
  assert.ok(!candidates.some(c => c.path.includes('0010')));
});
test('PC port saves resolve relative to a relocated executable and explicit choices survive', () => {
  const exe = path.join(os.tmpdir(), 'DifferentDisk', 'Legends', 'lasrecomp.exe');
  const selected = path.join(os.tmpdir(), 'CustomSave', 'main');
  const game = { id: 'pc', title: 'Pokémon Legends: Z-A', type: 'pc', exe, savePath: selected };
  const candidates = getSaveLocations(game, { userProfile: os.tmpdir() }, {});
  assert.equal(candidates[0].path, selected);
  assert.ok(candidates.some(c => c.path === path.join(path.dirname(exe), 'save', 'save_0', 'main')));
});
test('Pikachu and Eevee retain distinct save identities', () => {
  assert.equal(inferTitleId({ title: "Pokémon: Let's Go, Pikachu!" }), '010003F003A34000');
  assert.equal(inferTitleId({ title: "Pokémon: Let's Go, Eevee!" }), '0100187003A36000');
});
