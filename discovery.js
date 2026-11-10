const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { join, native, canonical, windowsPath } = require('./environment');
const { gogInfo, microsoftGame, displayIconPath } = require('./game-manifests');
const parent = file => windowsPath(file) ? path.win32.dirname(file) : path.dirname(file);
const leaf = file => windowsPath(file) ? path.win32.basename(file) : path.basename(file);

const BNET = [
  { id: 'bnet-diablo4', title: 'Diablo IV', codes: ['fenris'], code: 'Fenris', exes: ['Diablo IV.exe'] },
  { id: 'bnet-diablo3', title: 'Diablo III', codes: ['diablo3', 'd3'], code: 'D3', exes: ['Diablo III.exe', 'x64/Diablo III64.exe'] },
  { id: 'bnet-ow2', title: 'Overwatch 2', codes: ['pro', 'prometheus'], code: 'Pro', exes: ['_retail_/Overwatch.exe'] },
  { id: 'bnet-cod', title: 'Call of Duty: Warzone / BO6', codes: ['auks'], code: 'AUKS', exes: ['_retail_/cod.exe', 'cod.exe'] },
  { id: 'bnet-hearthstone', title: 'Hearthstone', codes: ['wtcg'], code: 'WTCG', exes: ['Hearthstone.exe'] },
  { id: 'bnet-wow', title: 'World of Warcraft', codes: ['wow'], code: 'WoW', exes: ['_retail_/Wow.exe', '_classic_/WowClassic.exe'] },
];
const PC = [
  { id: 'rs-dragonwilds', title: 'RuneScape: Dragonwilds', exes: ['rsdragonwilds.exe'] },
  { id: 'forza-horizon-6', title: 'Forza Horizon 6', exes: ['forzahorizon6.exe'] },
  { id: 'biped', title: 'Biped', exes: ['biped.exe'] },
  { id: 'poke-brilliant-diamond', title: 'Pokémon Brilliant Diamond', exes: ['pokemon brilliant diamond.exe'] },
  { id: 'poke-za-recomp', title: 'Pokémon Legends: Z-A (PC Nativo)', exes: ['lasrecomp.exe'], pathMatch: /legends|\bza\b|z.a.recomp/i, env: { LARECOMP_GAME: 'za' } },
  { id: 'ea-nfs-2016', title: 'Need for Speed', exes: ['nfs16.exe'], store: 'ea' },
  { id: 'pc-nfsu2', title: 'Need for Speed: Underground 2', exes: ['speed2.exe'] },
  { id: 'riot-lol', title: 'League of Legends', exes: ['leagueclient.exe'], store: 'riot' },
];
const EMULATORS = [
  { key: 'eden', names: ['eden.exe'], name: 'Eden', platform: 'Nintendo Switch', category: 'switch', extensions: ['.nsp', '.xci', '.nro'], argsTemplate: ['-f', '-g', '{rom}'] },
  { key: 'ryujinx', names: ['ryujinx.exe'], name: 'Ryujinx', platform: 'Nintendo Switch', category: 'switch', extensions: ['.nsp', '.xci'], argsTemplate: ['--fullscreen', '{rom}'] },
  { key: 'citron', names: ['citron.exe'], name: 'Citron', platform: 'Nintendo Switch', category: 'switch', extensions: ['.nsp', '.xci'], argsTemplate: ['-f', '-g', '{rom}'] },
  { key: 'eglantine', names: ['eglantine.exe'], name: 'Eglantine', platform: 'Switch 2', category: 'switch', extensions: ['.nsp', '.xci'], argsTemplate: ['-f', '-g', '{rom}'] },
  { key: 'vbam', names: ['visualboyadvance-m.exe'], name: 'VisualBoyAdvance-M', platform: 'GBA', category: 'retro', extensions: ['.gba', '.gb', '.gbc'], argsTemplate: ['{rom}'] },
  { key: 'mgba', names: ['mgba.exe'], name: 'mGBA', platform: 'GBA', category: 'retro', extensions: ['.gba', '.gb', '.gbc'], argsTemplate: ['-f', '{rom}'] },
  { key: 'pcsx2', names: ['pcsx2-qt.exe'], name: 'PCSX2', platform: 'PlayStation 2', category: 'retro', extensions: ['.iso', '.chd'], argsTemplate: ['-fullscreen', '--', '{rom}'] },
  { key: 'desmume', names: ['desmume.exe', 'desmume_0.9.11_x64.exe'], name: 'DeSmuME', platform: 'Nintendo DS', category: 'retro', extensions: ['.nds'], argsTemplate: ['{rom}'] },
];
const ignoredExe = /unins|uninstall|crash|report|redist|setup|installer|helper|notification|cef|nodeeditor|unitycrash/i;
const skippedDir = /^(?:.*_data|apache-maven.*|node_modules|\.git|cache|shadercache|\.deck-profile|backups|mods|translations|firmware|nand|bis|resources|assets|content|downloads|windows|microsoft|windowsapps|steamapps|jre|jdk|redist|__installer|_installer|easyanticheat)$/i;
const idFor = value => crypto.createHash('sha256').update(canonical(value)).digest('hex').slice(0, 20);
const titleKey = title => String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function switchUpdate(name, size) {
  if (/\+\s*\d*\s*(?:dlc|update)|\(\d+G\+\d+U/i.test(name)) return false;
  const id = name.match(/\[([0-9a-f]{16})\]/i)?.[1];
  return /\b(?:update|dlc|patch)\b/i.test(name) || Boolean(id && !id.endsWith('000')) || (/\.nsp$/i.test(name) && /\d+\.\d+\.\d+/.test(name) && size < 80 * 1024 * 1024);
}

function parseVdf(text) {
  const tokens = (text.match(/"(?:\\.|[^"\\])*"|[{}]|\/\/[^\n\r]*/g) || []).filter(t => !t.startsWith('//'));
  let i = 0;
  const string = token => {
    if (!token?.startsWith('"') || !token.endsWith('"')) throw new Error('Manifesto VDF inválido');
    return token.slice(1, -1).replace(/\\(["\\])/g, '$1');
  };
  function object(depth = 0) {
    if (depth > 16) throw new Error('Manifesto VDF muito profundo');
    const obj = Object.create(null);
    while (i < tokens.length && tokens[i] !== '}') {
      const key = string(tokens[i++]);
      if (tokens[i] === '{') { i++; obj[key] = object(depth + 1); if (tokens[i++] !== '}') throw new Error('Manifesto VDF incompleto'); }
      else obj[key] = string(tokens[i++]);
    }
    return obj;
  }
  return object();
}

function protobuf(buffer, depth = 0) {
  if (depth > 8) throw new Error('product.db muito profundo');
  let p = 0; const fields = [];
  function varint() {
    let n = 0, multiplier = 1;
    for (let i = 0; i < 10 && p < buffer.length; i++) {
      const byte = buffer[p++]; n += (byte & 127) * multiplier;
      if (!(byte & 128)) return n;
      multiplier *= 128;
    }
    throw new Error('product.db inválido');
  }
  while (p < buffer.length) {
    const tag = varint(), number = Math.floor(tag / 8), wire = tag & 7;
    if (!number) throw new Error('product.db inválido');
    let value;
    if (wire === 0) value = varint();
    else if ([1, 2, 5].includes(wire)) {
      const length = wire === 2 ? varint() : wire === 1 ? 8 : 4;
      if (length < 0 || p + length > buffer.length) throw new Error('product.db truncado');
      value = buffer.subarray(p, p + length); p += length;
    } else throw new Error('product.db inválido');
    fields.push({ number, wire, value });
  }
  return fields;
}

function battleNetRecords(buffer) {
  return protobuf(buffer).filter(f => f.number === 1 && f.wire === 2).flatMap(f => {
    const product = protobuf(f.value);
    const strings = product.filter(v => [1, 2].includes(v.number) && v.wire === 2).map(v => v.value.toString('utf8').toLowerCase());
    const meta = BNET.find(g => g.codes.some(code => strings.includes(code)));
    if (!meta) return [];
    const settings = product.find(v => v.number === 3 && v.wire === 2);
    const install = settings && protobuf(settings.value).find(v => v.number === 1 && v.wire === 2)?.value.toString('utf8');
    return install ? [{ ...meta, installDir: install }] : [];
  });
}

function identity(game) {
  if (game.type === 'steam' && game.steamAppId) return `steam:${game.steamAppId}`;
  if (game.store === 'battlenet' || String(game.id).startsWith('bnet-')) {
    const meta = BNET.find(g => g.id === game.id || titleKey(g.title) === titleKey(game.title));
    return meta ? `battlenet:${meta.id}` : `battlenet:${game.id}`;
  }
  if (game.type === 'emulator') return `rom:${canonical(game.rom)}`;
  if (['gog', 'xbox'].includes(game.store) && game.storeId) return `${game.store}:${game.storeId}`;
  if (game.store === 'epic' && (game.storeId || game.id?.startsWith('epic-'))) return `epic:${game.storeId || game.id.slice(5)}`;
  if (game.id === 'pc-hytale' || titleKey(game.title) === 'hytale') return 'pc:hytale';
  const known = PC.find(g => g.id === game.id || (g.exes.includes(path.win32.basename(game.exe || '').toLowerCase()) && (!g.pathMatch || g.pathMatch.test(game.exe))));
  if (known) return `pc:${known.id}`;
  return `pc:${canonical(game.exe)}:${JSON.stringify(game.args || [])}`;
}

function createDiscovery(context, { io = fs } = {}) {
  const warnings = [], candidates = new Map(), checked = new Map();
  const visited = new Set(); let walked = 0;
  let steamUncertain = false, bnetUncertain = false, epicUncertain = false;
  const metadataVisited = new Set(), hytaleBases = new Set(), hytaleClients = new Set(), hytaleLaunchers = new Set();
  let hytaleIncomplete = null;
  const excluded = file => (context.excludedRoots || []).some(root => canonical(file) === canonical(root) || canonical(file).startsWith(canonical(root) + '/'));
  const bnetUnavailable = new Map();
  const state = (status, reason, extra = {}) => ({ status, reason, ...extra });
  function warn(file, err) { warnings.push({ path: file, reason: err.message || String(err) }); }
  async function probe(file, kind = 'file') {
    if (!file) return state('missing', 'Caminho de instalação não informado');
    const key = `${canonical(file)}:${kind}`;
    if (checked.has(key)) return checked.get(key);
    const promise = (async () => {
      try {
        const st = await io.stat(native(file));
        return (kind === 'directory' ? st.isDirectory() : st.isFile() && st.size > 0) ? state('present', '') : state('missing', 'Arquivo ou pasta de instalação ausente');
      } catch (err) {
        if (!['ENOENT', 'ENOTDIR'].includes(err.code)) return state('unverified', 'Não foi possível ler a instalação');
        if (windowsPath(file)) {
          try { await io.stat(native(path.win32.parse(file).root)); }
          catch { return state('unverified', 'Unidade desconectada ou indisponível'); }
        }
        return state('missing', 'Arquivo de instalação ausente');
      }
    })();
    checked.set(key, promise); return promise;
  }
  async function read(file, binary = false) {
    try {
      const st = await io.stat(native(file));
      if (st.size > 8 * 1024 * 1024) throw new Error('Manifesto acima do limite de 8 MiB');
      return await io.readFile(native(file), binary ? undefined : 'utf8');
    } catch (err) { if (!['ENOENT', 'ENOTDIR'].includes(err.code)) warn(file, err); throw err; }
  }
  async function entries(dir) {
    try { return await io.readdir(native(dir), { withFileTypes: true }); }
    catch (err) { if (!['ENOENT', 'ENOTDIR'].includes(err.code)) warn(dir, err); return []; }
  }
  function add(game) {
    const full = { favorite: false, playCount: 0, lastPlayed: 0, cover: '', hero: '', accent: '#10b981', tags: [], ...game };
    const key = identity(full);
    if (!candidates.has(key)) candidates.set(key, full);
  }
  async function executable(dir, maxDepth = 4) {
    const queue = [{ dir, depth: 0 }]; let seen = 0;
    while (queue.length && seen++ < 120) {
      const current = queue.shift();
      for (const item of await entries(current.dir)) {
        if (item.isFile() && /\.exe$/i.test(item.name) && !ignoredExe.test(item.name)) {
          const file = join(current.dir, item.name);
          if ((await probe(file)).status === 'present') return file;
        }
        if (item.isDirectory() && !skippedDir.test(item.name) && current.depth < maxDepth) queue.push({ dir: join(current.dir, item.name), depth: current.depth + 1 });
      }
    }
    return '';
  }
  const installed = (reason, executable, extra = {}) => state('installed', reason, { executable, ...extra });
  const storeOwns = file => [...candidates.values()].some(candidate => {
    if (!(candidate.type === 'steam' || candidate.store) || !candidate.installDir) return false;
    const root = canonical(candidate.installDir), target = canonical(file);
    return target === root || target.startsWith(root + '/');
  });

  async function steam() {
    const roots = new Set(context.steamRoots || []);
    const expectedRoots = new Set((context.steamRoots || []).map(canonical));
    for (const base of [context.programFiles, context.programFilesX86].filter(Boolean)) roots.add(join(base, 'Steam'));
    for (const drive of context.drives || []) roots.add(join(drive, 'SteamLibrary'));
    for (const game of context.existingGames || []) if (game.installation?.manifestPath && game.type === 'steam') {
      const root = join(game.installation.manifestPath, '..', '..'); roots.add(root); expectedRoots.add(canonical(root));
    }
    const libraries = new Map();
    for (const root of roots) {
      const apps = join(root, 'steamapps');
      const availability = await probe(apps, 'directory');
      if (availability.status !== 'present') { if (availability.status === 'unverified' && expectedRoots.has(canonical(root))) steamUncertain = true; continue; }
      libraries.set(canonical(root), root);
      for (const file of [join(apps, 'libraryfolders.vdf'), join(root, 'config', 'libraryfolders.vdf')]) {
        try {
          const data = parseVdf(await read(file)).libraryfolders || {};
          for (const [key, value] of Object.entries(data)) if (/^\d+$/.test(key)) {
            const location = typeof value === 'string' ? value : value.path;
            if (location) libraries.set(canonical(location), location);
          }
        } catch (err) { if (!['ENOENT', 'ENOTDIR'].includes(err.code)) steamUncertain = true; }
      }
    }
    for (const root of libraries.values()) {
      const apps = join(root, 'steamapps');
      const availability = await probe(apps, 'directory');
      if (availability.status === 'unverified') { steamUncertain = true; continue; }
      const warningCount = warnings.length, files = await entries(apps);
      if (warnings.length > warningCount) steamUncertain = true;
      for (const item of files) {
        if (!/^appmanifest_\d+\.acf$/i.test(item.name) || !item.isFile()) continue;
        const manifestPath = join(apps, item.name);
        try {
          const data = parseVdf(await read(manifestPath)).AppState;
          if (!data?.appid || !data.name || !data.installdir || data.appid === '228980' || /redistributable/i.test(data.name)) continue;
          if (/[\\/]|^\.\.$/.test(data.installdir)) throw new Error('Pasta inválida no manifesto Steam');
          const installDir = join(apps, 'common', data.installdir);
          const folder = await probe(installDir, 'directory');
          const exe = folder.status === 'present' ? await executable(installDir) : '';
          let installation;
          if (folder.status === 'unverified') installation = folder;
          else if (folder.status === 'missing') installation = state('missing', 'Manifesto residual; pasta do jogo ausente');
          else if (!(Number(data.StateFlags) & 4) || Number(data.StagingSize || 0) > 0 || Number(data.BytesToDownload || 0) > Number(data.BytesDownloaded || 0)) installation = state('incomplete', 'Download ou atualização Steam incompleto');
          else if (!exe) installation = state('incomplete', 'Pasta Steam sem executável do jogo');
          else installation = installed('Arquivos e manifesto Steam confirmados', exe);
          add({ id: `steam-${data.appid}`, title: data.name, platform: 'Steam', category: 'steam', type: 'steam', steamAppId: String(data.appid), installDir, installation: { ...installation, manifestPath, installDir }, tags: ['Steam', 'PC'] });
        } catch (err) { steamUncertain = true; warn(manifestPath, err); }
      }
    }
  }
  async function epic() {
    if (!context.programData) return;
    const dir = join(context.programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
    const warningCount = warnings.length, files = await entries(dir);
    if (warnings.length > warningCount) epicUncertain = true;
    for (const item of files) {
      if (!item.isFile() || !/\.item$/i.test(item.name)) continue;
      const manifestPath = join(dir, item.name);
      try {
        const d = JSON.parse(await read(manifestPath));
        if (!d.DisplayName || !d.AppName || !d.InstallLocation || !d.LaunchExecutable || d.bIsApplication === false) continue;
        if (d.AppCategories && !d.AppCategories.includes('games')) continue;
        if (windowsPath(d.LaunchExecutable) || path.isAbsolute(d.LaunchExecutable) || d.LaunchExecutable.split(/[\\/]/).includes('..')) throw new Error('Executável Epic fora da pasta de instalação');
        const exe = join(d.InstallLocation, d.LaunchExecutable), evidence = await probe(exe);
        const installation = d.bIsIncompleteInstall ? state('incomplete', 'Instalação Epic incompleta') : evidence.status === 'present' ? installed('Executável e manifesto Epic confirmados', exe) : evidence;
        add({ id: `epic-${d.AppName}`, storeId: d.AppName, title: d.DisplayName, platform: 'Epic Games', category: 'pc', type: 'pc', store: 'epic', exe, cwd: d.InstallLocation, installDir: d.InstallLocation, installation: { ...installation, manifestPath, installDir: d.InstallLocation }, tags: ['Epic Games', 'PC'] });
      } catch (err) { epicUncertain = true; warn(manifestPath, err); }
    }
  }
  async function battleNet() {
    if (!context.programData) return;
    const file = join(context.programData, 'Battle.net', 'Agent', 'product.db');
    let records = [];
    try { records = battleNetRecords(await read(file, true)); }
    catch (err) { bnetUncertain = !['ENOENT', 'ENOTDIR'].includes(err.code); }
    for (const app of context.applications || []) {
      const game = BNET.find(g => titleKey(g.title) === titleKey(app.DisplayName));
      if (game && app.InstallLocation) records.push({ ...game, installDir: app.InstallLocation });
    }
    const launcherLocations = (context.applications || []).filter(a => /^(?:battle\.net)$/i.test(a.DisplayName)).map(a => a.InstallLocation).filter(Boolean);
    launcherLocations.push(...[context.programFilesX86, context.programFiles].filter(Boolean).map(d => join(d, 'Battle.net')));
    let launcher = '';
    for (const dir of launcherLocations) if ((await probe(join(dir, 'Battle.net.exe'))).status === 'present') { launcher = join(dir, 'Battle.net.exe'); break; }
    for (const record of records) {
      let gameExe = '';
      for (const relative of record.exes) {
        const evidence = await probe(join(record.installDir, relative));
        if (evidence.status === 'unverified') bnetUnavailable.set(identity({ id: record.id, store: 'battlenet' }), evidence);
        if (evidence.status === 'present') { gameExe = join(record.installDir, relative); break; }
      }
      // Product names/config history and the store executable alone are never evidence.
      if (!gameExe || !launcher) continue;
      add({ id: record.id, title: record.title, store: 'battlenet', type: 'pc', category: 'pc', platform: 'Battle.net', exe: launcher, args: [`--exec=launch ${record.code}`], cwd: record.installDir, installDir: record.installDir, installation: installed('Executável próprio do jogo e cliente Battle.net confirmados', gameExe, { installDir: record.installDir }), tags: ['Battle.net', 'PC'] });
    }
  }

  // Read authoritative game metadata even when a game is not in our small
  // executable catalog. Registry entries only provide search locations.
  async function inspectFolder(dir, suppliedEntries, depth = 0) {
    if (!dir || excluded(dir) || storeOwns(dir) || metadataVisited.has(canonical(dir))) return false;
    metadataVisited.add(canonical(dir));
    if ((await probe(dir, 'directory')).status !== 'present') return false;
    const files = suppliedEntries || await entries(dir);
    let gameEvidence = false;
    const metadataFolders = [ { dir, files } ];
    const support = files.find(e => e.isDirectory() && /^supportInstaller$/i.test(e.name));
    if (support) metadataFolders.push({ dir: join(dir, support.name), files: await entries(join(dir, support.name)) });
    for (const folder of metadataFolders) for (const entry of folder.files.filter(e => e.isFile() && /^goggame-\d+\.info$/i.test(e.name)).slice(0, 32)) {
      const manifestPath = join(folder.dir, entry.name);
      try {
        for (const task of gogInfo(await read(manifestPath), entry.name)) {
          const exe = join(dir, task.relativeExe);
          if (ignoredExe.test(leaf(exe)) || (await probe(exe)).status !== 'present') continue;
          gameEvidence = true;
          add({ id: `gog-${task.id}`, storeId: task.id, store: 'gog', title: task.title, type: 'pc', category: 'pc', platform: 'GOG', exe, args: task.args, cwd: task.relativeCwd ? join(dir, task.relativeCwd) : dir, installDir: dir, installation: installed('Executável e manifesto GOG confirmados', exe, { manifestPath, installDir: dir }), tags: ['GOG', 'PC'] });
          break;
        }
      } catch (err) { warn(manifestPath, err); }
    }
    const gameConfig = files.find(e => e.isFile() && /^MicrosoftGame\.config$/i.test(e.name));
    if (gameConfig && !storeOwns(dir)) {
      const manifestPath = join(dir, gameConfig.name);
      try {
        for (const task of microsoftGame(await read(manifestPath))) {
          const exe = join(dir, task.relativeExe);
          if (ignoredExe.test(leaf(exe)) || (await probe(exe)).status !== 'present') continue;
          const app = (context.applications || []).find(a => a.InstallLocation && canonical(a.InstallLocation) === canonical(dir));
          const title = task.title || app?.DisplayName || leaf(/^content$/i.test(leaf(dir)) ? parent(dir) : dir);
          gameEvidence = true;
          add({ id: `xbox-${idFor(task.id)}`, storeId: task.id, store: 'xbox', title, type: 'pc', category: 'pc', platform: 'Xbox / PC Game Pass', exe, cwd: dir, installDir: dir, installation: installed('Executável e MicrosoftGame.config confirmados', exe, { manifestPath, installDir: dir }), tags: ['Xbox', 'PC'] });
          break;
        }
      } catch (err) { warn(manifestPath, err); }
    }
    if (depth === 0) {
      const content = files.find(e => e.isDirectory() && /^content$/i.test(e.name));
      if (content) gameEvidence = await inspectFolder(join(dir, content.name), null, 1) || gameEvidence;
    }
    return gameEvidence;
  }

  async function hytaleEvidence(client) {
    const evidence = await probe(client);
    if (evidence.status !== 'present') return evidence;
    const gameDir = /^client$/i.test(leaf(parent(client))) ? parent(parent(client)) : parent(client);
    const assetsPath = join(gameDir, 'Assets.zip');
    const assets = await probe(assetsPath);
    if (assets.status === 'unverified') return assets;
    if (assets.status !== 'present') return state('incomplete', 'Cliente Hytale encontrado, mas os arquivos do jogo estão incompletos', { executable: client, installDir: gameDir });
    return installed('Cliente e arquivos do jogo Hytale confirmados', client, { installDir: gameDir, assetsPath });
  }

  async function hytale() {
    for (const base of [context.appData, context.localAppData, context.userProfile].filter(Boolean)) hytaleBases.add(join(base, 'Hytale'));
    for (const game of context.existingGames || []) if (identity(game) === 'pc:hytale') {
      if (game.installation?.executable) hytaleClients.add(game.installation.executable);
      if (game.exe && /^hytaleclient\.exe$/i.test(leaf(game.exe))) hytaleClients.add(game.exe);
      if (game.exe && /^hytale[-_ ]?launcher\.exe$/i.test(leaf(game.exe))) hytaleLaunchers.add(game.exe);
      for (const dir of [game.installDir, game.installation?.installDir, game.exe && parent(game.exe)].filter(Boolean)) hytaleBases.add(dir);
    }
    const queue = [...hytaleBases].map(dir => ({ dir, depth: 0 })), seen = new Set();
    const structural = /^(?:hytale(?: launcher)?|install|release|pre-release|prerelease|snapshot|package|game|launcher|latest|current|client)$/i;
    const staging = /download|staging|partial|backup|^old$|^\.|\.old$/i;
    while (queue.length && seen.size < 512) {
      const current = queue.shift(), key = canonical(current.dir);
      if (seen.has(key) || excluded(current.dir)) continue;
      seen.add(key);
      if ((await probe(current.dir, 'directory')).status !== 'present') continue;
      for (const entry of await entries(current.dir)) {
        const full = join(current.dir, entry.name);
        if (entry.isFile() && /^hytaleclient\.exe$/i.test(entry.name)) hytaleClients.add(full);
        if (entry.isFile() && /^hytale[-_ ]?launcher\.exe$/i.test(entry.name)) hytaleLaunchers.add(full);
        if (current.depth < 9 && !staging.test(entry.name) && (entry.isDirectory() || entry.isSymbolicLink()) && (structural.test(entry.name) || /^(?:install|game|launcher)$/i.test(leaf(current.dir)))) queue.push({ dir: full, depth: current.depth + 1 });
      }
    }
    if (queue.length) warnings.push({ reason: 'Busca Hytale atingiu o limite; adicione a pasta de instalação específica.' });
    const complete = [];
    for (const client of hytaleClients) {
      const evidence = await hytaleEvidence(client);
      if (evidence.status === 'installed') complete.push({ client, evidence });
      else if (evidence.status === 'incomplete') hytaleIncomplete ||= evidence;
    }
    // Prefer the stable/latest channel without assuming every installation uses it.
    complete.sort((a, b) => (/[/\\]latest[/\\]/i.test(b.client) - /[/\\]latest[/\\]/i.test(a.client)) || (/[/\\]release[/\\]/i.test(b.client) - /[/\\]release[/\\]/i.test(a.client)) || a.client.localeCompare(b.client, undefined, { numeric: true }));
    if (!complete.length && !hytaleIncomplete) return;
    const chosen = complete[0], installation = chosen?.evidence || hytaleIncomplete;
    let launcher = '';
    for (const file of hytaleLaunchers) if ((await probe(file)).status === 'present') { launcher = file; break; }
    const exe = launcher || chosen?.client || installation.executable;
    add({ id: 'pc-hytale', title: 'Hytale', type: 'pc', category: 'pc', platform: 'Hytale', exe, cwd: parent(exe), installDir: installation.installDir, args: launcher ? [] : ['--app-dir', installation.installDir], installation, tags: ['Hytale', 'PC'] });
  }

  async function scan(config) {
    const emulators = { ...(config.emulators || {}) };
    await Promise.all([steam(), epic(), battleNet()]);
    const roots = new Map();
    const addRoot = value => { if (value) roots.set(canonical(value), value); };
    for (const root of [...(config.discoveryRoots || []), ...(context.gameRoots || [])]) addRoot(root);
    for (const root of config.discoveryRoots || []) hytaleBases.add(root);
    for (const emu of Object.values(emulators)) {
      if (emu.exe) addRoot(windowsPath(emu.exe) ? path.win32.dirname(emu.exe) : path.dirname(emu.exe));
      for (const dir of emu.romDirs || []) addRoot(dir);
    }
    const registryRoots = new Map();
    for (const app of context.applications || []) {
      const icon = displayIconPath(app.DisplayIcon);
      const locations = [app.InstallLocation, icon && parent(icon)].filter(Boolean);
      for (const dir of locations) registryRoots.set(canonical(dir), dir);
      const known = /steam|battle\.net|diablo|overwatch|warcraft|hearthstone|call.of.duty|epic|riot|league|need.for.speed|hytale|hypixel|eden|ryujinx|citron|desmume|visualboyadvance|pcsx2|mgba/i.test(app.DisplayName) || PC.some(g => titleKey(g.title) === titleKey(app.DisplayName));
      if (known) for (const dir of locations) addRoot(dir);
      if (/hytale|hypixel/i.test(app.DisplayName)) {
        for (const dir of locations) hytaleBases.add(dir);
        if (icon && /^hytale[-_ ]?launcher\.exe$/i.test(leaf(icon))) hytaleLaunchers.add(icon);
      }
    }
    for (const game of context.existingGames || []) {
      if (game.type === 'pc' && game.exe && !/^bnet-/.test(game.id)) addRoot(windowsPath(game.exe) ? path.win32.dirname(game.exe) : path.dirname(game.exe));
    }
    const foundExes = [], romFolders = new Set(), eaDirs = new Set();
    for (const dir of registryRoots.values()) {
      if ((await probe(dir, 'directory')).status !== 'present') continue;
      const files = await entries(dir);
      if (excluded(dir)) continue;
      if (await inspectFolder(dir, files)) addRoot(dir);
      if (files.some(e => e.isDirectory() && /^install$/i.test(e.name))) hytaleBases.add(dir);
      for (const item of files) if (item.isFile()) {
        if (/^hytaleclient\.exe$/i.test(item.name)) hytaleClients.add(join(dir, item.name));
        if (/^hytale[-_ ]?launcher\.exe$/i.test(item.name)) { hytaleLaunchers.add(join(dir, item.name)); hytaleBases.add(dir); }
      }
      if (files.some(e => e.isDirectory() && /^__installer$/i.test(e.name))) eaDirs.add(dir);
      for (const item of files) if (item.isFile() && /\.exe$/i.test(item.name) && (PC.some(g => g.exes.includes(item.name.toLowerCase())) || EMULATORS.some(e => e.names.includes(item.name.toLowerCase())))) foundExes.push(join(dir, item.name));
    }
    const queue = [...roots.values()].map(dir => ({ dir, depth: 0 }));
    while (queue.length && walked < 2500) {
      const current = queue.shift(), key = canonical(current.dir);
      if (visited.has(key) || (context.excludedRoots || []).some(root => key === canonical(root) || key.startsWith(canonical(root) + '/'))) continue;
      if ((await probe(current.dir, 'directory')).status !== 'present') continue;
      visited.add(key); walked++;
      const files = await entries(current.dir);
      await inspectFolder(current.dir, files);
      if (files.some(e => e.isDirectory() && /^install$/i.test(e.name))) hytaleBases.add(current.dir);
      for (const item of files) {
        const full = join(current.dir, item.name);
        if (item.isDirectory() && /hytale|hypixel/i.test(item.name)) hytaleBases.add(full);
        if (item.isFile() && /^hytaleclient\.exe$/i.test(item.name)) hytaleClients.add(full);
        if (item.isFile() && /^hytale[-_ ]?launcher\.exe$/i.test(item.name)) hytaleLaunchers.add(full);
        if (item.isDirectory() && item.name.toLowerCase() === '__installer') eaDirs.add(current.dir);
        if (item.isFile() && /\.exe$/i.test(item.name)) foundExes.push(full);
        if (item.isFile() && /\.(?:nsp|xci|gba|gbc|gb|nds|iso|chd)$/i.test(item.name)) romFolders.add(current.dir);
        if (item.isDirectory() && current.depth < 4 && !skippedDir.test(item.name)) queue.push({ dir: full, depth: current.depth + 1 });
      }
    }
    if (queue.length) warnings.push({ reason: 'Busca de pastas atingiu o limite; adicione a pasta específica em Emuladores ou na lista de locais.' });
    for (const file of foundExes) {
      const name = (windowsPath(file) ? path.win32.basename(file) : path.basename(file)).toLowerCase();
      const model = EMULATORS.find(e => e.names.includes(name));
      if (model && !Object.values(emulators).some(e => canonical(e.exe) === canonical(file))) {
        const id = emulators[model.key] ? `${model.key}-${idFor(file).slice(0, 6)}` : model.key;
        emulators[id] = { ...model, id, exe: file, romDirs: [] };
        delete emulators[id].names; delete emulators[id].key;
      }
      const game = PC.find(g => g.exes.includes(name) && (!g.pathMatch || g.pathMatch.test(file)));
      if (game && (await probe(file)).status === 'present') {
        if (storeOwns(file)) continue;
        if (game.id === 'riot-lol' && /\(pbe\)/i.test(file)) continue;
        const dir = windowsPath(file) ? path.win32.dirname(file) : path.dirname(file);
        add({ id: game.id, title: game.title, type: 'pc', category: 'pc', platform: game.store === 'riot' ? 'Riot Games' : game.store === 'ea' ? 'EA Games' : 'PC Nativo', store: game.store, exe: file, cwd: dir, env: game.env, installDir: dir, installation: installed('Executável do jogo confirmado', file, { installDir: dir }), tags: [game.store || 'PC'] });
      }
    }
    // EA DiP manifests contain the game's title and launch paths. Never execute
    // registry expressions from XML: resolve them against this installation.
    for (const actualDir of eaDirs) {
      const manifestPath = join(actualDir, '__Installer', 'installerdata.xml');
      if ((await probe(manifestPath)).status !== 'present') continue;
      try {
        const xml = await read(manifestPath);
        const title = xml.match(/<gameTitle\b[^>]*locale=["']en_US["'][^>]*>([^<]+)<\/gameTitle>/i)?.[1]?.replace(/[™®]/g, '').trim();
        if (!title) continue;
        const paths = [...xml.matchAll(/<filePath>([^<]+)<\/filePath>/gi)].map(m => m[1].replace(/^\[[^\]]+\]/, ''));
        for (const relative of paths) {
          if (!/\.exe$/i.test(relative) || ignoredExe.test(relative) || /trial/i.test(relative) || windowsPath(relative) || /\.\./.test(relative)) continue;
          const exe = join(actualDir, relative);
          if ((await probe(exe)).status !== 'present') continue;
          add({ id: `ea-${idFor(title)}`, title, store: 'ea', type: 'pc', category: 'pc', platform: 'EA Games', exe, cwd: actualDir, installation: installed('Executável e manifesto EA confirmados', exe, { installDir: actualDir, manifestPath }), tags: ['EA Games', 'PC'] });
          break;
        }
      } catch (err) { warn(manifestPath, err); }
    }
    // Riot's manifest associates real install directories, including custom drives.
    if (context.programData) {
      const manifestPath = join(context.programData, 'Riot Games', 'RiotClientInstalls.json');
      try {
        const data = JSON.parse(await read(manifestPath));
        for (const dir of Object.keys(data.associated_client || {})) {
          const exe = join(dir, 'LeagueClient.exe');
          if (/\(pbe\)/i.test(dir) || (await probe(exe)).status !== 'present') continue;
          add({ id: 'riot-lol', title: 'League of Legends', store: 'riot', type: 'pc', category: 'pc', platform: 'Riot Games', exe, cwd: dir, installDir: dir, installation: installed('Executável e manifesto Riot confirmados', exe, { manifestPath, installDir: dir }), tags: ['Riot Games', 'PC'] });
        }
      } catch {}
    }
    await hytale();
    for (const [id, emu] of Object.entries(emulators)) {
      if ((await probe(emu.exe)).status !== 'present') continue;
      const dirs = new Set([...(emu.romDirs || []), ...romFolders]);
      for (const dir of dirs) for (const item of await entries(dir)) {
        const ext = path.extname(item.name).toLowerCase();
        if (!item.isFile() || !(emu.extensions || []).map(e => e.toLowerCase()).includes(ext)) continue;
        // Compressed ROMs are only accepted inside explicitly configured ROM
        // folders. SDK/install archives elsewhere must never become GBA games.
        if (ext === '.zip' && !(emu.romDirs || []).some(p => canonical(p) === canonical(dir))) continue;
        const combined = /\+\s*\d*\s*(?:dlc|update)|\(\d+G\+\d+U/i.test(item.name);
        const titleId = item.name.match(/\[([0-9a-f]{16})\]/i)?.[1];
        if (emu.category === 'switch' && !combined && (/\b(?:update|dlc|patch)\b/i.test(item.name) || (titleId && !titleId.endsWith('000')))) continue;
        const rom = join(dir, item.name);
        if ((await probe(rom)).status !== 'present') continue;
        if (emu.category === 'switch' && switchUpdate(item.name, (await io.stat(native(rom))).size)) continue;
        let title = path.basename(item.name, ext).replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/_/g, ' ').trim();
        if (/pok[eé]mon.*legends.*z[\s-]*a/i.test(title) || (/^pokeza$/i.test(title) && /pokemon.*z[\s-]*a|legends/i.test(rom))) title = 'Pokémon Legends: Z-A';
        add({ id: `rom-${idFor(rom)}`, title, type: 'emulator', category: emu.category, platform: emu.platform, emulator: id, rom, installation: installed('ROM e emulador confirmados', emu.exe, { rom }), tags: [emu.platform] });
      }
    }
    const games = [...candidates.values()];
    const sources = {};
    for (const game of games) if (game.installation?.status === 'installed') { const source = game.store || game.type; sources[source] = (sources[source] || 0) + 1; }
    return { games, emulators, warnings, visitedDirectories: walked, searchedRoots: roots.size, directoryLimitReached: queue.length > 0, sources };
  }

  async function verify(game, config) {
    const candidate = candidates.get(identity(game));
    if (candidate) {
      if (game.type === 'emulator' && game.emulator) {
        const emu = await probe(config.emulators?.[game.emulator]?.exe);
        if (emu.status !== 'present') return state(emu.status === 'unverified' ? 'unverified' : 'incomplete', 'ROM presente; emulador selecionado ausente ou indisponível', { checkedAt: Date.now() });
      }
      return { ...candidate.installation, checkedAt: Date.now() };
    }
    if (game.type === 'steam') {
      const manifest = game.installation?.manifestPath;
      if (manifest && (await probe(manifest)).status === 'unverified') return state('unverified', 'Biblioteca Steam indisponível', { checkedAt: Date.now() });
      return state(steamUncertain ? 'unverified' : 'missing', steamUncertain ? 'Manifestos Steam indisponíveis ou inválidos' : 'Instalação Steam não encontrada', { checkedAt: Date.now() });
    }
    if (game.store === 'battlenet' || String(game.id).startsWith('bnet-')) {
      if (bnetUnavailable.has(identity(game))) return { ...bnetUnavailable.get(identity(game)), checkedAt: Date.now() };
      const previous = game.installation?.executable;
      if (previous && (await probe(previous)).status === 'unverified') return state('unverified', 'Unidade do jogo Battle.net indisponível', { checkedAt: Date.now() });
      return state(bnetUncertain ? 'unverified' : 'missing', bnetUncertain ? 'Catálogo Battle.net indisponível ou inválido' : 'Arquivos próprios do jogo Battle.net não encontrados', { checkedAt: Date.now() });
    }
    if (game.store === 'epic' && epicUncertain) return state('unverified', 'Manifestos Epic indisponíveis ou inválidos', { checkedAt: Date.now() });
    if (identity(game) === 'pc:hytale') {
      const client = game.installation?.executable || (/^hytaleclient\.exe$/i.test(leaf(game.exe || '')) ? game.exe : '');
      const evidence = client ? await hytaleEvidence(client) : hytaleIncomplete;
      if (evidence && ['installed', 'incomplete', 'unverified'].includes(evidence.status)) return { ...evidence, checkedAt: Date.now() };
      return state('missing', 'Cliente Hytale ausente; o launcher sozinho não confirma o jogo', { checkedAt: Date.now() });
    }
    const target = await probe(game.type === 'emulator' ? game.rom : game.exe);
    if (target.status !== 'present') return { ...target, checkedAt: Date.now() };
    if (game.type === 'emulator') {
      if (game.category === 'switch' || config.emulators?.[game.emulator]?.category === 'switch') {
        try { if (switchUpdate(game.rom, (await io.stat(native(game.rom))).size)) return state('incomplete', 'Arquivo de atualização/DLC; não é um jogo base', { checkedAt: Date.now() }); }
        catch { return state('unverified', 'Não foi possível verificar o arquivo da ROM', { checkedAt: Date.now() }); }
      }
      const emu = await probe(config.emulators?.[game.emulator]?.exe);
      if (emu.status !== 'present') return state(emu.status === 'unverified' ? 'unverified' : 'incomplete', 'ROM presente; emulador ausente ou indisponível', { checkedAt: Date.now() });
    }
    return installed('Arquivo do jogo confirmado', game.exe || config.emulators?.[game.emulator]?.exe, { checkedAt: Date.now() });
  }
  return { scan, verify, probe };
}

module.exports = { createDiscovery, identity, parseVdf, battleNetRecords, switchUpdate, BNET, PC };
