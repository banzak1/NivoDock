const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function atomicWriteJson(file, value) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tmp, file);
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}

function buildGame(payload, existing, emulators, art = {}) {
  const type = payload.type || existing?.type || 'pc';
  if (!['pc', 'steam', 'emulator'].includes(type)) throw new Error('Tipo de jogo inválido');
  const title = (payload.title ?? existing?.title ?? '').trim();
  if (!title) throw new Error('Informe o nome do jogo');
  const emulator = payload.emulator ?? existing?.emulator;
  const emu = type === 'emulator' ? emulators[emulator] : null;
  if (type === 'emulator' && !emu) throw new Error('Emulador não encontrado');
  const game = {
    ...existing,
    id: existing?.id || `custom-${crypto.randomUUID()}`,
    title, type,
    subtitle: payload.subtitle ?? existing?.subtitle ?? (emu ? `${emu.platform} • ${emu.name}` : 'PC Nativo • Standalone'),
    platform: payload.platform ?? existing?.platform ?? emu?.platform ?? 'PC Nativo',
    category: payload.category ?? existing?.category ?? emu?.category ?? 'pc',
    accent: payload.accent ?? existing?.accent ?? (emu ? '#06b6d4' : '#10b981'),
    favorite: payload.favorite ?? existing?.favorite ?? false,
    playCount: existing?.playCount ?? 0,
    lastPlayed: existing?.lastPlayed ?? 0,
    tags: payload.tags ?? existing?.tags ?? [emu?.platform || 'PC Nativo'],
    ...art,
  };
  if (type === 'emulator') {
    game.emulator = emulator;
    game.rom = payload.targetPath ?? existing?.rom;
  } else if (type === 'pc') game.exe = payload.targetPath ?? existing?.exe;
  if (type !== 'steam' && !(type === 'emulator' ? game.rom : game.exe)) throw new Error('Informe o arquivo do jogo');
  if (existing && (existing.exe !== game.exe || existing.rom !== game.rom || existing.emulator !== game.emulator)) {
    game.installation = { status: 'unverified', reason: 'Caminho alterado; aguardando verificação da instalação' };
  }
  if (payload.savePath !== undefined) game.savePath = payload.savePath || undefined;
  if (payload.cwd !== undefined) game.cwd = payload.cwd || undefined;
  if (payload.cover !== undefined) {
    const changed = payload.cover !== (existing?.cover || '');
    if (payload.cover) {
      if (!/^https?:\/\//i.test(payload.cover) && !/^\/artwork\/[a-f0-9]{64}\.(?:jpg|png|webp)$/.test(payload.cover)) throw new Error('URL da capa inválida');
      game.cover = payload.cover;
      if (changed) { game.hero = payload.hero || payload.cover; game.coverLocked = true; game.artwork = { source: 'manual' }; }
    } else if (!art.cover) { game.cover = ''; game.hero = ''; game.coverLocked = false; game.artwork = undefined; }
  }
  if (payload.coverLocked !== undefined) game.coverLocked = Boolean(payload.coverLocked);
  return game;
}

function mergeDiscoveredGames(latest, discovered, initialIds) {
  const before = new Set(initialIds);
  const merged = [...latest];
  for (const game of discovered) {
    if (before.has(game.id)) continue;
    const duplicate = merged.some(g => g.id === game.id ||
      (game.rom && g.rom?.toLowerCase() === game.rom.toLowerCase()) ||
      (game.exe && g.exe?.toLowerCase() === game.exe.toLowerCase() &&
        JSON.stringify(g.args || []) === JSON.stringify(game.args || [])));
    if (!duplicate) merged.push(game);
  }
  return merged;
}

async function reconcileCatalog(latest, snapshot, discovery, config, verify) {
  const { identity } = require('./discovery');
  const before = new Map(snapshot.map(g => [g.id, g]));
  const candidates = new Map(discovery.map(g => [identity(g), g]));
  const targetKey = g => g.type === 'pc' && g.exe ? `${require('./environment').canonical(g.exe)}:${JSON.stringify(g.args || [])}` : '';
  const byTarget = new Map(discovery.filter(g => targetKey(g)).map(g => [targetKey(g), g]));
  const candidateFor = g => candidates.get(identity(g)) || (targetKey(g) && byTarget.get(targetKey(g)));
  // A manually added game can later acquire an authoritative store identity.
  // Match its exact launch target too, preserving edits and concurrent deletions.
  const originalKeys = new Set(snapshot.flatMap(g => [identity(g), ...(candidateFor(g) ? [identity(candidateFor(g))] : [])]));
  const seen = new Set(latest.flatMap(g => [identity(g), ...(candidateFor(g) ? [identity(candidateFor(g))] : [])]));
  const counts = { installed: 0, missing: 0, incomplete: 0, unverified: 0, addedCount: 0, addedTitles: [] };
  const games = [];
  for (const current of latest) {
    const game = { ...current };
    const candidate = candidateFor(game);
    const previous = before.get(game.id);
    const changedTarget = previous && (previous.exe !== game.exe || previous.rom !== game.rom || previous.emulator !== game.emulator);
    if (candidate && !changedTarget) {
      for (const field of ['installDir', 'store', 'storeId']) if (candidate[field]) game[field] = candidate[field];
      if (game.args === undefined && candidate.args) game.args = candidate.args;
      // A relocated install adopts the verified location while retaining user
      // preferences, arguments, save paths, identity and all play history.
      if (candidate.exe && (!game.exe || (previous && previous.exe === game.exe))) {
        const { canonical } = require('./environment');
        const oldDir = game.exe && (/^[a-z]:/i.test(game.exe) ? path.win32.dirname(game.exe) : path.dirname(game.exe));
        if (!game.cwd || canonical(game.cwd) === canonical(oldDir)) game.cwd = candidate.cwd || (/^[a-z]:/i.test(candidate.exe) ? path.win32.dirname(candidate.exe) : path.dirname(candidate.exe));
        game.exe = candidate.exe;
      }
    }
    let installation = changedTarget ? { status: 'unverified', reason: 'Caminho alterado durante a busca; aguardando nova verificação', checkedAt: Date.now() } : await verify(game, config);
    const comparable = value => { const { checkedAt, ...rest } = value || {}; return JSON.stringify(rest); };
    if (comparable(installation) === comparable(current.installation)) installation = current.installation;
    game.installation = installation;
    games.push(game); counts[installation.status]++;
  }
  for (const [key, candidate] of candidates) {
    if (seen.has(key) || originalKeys.has(key)) continue;
    const game = { ...candidate, installation: await verify(candidate, config) };
    games.push(game); seen.add(key); counts[game.installation.status]++;
    counts.addedCount++; counts.addedTitles.push(game.title);
  }
  return { games, ...counts };
}

module.exports = { atomicWriteJson, buildGame, mergeDiscoveredGames, reconcileCatalog };
