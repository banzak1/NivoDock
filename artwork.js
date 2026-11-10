const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

// Match identities, never the position of an image in a search result.
function normalizeTitle(value = '') {
  let title = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/(?:\.(?:iso|nds|gba|nsp|xci))+$/gi, '')
    .replace(/^\d{4}\s*-\s*/, '')
    .replace(/\b(?:recomp|nativo|atualizado)\b/gi, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (/^pokemon\b/.test(title)) title = title.replace(/\b(?:perfect|mega|version)\b/g, '').trim().replace(/\s+/g, ' ');
  return title;
}

const STEAM_IDS = new Map(Object.entries({
  'forza horizon 6': '2483190', 'runescape dragonwilds': '1374490',
  biped: '1071870', 'biped 2': '2560240', 'vampire survivors': '1794680',
  'diablo iv': '2344520', 'overwatch 2': '2357570',
  'call of duty warzone bo6': '1938090', 'need for speed': '1262540',
  'the elder scrolls v skyrim se': '489830',
}));
const RIOT_COVER = 'https://www.riotgames.com/darkroom/900/f71cfae596f1cecf986b0d8b9aec4ca2:c095db82a08df4596cdeed991ac24c18/league-homepage-productcard-2.png';
const DIABLO_COVER = 'https://blz-contentstack-images.akamaized.net/v3/assets/blt9c12f249ac15c7ec/blte3178c04d93773f1/67ce27f440e6651e27e17582/og_image.webp';
// Cover identity verified at https://www.igdb.com/games/hytale .
// Its publisher CDN currently rejects image downloads with HTTP 403.
const HYTALE_COVER = 'https://images.igdb.com/igdb/image/upload/t_cover_big/cobc4t.webp';
// Curated portrait covers verified against each matching IGDB game entry.
const PORTRAITS = new Map([
  ["Pokémon: Let's Go, Pikachu!", "https://images.igdb.com/igdb/image/upload/t_cover_big/co1zjy.webp", "https://www.igdb.com/games/pokemon-lets-go-pikachu"],
  [
    "Pokémon Legends: Z-A",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co9wzc.webp",
    "https://www.igdb.com/games/pokemon-legends-z-a"
  ],
  [
    "The Legend of Zelda: Breath of the Wild",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co3p2d.webp",
    "https://www.igdb.com/games/the-legend-of-zelda-breath-of-the-wild"
  ],
  [
    "Pokémon Scarlet",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co5sfi.webp",
    "https://www.igdb.com/games/pokemon-scarlet"
  ],
  [
    "Pokémon Violet",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co5sfa.webp",
    "https://www.igdb.com/games/pokemon-violet"
  ],
  [
    "Pokémon Pokopia",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/cobbur.webp",
    "https://www.igdb.com/games/pokemon-pokopia"
  ],
  [
    "Pokémon Brilliant Diamond",
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co3b9t.webp",
    "https://www.igdb.com/games/pokemon-brilliant-diamond"
  ]
].map(([title, url, page]) => [normalizeTitle(title), { url, page }]));
const RETRO = [
  [/\bpokemon\b.*\bfire\s*red\b/, 'Nintendo_-_Game_Boy_Advance', 'Pokemon - FireRed Version (USA, Europe).png'],
  [/\bpokemon\b.*\bemerald\b/, 'Nintendo_-_Game_Boy_Advance', 'Pokemon - Emerald Version (USA, Europe).png'],
  [/\bpokemon\b.*\b(?:soul\s*silver|ss)\b/, 'Nintendo_-_Nintendo_DS', 'Pokemon - SoulSilver Version (USA).png'],
  [/^(?:dragon bal z bt 3|dragon ball(?: z)? budokai tenkaichi 3)$/, 'Sony_-_PlayStation_2', 'Dragon Ball Z - Budokai Tenkaichi 3 (USA) (En,Ja).png'],
  [/^need for speed underground 2$/, 'Sony_-_PlayStation_2', 'Need for Speed - Underground 2 (USA).png'],
  [/^need for speed most wanted black edition$/, 'Sony_-_PlayStation_2', 'Need for Speed - Most Wanted - Black Edition (USA).png'],
];

