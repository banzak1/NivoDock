// Shared by the launcher, isolated update worker and release tooling.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const MAX_PACKAGE = 256 * 1024 * 1024, MAX_EXPANDED = 512 * 1024 * 1024;
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(value)) throw new Error('Versão de atualização inválida');
  const parts = value.split('.').map(Number);
  if (parts.some(n => n > 65535)) throw new Error('Versão acima do limite');
  return parts;
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw new Error('Atualizações exigem um endereço HTTPS sem credenciais');
  return url.href;
}
function releaseInfo(envelope, policy) {
  if (!Buffer.isBuffer(envelope)) envelope = Buffer.from(envelope);
  if (envelope.length > 128 * 1024) throw new Error('Manifesto de atualização acima do limite');
  const signed = JSON.parse(envelope.toString('utf8').replace(/^\uFEFF/, ''));
  for (const field of ['payload','signature']) if (typeof signed[field] !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(signed[field]) || !signed[field]) throw new Error('Assinatura de atualização inválida');
  const payload = Buffer.from(signed.payload, 'base64');
  const key = crypto.createPublicKey(policy.publicKey);
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 2048 || !crypto.verify('sha256', payload, { key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(signed.signature, 'base64'))) throw new Error('A assinatura da atualização não é válida');
  const release = JSON.parse(payload.toString('utf8'));
  if (release.schema !== 1 || release.product !== 'NivoDock' || release.channel !== policy.channel || release.platform !== 'win-x64') throw new Error('Atualização incompatível com este aplicativo');
  versionParts(release.version); versionParts(release.minimumVersion);
  if (compareVersions(release.minimumVersion, release.version) > 0 || !Number.isSafeInteger(release.size) || release.size <= 0 || release.size > MAX_PACKAGE || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('Metadados de atualização inválidos');
  release.url = httpsUrl(release.url);
  if (!Array.isArray(release.notes) || release.notes.length > 20 || release.notes.some(n => typeof n !== 'string' || n.length > 1000)) throw new Error('Notas de atualização inválidas');
  return release;
}
function cleanPath(value) {
  if (typeof value !== 'string' || value.length > 240 || /[\0:]/.test(value) || /^[\\/]/.test(value)) throw new Error('Caminho inseguro no pacote');
  const name = value.replace(/\\/g, '/');
  if (name.split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) throw new Error('Caminho inseguro no pacote');
  return name;
}
function appPath(value) {
  const name = cleanPath(value);
  const root = /^(?:[a-z][a-z0-9-]*\.js|package\.json|VERSION|update-channel\.json|build-manifest\.json|NODE-LICENSE\.txt|LEIA-ME\.txt|Iniciar Launcher\.bat|NivoDock\.exe|Instalar-NivoDock\.exe|node\.exe)$/;
  if (!root.test(name) && !['public/index.html', 'public/update-ui.js'].includes(name) && !/^public\/brand\/[a-zA-Z0-9_-]+\.(?:svg|png|ico|html)$/.test(name)) throw new Error('O pacote contém um arquivo fora da aplicação');
  return name;
}
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(buffer) { let c = 0xffffffff; for (const b of buffer) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipEntries(buffer) {
  if (buffer.length < 22 || buffer.length > MAX_PACKAGE) throw new Error('ZIP inválido ou acima do limite');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  if (end < 0) throw new Error('ZIP incompleto');
  const count = buffer.readUInt16LE(end + 10), centralSize = buffer.readUInt32LE(end + 12), central = buffer.readUInt32LE(end + 16);
  if (!count || count > 512 || buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count || central + centralSize !== end) throw new Error('Estrutura ZIP não suportada');
  let position = central, total = 0; const files = new Map(), names = new Set(), ranges = [];
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || buffer.readUInt32LE(position) !== 0x02014b50) throw new Error('Diretório ZIP inválido');
    const flags = buffer.readUInt16LE(position + 8), method = buffer.readUInt16LE(position + 10), crc = buffer.readUInt32LE(position + 16), compressed = buffer.readUInt32LE(position + 20), size = buffer.readUInt32LE(position + 24);
    const length = buffer.readUInt16LE(position + 28), extra = buffer.readUInt16LE(position + 30), comment = buffer.readUInt16LE(position + 32), offset = buffer.readUInt32LE(position + 42);
    const next = position + 46 + length + extra + comment;
    if (next > end || !length || flags & 1 || ![0,8].includes(method) || buffer.readUInt16LE(position + 34) || ((buffer.readUInt32LE(position + 38) >>> 16) & 0xf000) === 0xa000) throw new Error('Entrada ZIP não suportada');
    const rawName = buffer.subarray(position + 46, position + 46 + length), text = rawName.toString('utf8'), directory = /[\\/]$/.test(text), name = cleanPath(directory ? text.slice(0, -1) : text);
    if (names.has(name.toLowerCase())) throw new Error('Caminhos duplicados no ZIP');
    names.add(name.toLowerCase()); total += size;
    if (total > MAX_EXPANDED || offset + 30 > central || buffer.readUInt32LE(offset) !== 0x04034b50 || buffer.readUInt16LE(offset + 6) !== flags || buffer.readUInt16LE(offset + 8) !== method) throw new Error('Conteúdo ZIP inválido ou acima do limite');
    const localLength = buffer.readUInt16LE(offset + 26), localExtra = buffer.readUInt16LE(offset + 28), start = offset + 30 + localLength + localExtra;
    if (!buffer.subarray(offset + 30, offset + 30 + localLength).equals(rawName) || start + compressed > central) throw new Error('Caminho ou tamanho ZIP divergente');
    ranges.push([offset, start + compressed]);
    if (!directory) {
      const data = buffer.subarray(start, start + compressed);
      const content = method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, size) }) : data;
      if (content.length !== size || crc32(content) !== crc) throw new Error('Conteúdo ZIP corrompido');
      files.set(name, content);
    } else if (size || compressed) throw new Error('Diretório ZIP com conteúdo inesperado');
    position = next;
  }
  ranges.sort((a,b) => a[0] - b[0]);
  if (position !== end || ranges.some((r,i) => i && r[0] < ranges[i-1][1])) throw new Error('Entradas ZIP sobrepostas');
  return files;
}
function packageFiles(buffer, release) {
  if (buffer.length !== release.size || sha256(buffer) !== release.sha256) throw new Error('O pacote baixado não corresponde à assinatura publicada');
  const zipped = zipEntries(buffer), manifests = [...zipped.keys()].filter(n => n.endsWith('/build-manifest.json'));
  if (manifests.length !== 1) throw new Error('Manifesto do pacote ausente ou duplicado');
  const prefix = manifests[0].slice(0, -'build-manifest.json'.length), manifestBuffer = zipped.get(manifests[0]);
  if (manifestBuffer.length > 128 * 1024) throw new Error('Manifesto do pacote acima do limite');
  const manifest = JSON.parse(manifestBuffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (manifest.version !== release.version || manifest.platform !== 'win-x64' || !Array.isArray(manifest.files) || manifest.files.length > 256) throw new Error('Manifesto do pacote incompatível');
  const result = new Map(), expected = new Set();
  for (const file of manifest.files) {
    const name = appPath(file.path);
    if (name === 'build-manifest.json' || expected.has(name.toLowerCase()) || !Number.isSafeInteger(file.size) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Lista de arquivos inválida');
    expected.add(name.toLowerCase()); const content = zipped.get(prefix + name);
    if (!content || content.length !== file.size || sha256(content) !== file.sha256) throw new Error('Arquivo divergente no pacote: ' + name);
    result.set(name, content);
  }
  if (zipped.size !== result.size + 1) throw new Error('Arquivos adicionais no pacote');
  for (const name of ['server.js','package.json','VERSION','node.exe','NivoDock.exe','update-core.js','update-worker.js','updater.js','update-channel.json','public/index.html']) if (!result.has(name)) throw new Error('Pacote incompleto: ' + name);
  if (JSON.parse(result.get('package.json')).version !== release.version || result.get('VERSION').toString().trim() !== release.version) throw new Error('Versão interna do pacote divergente');
  result.set('build-manifest.json', manifestBuffer); return result;
}
function safePath(root, relative) {
  const result = path.join(root, cleanPath(relative));
  let current = path.resolve(root);
  if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Pasta da aplicação não pode ser um link durante a atualização');
  for (const segment of cleanPath(relative).split('/')) {
    current = path.join(current, segment);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Link encontrado no destino da atualização'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  return result;
}
function atomicFile(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try { fs.renameSync(temporary, file); } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
const writeJson = (file, data) => atomicFile(file, Buffer.from(JSON.stringify(data, null, 2)));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
module.exports = { MAX_PACKAGE, sha256, versionParts, compareVersions, httpsUrl, releaseInfo, cleanPath, appPath, crc32, zipEntries, packageFiles, safePath, atomicFile, writeJson, readJson };
