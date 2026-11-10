const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { atomicWriteJson, buildGame, mergeDiscoveredGames } = require('../library');

const game = { id: 'pc', title: 'Game', type: 'pc', exe: 'C:\\Game.exe', favorite: true,
  playCount: 7, lastPlayed: 123, totalPlayTime: 900, args: ['--fullscreen'],
  cwd: 'C:\\Game', env: { EXAMPLE: '1' }, category: 'pc', tags: ['RPG'],
  cover: 'https://example.com/cover.png', hero: 'https://example.com/hero.png' };
test('editing a title preserves favorite, history, launch arguments and hero', () => {
  const edited = buildGame({ title: 'New title', type: 'pc', cover: game.cover }, game, {});
  for (const key of ['favorite', 'playCount', 'lastPlayed', 'totalPlayTime', 'args', 'cwd', 'env', 'hero', 'tags']) assert.deepEqual(edited[key], game[key]);
  assert.equal(buildGame({ targetPath: 'C:\\MovedGame.exe' }, { ...game, installation: { status: 'installed' } }, {}).installation.status, 'unverified');
});
test('editing Steam retains type, app ID and store category', () => {
  const original = { ...game, type: 'steam', steamAppId: '730', category: 'steam' };
  const edited = buildGame({ title: 'CS2', cover: original.cover }, original, {});
  assert.equal(edited.type, 'steam'); assert.equal(edited.steamAppId, '730'); assert.equal(edited.category, 'steam');
});
test('new games do not start with fabricated play history', () => {
  const created = buildGame({ title: 'New Game', type: 'pc', targetPath: 'C:\\New.exe' }, null, {});
  assert.equal(created.playCount, 0); assert.equal(created.lastPlayed, 0); assert.equal(created.favorite, false);
});
test('manual artwork is marked as locked and can be unlocked explicitly', () => {
  const edited = buildGame({ cover: 'https://example.com/new.png' }, game, {});
  assert.equal(edited.coverLocked, true); assert.equal(edited.artwork.source, 'manual');
  assert.equal(buildGame({ coverLocked: false }, edited, {}).coverLocked, false);
});
test('invalid artwork URL and missing emulators are rejected', () => {
  assert.throws(() => buildGame({ cover: 'javascript:alert(1)' }, game, {}), /URL/);
  assert.throws(() => buildGame({ type: 'emulator', emulator: 'missing' }, game, {}), /Emulador/);
});
test('atomic writes replace valid JSON and remove temporary files', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banzak-json-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'games.json'); fs.writeFileSync(file, '[1]');
  atomicWriteJson(file, [2]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), [2]);
  assert.deepEqual(fs.readdirSync(dir), ['games.json']);
});
test('scan merge keeps edits and deletions made during discovery', () => {
  const discovered = [{ id: 'existing', favorite: false }, { id: 'removed' }, { id: 'new' }];
  const merged = mergeDiscoveredGames([{ id: 'existing', favorite: true }], discovered, ['existing', 'removed']);
  assert.deepEqual(merged, [{ id: 'existing', favorite: true }, { id: 'new' }]);
});
test('different games sharing a store launcher retain their distinct arguments', () => {
  const discovered = ['Fenris', 'D3', 'Pro'].map(code => ({ id: code, exe: 'C:\\Battle.net.exe', args: ['--exec=launch ' + code] }));
  assert.equal(mergeDiscoveredGames([], discovered, []).length, 3);
  assert.equal(mergeDiscoveredGames(discovered, discovered, []).length, 3);
});
