const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDiscovery, parseVdf, battleNetRecords, identity } = require('../discovery');
const { reconcileCatalog } = require('../library');
const { native } = require('../environment');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'banzak-install-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const context = { userProfile: path.join(root, 'OtherUser'), appData: path.join(root, 'OtherUser', 'Roaming'), localAppData: path.join(root, 'OtherUser', 'Local'), programData: path.join(root, 'Data'), programFiles: path.join(root, 'Programs'), programFilesX86: path.join(root, 'Programs32'), documents: path.join(root, 'Documents'), drives: [], steamRoots: [], applications: [], gameRoots: [] };
  async function write(relative, content = 'MZ-game') {
    const file = path.isAbsolute(relative) ? relative : path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, content); return file;
  }
  return { root, context, write };
}
function field(number, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const size = []; let n = bytes.length;
  do { let b = n & 127; n >>>= 7; if (n) b |= 128; size.push(b); } while (n);
  return Buffer.concat([Buffer.from([number * 8 + 2, ...size]), bytes]);
}
const product = (code, dir) => field(1, Buffer.concat([field(1, code), field(2, code), field(3, field(1, dir))]));

test('VDF parsing preserves Windows paths, nested libraries and comments inside strings', () => {
  const d = parseVdf('"libraryfolders" { // comment\n "7" { "path" "Z:\\\\My Games" "label" "https://example.com" } }');
  assert.equal(d.libraryfolders['7'].path, 'Z:\\My Games');
  assert.equal(d.libraryfolders['7'].label, 'https://example.com');
});
test('a Battle.net client and stale config/product names do not install any games', async t => {
  const f = await fixture(t);
  await f.write(path.join(f.context.programFilesX86, 'Battle.net', 'Battle.net.exe'));
  await f.write(path.join(f.context.appData, 'Battle.net', 'Battle.net.config'), JSON.stringify({ Games: { fenris: {}, diablo3: {}, pro: {} } }));
  await f.write(path.join(f.context.programData, 'Battle.net', 'Agent', 'product.db'), field(7, 'fenris'));
  const scanner = createDiscovery(f.context), found = await scanner.scan({ emulators: {} });
  assert.equal(found.games.length, 0);
  for (const id of ['bnet-diablo4', 'bnet-diablo3', 'bnet-ow2']) assert.equal((await scanner.verify({ id, store: 'battlenet' }, {})).status, 'missing');
});
test('Battle.net requires the game executable inside its own recorded installation', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'CustomLibrary', 'Diablo');
  const record = product('fenris', dir);
  assert.equal(battleNetRecords(record)[0].installDir, dir);
  await f.write(path.join(f.context.programData, 'Battle.net', 'Agent', 'product.db'), record);
  await f.write(path.join(f.context.programFilesX86, 'Battle.net', 'Battle.net.exe'));
  let scanner = createDiscovery(f.context);
  assert.equal((await scanner.scan({ emulators: {} })).games.length, 0);
  const exe = await f.write(path.join(dir, 'Diablo IV.exe'));
  scanner = createDiscovery(f.context);
  const found = await scanner.scan({ emulators: {} });
  assert.equal(found.games.length, 1); assert.equal(found.games[0].installation.executable, exe);
});
test('corrupt Battle.net metadata yields unverified, preserving the previous record', async t => {
  const f = await fixture(t);
  await f.write(path.join(f.context.programData, 'Battle.net', 'Agent', 'product.db'), Buffer.from([255, 255]));
  const scanner = createDiscovery(f.context); await scanner.scan({ emulators: {} });
  assert.equal((await scanner.verify({ id: 'bnet-diablo4' }, {})).status, 'unverified');
});
test('Steam discovers custom libraries, excludes residue and identifies incomplete downloads', async t => {
  const f = await fixture(t), steam = path.join(f.root, 'CustomSteam'), library = path.join(f.root, 'AnotherDisk', 'Library');
  f.context.steamRoots = [steam];
  await f.write(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders" { "7" { "path" ${JSON.stringify(library)} } }`);
  const manifest = (id, name, flags = '4', extra = '') => `"AppState" { "appid" "${id}" "name" "${name}" "installdir" "${name}" "StateFlags" "${flags}" ${extra} }`;
  for (const [id, name, flags] of [[11, 'Installed', '4'], [12, 'Removed', '4'], [13, 'Partial', '1']]) await f.write(path.join(library, 'steamapps', `appmanifest_${id}.acf`), manifest(id, name, flags));
  await f.write(path.join(library, 'steamapps', 'common', 'Installed', 'Game.exe'));
  await f.write(path.join(library, 'steamapps', 'common', 'Partial', 'Game.exe'));
  const found = await createDiscovery(f.context).scan({ emulators: {} });
  const states = Object.fromEntries(found.games.map(g => [g.steamAppId, g.installation.status]));
  assert.deepEqual(states, { '11': 'installed', '12': 'missing', '13': 'incomplete' });
});
test('a folder with only a crash reporter does not validate a Steam installation', async t => {
  const f = await fixture(t), steam = path.join(f.root, 'Steam'); f.context.steamRoots = [steam];
  await f.write(path.join(steam, 'steamapps', 'appmanifest_14.acf'), '"AppState" { "appid" "14" "name" "Broken" "installdir" "Broken" "StateFlags" "4" }');
  await f.write(path.join(steam, 'steamapps', 'common', 'Broken', 'UnityCrashHandler64.exe'));
  assert.equal((await createDiscovery(f.context).scan({ emulators: {} })).games[0].installation.status, 'incomplete');
});
test('Epic manifests with missing or incomplete executables cannot count as installed', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'EpicCustom'), manifests = path.join(f.context.programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  for (const [id, incomplete, exe] of [['good', false, 'Game.exe'], ['partial', true, 'Game.exe'], ['gone', false, 'Gone.exe']]) {
    await f.write(path.join(manifests, id + '.item'), JSON.stringify({ AppName: id, DisplayName: id, InstallLocation: dir, LaunchExecutable: exe, bIsApplication: true, bIsIncompleteInstall: incomplete, AppCategories: ['games'] }));
  }
  await f.write(path.join(dir, 'Game.exe'));
  const games = (await createDiscovery(f.context).scan({ emulators: {} })).games;
  assert.deepEqual(Object.fromEntries(games.map(g => [g.storeId, g.installation.status])), { gone: 'missing', good: 'installed', partial: 'incomplete' });
  assert.equal(identity({ id: 'epic-good', store: 'epic', exe: 'legacy' }), identity(games.find(g => g.storeId === 'good')));
});
test('EA and Riot use manifest installation paths for another Windows user', async t => {
  const f = await fixture(t), root = path.join(f.root, 'Games'); f.context.gameRoots = [root];
  const ea = path.join(root, 'Another EA Game');
  await f.write(path.join(ea, 'RealGame.exe'));
  await f.write(path.join(ea, '__Installer', 'installerdata.xml'), '<DiPManifest><gameTitle locale="en_US">Another Game</gameTitle><filePath>[HKEY_LOCAL_MACHINE\\SomeKey]RealGame.exe</filePath></DiPManifest>');
  const riot = path.join(f.root, 'CustomRiot'); await f.write(path.join(riot, 'LeagueClient.exe'));
  await f.write(path.join(f.context.programData, 'Riot Games', 'RiotClientInstalls.json'), JSON.stringify({ associated_client: { [riot]: 'irrelevant' } }));
  const games = (await createDiscovery(f.context).scan({ emulators: {} })).games;
  assert.ok(games.some(g => g.store === 'ea' && g.title === 'Another Game' && g.installation.status === 'installed'));
  assert.ok(games.some(g => g.store === 'riot' && g.exe === path.join(riot, 'LeagueClient.exe')));
});
test('fresh profile discovers emulator and base ROM, skipping standalone DLC', async t => {
  const f = await fixture(t), root = path.join(f.root, 'Games'); f.context.gameRoots = [root];
  await f.write(path.join(root, 'Eden', 'eden.exe'));
  await f.write(path.join(root, 'Roms', 'Game [0100000000000000].nsp'));
  await f.write(path.join(root, 'Roms', 'Game Update [0100000000000800].nsp'));
  await f.write(path.join(root, 'Roms', 'Game 1.0.1.nsp'));
  await f.write(path.join(root, 'Roms', 'Combined [0100000000001000][v10+2DLC].xci'));
  const found = await createDiscovery(f.context).scan({ emulators: {} });
  assert.equal(Object.keys(found.emulators).length, 1);
  assert.equal(found.games.length, 2);
  assert.ok(found.games.every(g => g.installation.status === 'installed'));
  assert.equal((await createDiscovery(f.context).verify({ type: 'emulator', category: 'switch', rom: path.join(root, 'Roms', 'Game 1.0.1.nsp') }, { emulators: found.emulators })).status, 'incomplete');
});
test('unreadable files and disconnected volumes stay unverified', async t => {
  const f = await fixture(t), file = path.join(f.root, 'Denied.exe');
  const io = { ...fs, stat: async name => {
    if (name === file || name === native('Z:\\') || name === native('Z:\\Game.exe')) throw Object.assign(new Error('denied'), { code: name === file ? 'EACCES' : 'ENOENT' });
    return fs.stat(name);
  } };
  const scanner = createDiscovery(f.context, { io });
  assert.equal((await scanner.verify({ type: 'pc', exe: file }, {})).status, 'unverified');
  assert.equal((await scanner.verify({ type: 'pc', exe: 'Z:\\Game.exe' }, {})).status, 'unverified');
});
test('reinstall/move keeps identity, favorites, covers, saves and history', async t => {
  const f = await fixture(t), root = path.join(f.root, 'NewGames'); f.context.gameRoots = [root];
  const exe = await f.write(path.join(root, 'Biped', 'Biped.exe'));
  const old = { id: 'my-biped', title: 'Biped', type: 'pc', exe: path.join(f.root, 'Old', 'Biped.exe'), cwd: path.join(f.root, 'Old'), favorite: true, playCount: 12, totalPlayMinutes: 77, savePath: 'my-save', coverLocked: true, cover: 'manual', lastPlayed: 123 };
  const scanner = createDiscovery(f.context), found = await scanner.scan({ emulators: {} });
  const updated = (await reconcileCatalog([old], [old], found.games, {}, scanner.verify)).games;
  assert.equal(updated.length, 1); assert.equal(updated[0].exe, exe); assert.equal(updated[0].installation.status, 'installed');
  assert.equal(updated[0].cwd, path.dirname(exe));
  const custom = { ...old, cwd: path.join(f.root, 'CustomWorkingDir') };
  assert.equal((await reconcileCatalog([custom], [custom], found.games, {}, scanner.verify)).games[0].cwd, custom.cwd);
  for (const key of ['id', 'favorite', 'playCount', 'totalPlayMinutes', 'savePath', 'coverLocked', 'cover', 'lastPlayed']) assert.deepEqual(updated[0][key], old[key]);
  await fs.unlink(exe);
  const next = createDiscovery(f.context); const missing = await next.verify(updated[0], {});
  assert.equal(missing.status, 'missing');
});
test('reconciliation does not resurrect a record removed during a scan', async () => {
  const game = { id: 'biped', title: 'Biped', exe: 'X:\\Biped.exe', type: 'pc', installation: { status: 'installed' } };
  const result = await reconcileCatalog([], [game], [game], {}, async () => game.installation);
  assert.equal(result.games.length, 0);
});

