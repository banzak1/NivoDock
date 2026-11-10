const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createArtworkService, normalizeTitle, findDekuImage, imageExtension } = require('../artwork');

// Small real PNG (1x1) as a deterministic image transport fixture.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
function service(t, request) {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banzak-art-'));
  t.after(() => fs.rmSync(publicDir, { recursive: true, force: true }));
  return { publicDir, api: createArtworkService({ publicDir, request }) };
}
function steamItem(id, name) {
  return { appid: id, success: 1, type: 0, name, assets: {
    asset_url_format: `steam/apps/${id}/${'${FILENAME}'}?t=123`,
    library_capsule: 'current-hash/library_capsule.jpg', library_hero: 'hero-hash/library_hero.jpg',
  } };
}
test('normalizes ROM numbers and localization, preserving sequel numbers', () => {
  assert.equal(normalizeTitle('4840 - Pokémon - SoulSilver Version (PT-BR).nds'), 'pokemon soulsilver');
  assert.notEqual(normalizeTitle('Biped'), normalizeTitle('Biped 2'));
  assert.notEqual(normalizeTitle('Forza Horizon 5'), normalizeTitle('Forza Horizon 6'));
  assert.equal(normalizeTitle('Mega Man 2'), 'mega man 2');
  assert.equal(normalizeTitle("Pokémon: Let's Go, Pikachu!"), normalizeTitle('Pokemon Lets Go Pikachu'));
  assert.equal(normalizeTitle('Pokémon: Let’s Go, Pikachu!'), normalizeTitle('Pokemon Lets Go Pikachu'));
});
test('Deku search rejects bundles and unrelated first images', () => {
  const html = `<img src="https://cdn.dekudeals.com/images/unrelated/w540.webp">
    <div class='col d-block'><img src='https://cdn.dekudeals.com/images/dlc/w540.webp'><h6>Pokémon Scarlet Bundle (Game + DLC)</h6></div>
    <div class='col d-block'><img src='https://cdn.dekudeals.com/images/correct/w540.webp'><h6>Pokémon Scarlet</h6></div>`;
  assert.equal(findDekuImage(html, 'Pokemon Scarlet'), 'https://cdn.dekudeals.com/images/correct/w540.webp');
  assert.equal(findDekuImage(html, 'Pokemon Violet'), '');
});
test('HTML error pages cannot be cached as images', () => {
  assert.throws(() => imageExtension(Buffer.from('<html>error</html>'), 'image/png'));
  assert.throws(() => imageExtension(png, 'text/html'));
  assert.equal(imageExtension(png, 'image/png'), '.png');
});
test('Steam uses current hashed asset paths and caches real image bytes', async t => {
  const urls = [];
  const { publicDir, api } = service(t, async url => {
    urls.push(url);
    return url.includes('GetItems')
      ? { body: Buffer.from(JSON.stringify({ response: { store_items: [steamItem(2483190, 'Forza Horizon 6')] } })) }
      : { body: png, contentType: 'image/png' };
  });
  const art = await api.resolve({ title: 'Forza Horizon 6', category: 'pc' });
  assert.equal(art.artwork.appId, '2483190');
  assert.match(art.artwork.coverUrl, /current-hash\/library_capsule\.jpg/);
  assert.match(art.artwork.heroUrl, /hero-hash\/library_hero\.jpg/);
  assert.ok(fs.readFileSync(path.join(publicDir, art.cover)).equals(png));
  assert.ok(!urls.some(u => u.includes('header.jpg')));
});
test('Biped resolves its own ID instead of Biped 2', async t => {
  const { api } = service(t, async url => {
    if (!url.includes('GetItems')) return { body: png, contentType: 'image/png' };
    const input = JSON.parse(new URL(url).searchParams.get('input_json'));
    assert.equal(input.ids[0].appid, 1071870);
    return { body: Buffer.from(JSON.stringify({ response: { store_items: [steamItem(1071870, 'Biped')] } })) };
  });
  assert.equal((await api.resolve({ title: 'Biped' })).artwork.appId, '1071870');
});
test('Steam search accepts only an exact identity, even when a sequel comes first', async t => {
  const { api } = service(t, async url => {
    if (url.includes('storesearch')) return { body: Buffer.from(JSON.stringify({ items: [{ id: 2, name: 'Example Game 2' }, { id: 1, name: 'Example Game' }] })) };
    if (url.includes('GetItems')) {
      assert.equal(JSON.parse(new URL(url).searchParams.get('input_json')).ids[0].appid, 1);
      return { body: Buffer.from(JSON.stringify({ response: { store_items: [steamItem(1, 'Example Game')] } })) };
    }
    return { body: png, contentType: 'image/png' };
  });
  assert.equal((await api.resolve({ title: 'Example Game' })).artwork.appId, '1');
});
test('a failed hero download falls back to the verified cover', async t => {
  const { api } = service(t, async url => {
    if (url.includes('GetItems')) return { body: Buffer.from(JSON.stringify({ response: { store_items: [steamItem(1, 'Game')] } })) };
    if (url.includes('library_hero')) throw new Error('offline');
    return { body: png, contentType: 'image/png' };
  });
  const art = await api.resolve({ title: 'Game', steamAppId: '1' });
  assert.equal(art.hero, art.cover);
});
test('LoL uses Riot artwork without looking for similarly named Steam games', async t => {
  const { api } = service(t, async url => {
    assert.match(url, /^https:\/\/www\.riotgames\.com\//);
    return { body: png, contentType: 'image/png' };
  });
  assert.equal((await api.resolve({ title: 'League of Legends' })).artwork.source, 'riot');
});
test('Hytale uses the cover verified against its exact IGDB entry', async t => {
  const { api } = service(t, async url => {
    assert.match(url, /^https:\/\/images\.igdb\.com\//);
    return { body: png, contentType: 'image/png' };
  });
  assert.equal((await api.resolve({ title: 'Hytale' })).artwork.source, 'igdb');
});
test('Nintendo PC and emulated editions share the matching portrait, retaining its source page', async t => {
  const { api } = service(t, async url => {
    assert.match(url, /images\.igdb\.com\/.*co9wzc\.webp$/);
    return { body: png, contentType: 'image/png' };
  });
  const pc = await api.resolve({ title: 'Pokémon Legends: Z-A (PC Nativo)', category: 'pc' });
  const emulated = await api.resolve({ title: 'Pokemon Legends Z-A', category: 'switch' });
  assert.equal(pc.cover, emulated.cover);
  assert.equal(pc.artwork.pageUrl, 'https://www.igdb.com/games/pokemon-legends-z-a');
});
test('localized PC ports search the canonical title without PC suffixes', async t => {
  const { api } = service(t, async url => {
    if (url.includes('storesearch')) return { body: Buffer.from('{"items":[]}') };
    if (url.includes('dekudeals.com/search')) {
      assert.equal(new URL(url).searchParams.get('q'), 'pokemon example');
      return { body: Buffer.from("<div class='col d-block'><img src='https://cdn.dekudeals.com/images/za/w540.webp'><h6>Pokémon Example</h6></div>") };
    }
    return { body: png, contentType: 'image/png' };
  });
  assert.equal((await api.resolve({ title: 'Pokémon Example (PC Nativo)', category: 'pc' })).artwork.source, 'dekudeals');
});
test('unmatched search results leave the game unresolved', async t => {
  const { api } = service(t, async url => ({ body: Buffer.from(url.includes('storesearch') ? '{"items":[{"id":2,"name":"Unrelated Game"}]}' : '<html></html>') }));
  await assert.rejects(api.resolve({ title: 'Missing Game' }), /Nenhuma capa/);
});