function requestBytes(address, { timeoutMs = 10000, maxBytes = 12 * 1024 * 1024, redirects = 4 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(address); } catch { return reject(new Error('URL de imagem inválida')); }
    if (url.protocol !== 'https:') return reject(new Error('A fonte deve usar HTTPS'));
    const req = https.get(url, { headers: { 'User-Agent': `NivoDock/${require('./package.json').version}`, 'Accept-Encoding': 'identity' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (!redirects) return reject(new Error('Limite de redirecionamentos excedido'));
        return requestBytes(new URL(res.headers.location, url).href, { timeoutMs, maxBytes, redirects: redirects - 1 }).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Fonte indisponível (HTTP ${res.statusCode})`));
      }
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) res.destroy(new Error('Imagem/resposta acima do limite'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve({ body: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    // Absolute deadline also covers slow responses that keep the socket alive.
    const timer = setTimeout(() => req.destroy(new Error('Tempo limite ao consultar a fonte')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
  });
}

function imageExtension(body, contentType) {
  if (!/^image\//i.test(contentType)) throw new Error('A fonte não retornou uma imagem');
  if (body.length > 24 && body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
  if (body.length > 20 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return '.jpg';
  if (body.length > 20 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  throw new Error('Formato de imagem inválido (PNG, JPEG ou WebP esperado)');
}

function decodeHtml(s = '') {
  return s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&eacute;/g, 'é');
}

function findDekuImage(html, title) {
  const wanted = normalizeTitle(title);
  // Only the image inside a card whose title matches exactly. DLCs/bundles cannot win.
  for (const card of html.split(/<div class=['"]col d-block['"]>/).slice(1)) {
    const name = card.match(/<h6\b[^>]*>([\s\S]*?)<\/h6>/i)?.[1].replace(/<[^>]*>/g, '');
    if (!name || normalizeTitle(decodeHtml(name)) !== wanted) continue;
    return card.match(/https:\/\/cdn\.dekudeals\.com\/images\/[a-zA-Z0-9]+\/w540\.webp/)?.[0] || '';
  }
  return '';
}

function createArtworkService({ publicDir, request = requestBytes } = {}) {
  const cacheDir = path.join(publicDir, 'artwork');
  const pending = new Map();
  async function json(url) {
    const { body } = await request(url, { maxBytes: 2 * 1024 * 1024 });
    return JSON.parse(body.toString('utf8'));
  }
  async function cacheImage(url) {
    const { body, contentType } = await request(url);
    const ext = imageExtension(body, contentType);
    const name = crypto.createHash('sha256').update(body).digest('hex') + ext;
    fs.mkdirSync(cacheDir, { recursive: true });
    const file = path.join(cacheDir, name);
    if (!fs.existsSync(file)) {
      const tmp = `${file}.${process.pid}.tmp`;
      try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, file); }
      finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    }
    return `/artwork/${name}`;
  }
  async function firstImage(urls) {
    for (const url of [...new Set(urls.filter(Boolean))]) {
      try { return { local: await cacheImage(url), remote: url }; } catch {}
    }
    throw new Error('Nenhuma imagem válida disponível nesta fonte');
  }
  async function steam(game, appId) {
    const input = { ids: [{ appid: Number(appId) }], context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } };
    const data = await json('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=' + encodeURIComponent(JSON.stringify(input)));
    const item = data.response?.store_items?.find(i => String(i.appid) === String(appId) && i.success === 1);
    if (!item?.assets || item.type !== 0) throw new Error('Jogo não disponível no catálogo Steam');
    const a = item.assets;
    const asset = key => a[key] && a.asset_url_format
      ? 'https://shared.akamai.steamstatic.com/store_item_assets/' + a.asset_url_format.replace('${FILENAME}', a[key]) : '';
    const cover = await firstImage([asset('library_capsule_2x'), asset('library_capsule'), asset('hero_capsule_2x'), asset('hero_capsule'), asset('main_capsule')]);
    let hero;
    try { hero = await firstImage([asset('library_hero'), asset('raw_page_background'), asset('main_capsule')]); } catch { hero = cover; }
    return { cover: cover.local, hero: hero.local, artwork: { source: 'steam', appId: String(appId), matchedTitle: item.name, coverUrl: cover.remote, heroUrl: hero.remote } };
  }
  async function resolve(game) {
    const title = normalizeTitle(game.title);
    if (!title) throw new Error('Informe o nome do jogo');
    const appId = game.steamAppId || STEAM_IDS.get(title);
    if (appId) return steam(game, appId);
    let remote, source;
    const portrait = PORTRAITS.get(title);
    if (portrait) { remote = portrait.url; source = 'igdb'; }
    else if (title === 'league of legends' || title === 'lol') { remote = RIOT_COVER; source = 'riot'; }
    else if (title === 'diablo iii') { remote = DIABLO_COVER; source = 'blizzard'; }
    else if (title === 'hytale') { remote = HYTALE_COVER; source = 'igdb'; }
    else {
      const retro = RETRO.find(([re]) => re.test(title));
      if (retro) {
        remote = `https://raw.githubusercontent.com/libretro-thumbnails/${retro[1]}/master/Named_Boxarts/${encodeURIComponent(retro[2])}`;
        source = 'libretro';
      }
    }
    if (remote) {
      const cover = await cacheImage(remote);
      return { cover, hero: cover, artwork: { source, matchedTitle: game.title, coverUrl: remote, heroUrl: remote, ...(portrait ? { pageUrl: portrait.page } : {}) } };
    }
    if (game.category !== 'switch' && game.category !== 'retro') {
      const results = await json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=US`);
      const exact = (results.items || []).find(i => normalizeTitle(i.name) === title);
      if (exact) return steam(game, exact.id);
    }
    const { body } = await request(`https://www.dekudeals.com/search?q=${encodeURIComponent(title)}`, { maxBytes: 2 * 1024 * 1024 });
    remote = findDekuImage(body.toString('utf8'), game.title);
    if (!remote) throw new Error('Nenhuma capa com título correspondente. Use uma URL manual.');
    const cover = await cacheImage(remote);
    return { cover, hero: cover, artwork: { source: 'dekudeals', matchedTitle: game.title, coverUrl: remote, heroUrl: remote, ...(portrait ? { pageUrl: portrait.page } : {}) } };
  }
  return {
    async resolve(game) {
      const key = `${normalizeTitle(game.title)}:${game.steamAppId || ''}:${game.category || ''}`;
      if (!pending.has(key)) pending.set(key, resolve(game).finally(() => pending.delete(key)));
      return pending.get(key);
    },
  };
}

module.exports = { createArtworkService, normalizeTitle, findDekuImage, imageExtension, requestBytes };