test('an unknown GOG game is discovered through registry metadata while ordinary applications stay out', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'Custom disk', 'An Adventure');
  const exe = await f.write(path.join(dir, 'bin', 'Adventure.exe'));
  await f.write(path.join(dir, 'goggame-9123.info'), JSON.stringify({ gameId: '9123', name: 'An Adventure', playTasks: [{ isPrimary: true, type: 'FileTask', path: 'bin/Adventure.exe' }] }));
  const tool = await f.write(path.join(f.root, 'Office Tool', 'Tool.exe'));
  f.context.applications = [{ DisplayName: 'An Adventure', InstallLocation: dir }, { DisplayName: 'Office Tool', DisplayIcon: `"${tool}",0` }];
  const scanner = createDiscovery(f.context), found = await scanner.scan({ emulators: {} });
  assert.equal(found.games.length, 1); assert.equal(found.games[0].store, 'gog'); assert.equal(found.games[0].exe, exe);
  const old = { id: 'my-adventure', title: 'My title', type: 'pc', exe, favorite: true, playCount: 6 };
  const merged = await reconcileCatalog([old], [old], found.games, {}, scanner.verify);
  assert.equal(merged.games.length, 1); assert.equal(merged.games[0].id, old.id); assert.equal(merged.games[0].favorite, true); assert.equal(merged.games[0].storeId, '9123');
  assert.equal((await reconcileCatalog([], [old], found.games, {}, scanner.verify)).games.length, 0);
  await fs.unlink(exe);
  assert.equal((await createDiscovery(f.context).scan({ emulators: {} })).games.length, 0);
});
test('Xbox desktop metadata is found inside Content and requires the configured executable', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'XboxGames', 'A real game'); f.context.gameRoots = [path.dirname(dir)];
  await f.write(path.join(dir, 'Content', 'MicrosoftGame.config'), '<Game><Identity Name="Publisher.RealGame"/><ExecutableList><Executable Name="Game.exe" TargetDeviceFamily="PC"/></ExecutableList><ShellVisuals DefaultDisplayName="A Real Game"/></Game>');
  assert.equal((await createDiscovery(f.context).scan({ emulators: {} })).games.length, 0);
  await f.write(path.join(dir, 'Content', 'Game.exe'));
  const found = await createDiscovery(f.context).scan({ emulators: {} });
  assert.equal(found.games.length, 1); assert.equal(found.games[0].store, 'xbox'); assert.equal(found.games[0].title, 'A Real Game');
});
test('EA games with unfamiliar registry titles are found outside the default game folders', async t => {
  const f = await fixture(t), dir = path.join(f.root, 'Custom', 'Space Adventure');
  await f.write(path.join(dir, 'Space.exe'));
  await f.write(path.join(dir, '__Installer', 'installerdata.xml'), '<DiPManifest><gameTitle locale="en_US">Space Adventure</gameTitle><filePath>Space.exe</filePath></DiPManifest>');
  f.context.applications = [{ DisplayName: 'Space Adventure', InstallLocation: dir }];
  const games = (await createDiscovery(f.context).scan({ emulators: {} })).games;
  assert.equal(games.length, 1); assert.equal(games[0].store, 'ea');
});
test('Hytale finds LocalAppData, pre-release and versioned client layouts, using the registered launcher', async t => {
  const f = await fixture(t), dir = path.join(f.context.localAppData, 'Hytale', 'install', 'pre-release', 'package', 'game', '2026.10.31');
  const client = await f.write(path.join(dir, 'Client', 'HytaleClient.exe'));
  await f.write(path.join(dir, 'Assets.zip'));
  const launcher = await f.write(path.join(f.root, 'Launcher installed elsewhere', 'hytale-launcher.exe'));
  f.context.applications = [{ DisplayName: 'Hytale Launcher', DisplayIcon: `"${launcher}",-1` }];
  const found = await createDiscovery(f.context).scan({ emulators: {} });
  assert.equal(found.games.length, 1); assert.equal(found.games[0].id, 'pc-hytale'); assert.equal(found.games[0].exe, launcher); assert.equal(found.games[0].installation.executable, client);
});
test('deep Hytale installs in an explicit custom folder are discovered beyond the generic depth limit', async t => {
  const f = await fixture(t), root = path.join(f.root, 'Custom library');
  const dir = path.join(root, 'install', 'release', 'package', 'game', 'latest');
  await f.write(path.join(dir, 'Client', 'HytaleClient.exe')); await f.write(path.join(dir, 'Assets.zip'));
  const scanner = createDiscovery(f.context), found = await scanner.scan({ emulators: {}, discoveryRoots: [root] });
  assert.equal(found.games.length, 1); assert.equal(found.games[0].installation.status, 'installed');
  assert.equal((await scanner.verify(found.games[0], {})).status, 'installed');
});
test('Hytale launcher alone and partial game payloads never count as installed', async t => {
  const f = await fixture(t), root = path.join(f.context.appData, 'Hytale');
  await f.write(path.join(root, 'hytale-launcher.exe'));
  assert.equal((await createDiscovery(f.context).scan({ emulators: {} })).games.length, 0);
  const client = await f.write(path.join(root, 'install', 'release', 'package', 'game', 'latest', 'Client', 'HytaleClient.exe'));
  let found = await createDiscovery(f.context).scan({ emulators: {} });
  assert.equal(found.games[0].installation.status, 'incomplete');
  const assets = await f.write(path.join(path.dirname(path.dirname(client)), 'Assets.zip'));
  found = await createDiscovery(f.context).scan({ emulators: {} });
  assert.equal(found.games[0].installation.status, 'installed');
  await fs.unlink(client); await fs.unlink(assets);
  const scanner = createDiscovery(f.context); await scanner.scan({ emulators: {} });
  assert.equal((await scanner.verify(found.games[0], {})).status, 'missing');
});
test('application cache/build roots are excluded from the broad directory walk', async t => {
  const f = await fixture(t), root = path.join(f.root, 'Games'), excluded = path.join(root, 'NivoDock', 'dist');
  f.context.gameRoots = [root]; f.context.excludedRoots = [excluded];
  await f.write(path.join(excluded, 'Game.exe'));
  await f.write(path.join(excluded, 'goggame-99.info'), JSON.stringify({ gameId: '99', name: 'A cached fixture', playTasks: [{ isPrimary: true, path: 'Game.exe' }] }));
  assert.equal((await createDiscovery(f.context).scan({ emulators: {} })).games.length, 0);
});

