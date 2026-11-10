const fs = require('node:fs');
const path = require('node:path');
const { native, join, windowsPath } = require('./environment');

const cache = new Map();
function children(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).slice(0, 256); } catch { return []; }
}
function inferTitleId(game) {
  const explicit = game.titleId || game.rom?.match(/\[([0-9a-f]{16})\]/i)?.[1];
  if (explicit) return explicit.toUpperCase();
  const title = game.title || '';
  if (/legends.*z[\s-]*a/i.test(title)) return '0100F43008C44000';
  if (/breath of the wild/i.test(title)) return '01007EF00011E000';
  if (/let.?s\s*go.*pikachu/i.test(title)) return '010003F003A34000';
  if (/let.?s\s*go.*eevee/i.test(title)) return '0100187003A36000';
  return '';
}
function getSaveLocations(game, env, config = {}, catalog = []) {
  const key = JSON.stringify([game.id, game.rom, game.exe, game.savePath, env.userProfile, config.emulators]);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.values;
  const values = [];
  const add = (file, label) => { if (file) values.push({ path: native(file), label }); };
  add(game.savePath, 'Save selecionado');
  const titleId = inferTitleId(game);
  const emulatorDirs = Object.values(config.emulators || {}).filter(e => e.exe).map(e => path.dirname(native(e.exe)));
  const dirname = value => windowsPath(value) ? path.win32.dirname(value) : path.dirname(value);
  if (/brilliant\s*diamond|shining\s*pearl/i.test(game.title || '') && env.userProfile) {
    const root = native(join(env.userProfile, 'AppData', 'LocalLow', 'DefaultCompany', 'Dpr', 'nn', 'save'));
    for (const id of children(root).filter(d => d.isDirectory())) {
      for (const user of children(path.join(root, id.name)).filter(d => d.isDirectory())) add(path.join(root, id.name, user.name, 'SaveData.bin'), 'Brilliant Diamond • SaveData.bin');
    }
  }
  if (titleId) {
    const ryujinxRoots = new Set([...(env.appData ? [native(join(env.appData, 'Ryujinx', 'bis', 'user', 'save'))] : []), ...emulatorDirs.map(d => path.join(d, 'portable', 'bis', 'user', 'save'))]);
    for (const root of ryujinxRoots) for (const slot of children(root).filter(d => d.isDirectory())) {
      const dir = path.join(root, slot.name);
      let match = false;
      for (const name of ['ExtraData0', 'ExtraData1']) {
        try { const b = fs.readFileSync(path.join(dir, name)); if (b.length >= 8 && b.readBigUInt64LE(0).toString(16).padStart(16, '0').toUpperCase() === titleId) match = true; } catch {}
      }
      if (!match) continue;
      for (const user of children(dir).filter(d => d.isDirectory())) {
        for (const name of ['main', 'backup', 'savedata.bin']) add(path.join(dir, user.name, name), `Ryujinx • Slot ${slot.name} • ${name}`);
      }
    }
    const nands = new Set(emulatorDirs.map(d => path.join(d, 'user', 'nand', 'user', 'save')));
    if (env.appData) for (const app of ['Eden', 'eden', 'yuzu', 'Citron', 'suyu', 'Sudachi']) nands.add(native(join(env.appData, app, 'nand', 'user', 'save')));
    for (const root of nands) for (const save of children(root).filter(d => d.isDirectory())) {
      const saveDir = path.join(root, save.name);
      for (const user of children(saveDir).filter(d => d.isDirectory())) {
        const dir = path.join(saveDir, user.name, titleId);
        for (const name of ['main', 'savedata.bin']) add(path.join(dir, name), `Switch NAND • ${titleId} • ${name}`);
      }
    }
  }
  if (titleId === '0100F43008C44000') {
    const ports = [game, ...catalog.filter(g => g.type === 'pc' && /legends.*z[\s-]*a/i.test(g.title || ''))];
    for (const port of ports) if (port.exe) add(join(dirname(port.exe), 'save', 'save_0', 'main'), 'PC Port • save_0/main');
  }
  if (game.rom) {
    const rom = native(game.rom), dir = path.dirname(rom), base = path.basename(rom, path.extname(rom));
    for (const file of [`${base}.sav`, `${base}.dsv`, `${base}-01.sgm`, `${base}1.sgm`, `${base}.sgm`, `${base}.ss1`]) add(path.join(dir, file));
    for (const ext of ['sav', 'dsv']) add(path.join(dir, '..', 'Battery', `${base}.${ext}`));
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)|\[[^\]]*\]/g, '').toLowerCase().replace(/\b(?:perfect|mega|version)\b/g, '').replace(/[^a-z0-9]/g, '').replace('pokemonss', 'pokemonsoulsilver');
    const dirs = new Set([dir, ...Object.values(config.emulators || {}).filter(e => e.category === game.category && e.platform === game.platform).flatMap(e => e.romDirs || []).map(native)]);
    for (const root of [...dirs]) dirs.add(path.join(root, '..', 'Battery'));
    for (const root of dirs) for (const file of children(root)) {
      if (file.isFile() && /\.(?:sav|dsv|sgm|ss1)$/i.test(file.name) && normalize(path.basename(file.name, path.extname(file.name))) === normalize(base)) add(path.join(root, file.name), 'Save ao lado da ROM');
    }
  }
  const seen = new Set();
  const result = values.filter(c => { if (seen.has(c.path)) return false; seen.add(c.path); return true; });
  if (cache.size > 256) cache.clear();
  cache.set(key, { until: Date.now() + 2000, values: result });
  return result;
}
module.exports = { getSaveLocations, inferTitleId };
