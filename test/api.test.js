const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('local API preserves the library and rejects requests from other sites', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banzak-api-'));
  for (const name of ['server.js', 'library.js', 'artwork.js', 'package.json', 'environment.js', 'discovery.js','game-manifests.js','update-core.js','update-worker.js','updater.js','update-channel.json', 'save-locations.js','progress.js','progress-readers.js','progress-formats.js', 'autostart.js']) fs.copyFileSync(path.join(__dirname, '..', name), path.join(dir, name));
  fs.mkdirSync(path.join(dir, 'public'));
  fs.writeFileSync(path.join(dir, 'public/index.html'), 'Game Deck');
  const original = [
    { id: 'one', title: 'Game One', type: 'pc', exe: 'C:\\Missing.exe', favorite: true, playCount: 3, lastPlayed: 99, cover: 'https://example.com/old.png', args: ['arg'] },
    { id: 'locked', title: 'Manual', cover: 'https://example.com/manual.png', coverLocked: true },
    { id: 'deleted', title: 'Remove during refresh' },
  ];
  const gamesFile = path.join(dir, 'games.json');
  fs.writeFileSync(gamesFile, JSON.stringify(original));
  fs.writeFileSync(path.join(dir, 'config.json'), '{"emulators":{}}');
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  mock.method(require(path.join(dir, 'artwork.js')), 'createArtworkService', () => ({ resolve: async game => {
    started(); await gate;
    return { cover: '/artwork/' + 'a'.repeat(64) + '.png', hero: '/artwork/' + 'b'.repeat(64) + '.png', artwork: { source: 'test' } };
  } }));
  process.env.NIVODOCK_PORT = '47913';
  const { server, loadGames } = require(path.join(dir, 'server.js'));
  await new Promise(resolve => server.listen(47913, '127.0.0.1', resolve));
  t.after(async () => {
    release(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:47913';
  const post = (route, body, extra = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

  await t.test('serves the UI and library with no wildcard CORS permission', async () => {
    assert.equal(await (await fetch(base)).text(), 'Game Deck');
    const res = await fetch(base + '/api/data');
    assert.equal(res.status, 200); assert.equal(res.headers.get('access-control-allow-origin'), null);
    assert.equal((await res.json()).games.length, 3);
  });
  await t.test('update API reports the unpublished channel and never installs an unoffered version', async () => {
    const status = await (await fetch(base + '/api/update')).json();
    assert.equal(status.state, 'unconfigured'); assert.equal(status.canInstall, false);
    assert.equal((await post('/api/update/check', {})).status, 200);
    assert.equal((await post('/api/update/install', { version: '99.0.0' })).status, 409);
    assert.equal((await post('/api/update/install', { version: '99.0.0' }, { Origin: 'https://other.example' })).status, 403);
    const health = await (await fetch(base + '/api/update/health')).json();
    assert.equal(health.product, 'NivoDock'); assert.equal(health.version, require('../package.json').version);
  });
  await t.test('a pending installation blocks library mutations while health and status remain available', async () => {
    const updateDir = path.join(dir, '.updates'); fs.mkdirSync(updateDir);
    fs.writeFileSync(path.join(updateDir, 'transaction.json'), JSON.stringify({ phase: 'applying' }));
    assert.equal((await post('/api/favorite', { id: 'one' })).status, 503);
    assert.equal(loadGames()[0].favorite, true);
    assert.equal((await fetch(base + '/api/update/health')).status, 200);
    assert.equal((await (await fetch(base + '/api/status')).json()).update.state, 'applying');
    fs.rmSync(updateDir, { recursive: true });
  });
  await t.test('blocks foreign origins, DNS rebinding hosts and form submissions', async () => {
    assert.equal((await post('/api/favorite', { id: 'one' }, { Origin: 'https://other.example' })).status, 403);
    const rebound = await new Promise(resolve => {
      require('node:http').get(base + '/api/data', { headers: { Host: 'other.example:47913' } }, res => { res.resume(); resolve(res.statusCode); });
    });
    assert.equal(rebound, 403);
    assert.equal((await fetch(base + '/api/favorite', { method: 'POST', body: 'id=one' })).status, 415);
    assert.equal(loadGames()[0].favorite, true);
  });
  await t.test('rejects malformed JSON instead of silently treating it as an empty mutation', async () => {
    const res = await fetch(base + '/api/favorite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(res.status, 400); assert.equal(loadGames()[0].favorite, true);
  });
  await t.test('refresh keeps concurrent edits, does not resurrect deletions and skips locked covers', async () => {
    const pending = post('/api/refresh-covers', {});
    await ready;
    assert.equal((await post('/api/refresh-covers', { id: 'one' })).status, 409);
    const edited = await post('/api/add-game', { id: 'one', title: 'Game One', cover: original[0].cover, targetPath: original[0].exe });
    assert.equal(edited.status, 200);
    const saved = (await edited.json()).game;
    assert.equal(saved.favorite, true); assert.equal(saved.playCount, 3); assert.equal(saved.lastPlayed, 99); assert.deepEqual(saved.args, ['arg']);
    await post('/api/favorite', { id: 'one' });
    await post('/api/delete-game', { id: 'deleted' });
    release();
    const result = await (await pending).json();
    assert.equal(result.updated, 1); assert.equal(result.skipped, 1);
    const games = loadGames();
    assert.equal(games.length, 2); assert.equal(games[0].favorite, false);
    assert.match(games[0].cover, /^\/artwork\//);
    assert.equal(games[1].cover, original[1].cover);
  });
  await t.test('missing games return an error and a corrupt catalog cannot become an empty library', async () => {
    assert.equal((await post('/api/refresh-covers', { id: 'missing' })).status, 404);
    const configFile = path.join(dir, 'config.json');
    fs.writeFileSync(configFile, '{broken');
    assert.equal((await fetch(base + '/api/data')).status, 500);
    assert.equal(fs.readFileSync(configFile, 'utf8'), '{broken');
    fs.writeFileSync(configFile, '{"emulators":{}}');
    fs.writeFileSync(gamesFile, '{broken');
    assert.throws(loadGames);
    assert.equal((await fetch(base + '/api/data')).status, 500);
    assert.equal(fs.readFileSync(gamesFile, 'utf8'), '{broken');
  });
});