test('a store-owned executable does not become a duplicate native game or bypass an incomplete download', async t => {
  const f = await fixture(t), steam = path.join(f.root, 'Steam'), dir = path.join(steam, 'steamapps', 'common', 'Biped');
  f.context.steamRoots = [steam]; f.context.applications = [{ DisplayName: 'Biped', InstallLocation: dir }];
  await f.write(path.join(steam, 'steamapps', 'appmanifest_1071870.acf'), '"AppState" { "appid" "1071870" "name" "Biped" "installdir" "Biped" "StateFlags" "1" }');
  await f.write(path.join(dir, 'Biped.exe'));
  // Store packages can contain extra launch metadata; it must not reclassify
  // an existing Steam installation or bypass its incomplete download state.
  await f.write(path.join(dir, 'MicrosoftGame.config'), '<Game><Identity Name="Example.Biped"/><ShellVisuals DefaultDisplayName="Biped"/><ExecutableList><Executable Name="Biped.exe"/></ExecutableList></Game>');
  await f.write(path.join(dir, 'goggame-99.info'), JSON.stringify({ gameId: '99', name: 'Biped', playTasks: [{ isPrimary: true, path: 'Biped.exe' }] }));
  const games = (await createDiscovery(f.context).scan({ emulators: {} })).games;
  assert.equal(games.length, 1); assert.equal(games[0].type, 'steam'); assert.equal(games[0].installation.status, 'incomplete');
});
