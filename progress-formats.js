// Read-only, bounded decoders. No game process, external executable or network.
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { crc32 } = require('./update-core');
class SaveError extends Error { constructor(message, code = 'unsupported') { super(message); this.code = code; } }
class Binary {
  constructor(bytes, little = true) { this.bytes = bytes; this.pos = 0; this.little = little; }
  need(n) { if (!Number.isSafeInteger(n) || n < 0 || this.pos + n > this.bytes.length) throw new SaveError('O arquivo está incompleto ou sendo gravado.', 'incomplete'); }
  take(n) { this.need(n); const b = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  number(method, size) { this.need(size); const n = this.bytes[method](this.pos); this.pos += size; return n; }
  u8() { return this.number('readUInt8',1); }
  u16() { return this.number(this.little ? 'readUInt16LE' : 'readUInt16BE',2); }
  i16() { return this.number(this.little ? 'readInt16LE' : 'readInt16BE',2); }
  u32() { return this.number(this.little ? 'readUInt32LE' : 'readUInt32BE',4); }
  i32() { return this.number(this.little ? 'readInt32LE' : 'readInt32BE',4); }
  f32() { return this.number(this.little ? 'readFloatLE' : 'readFloatBE',4); }
  f64() { return this.number(this.little ? 'readDoubleLE' : 'readDoubleBE',8); }
  i64() { this.need(8); const n = this.bytes[this.little ? 'readBigInt64LE' : 'readBigInt64BE'](this.pos); this.pos += 8; return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : String(n); }
  text(length = this.u16()) { if (length > 65535) throw new SaveError('Texto do save acima do limite.'); return this.take(length).toString('utf8'); }
}
function jsonSave(bytes) {
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\0+$/, '')); }
  catch { throw new SaveError('O save está incompleto ou não contém JSON reconhecido.', 'incomplete'); }
}
function skyrimHeader(bytes) {
  const r = new Binary(bytes);
  if (r.take(13).toString('ascii') !== 'TESV_SAVEGAME') throw new SaveError('Este arquivo não é um save TESV de Skyrim.');
  const size = r.u32(), end = 17 + size;
  if (size < 40 || size > 65536) throw new SaveError('Cabeçalho Skyrim fora dos limites.');
  r.need(size); const version = r.u32();
  if (version !== 12) throw new SaveError('A versão deste save Skyrim ainda não foi validada.');
  const saveNumber = r.u32(), name = r.text(), level = r.u32(), location = r.text(), gameDate = r.text(), race = r.text(), sex = r.u16(), xp = r.f32(), nextXp = r.f32();
  if (r.pos > end || !name || name.length > 128 || level < 1 || level > 100000 || sex > 1) throw new SaveError('Cabeçalho de personagem Skyrim inválido.');
  return { version, saveNumber, name, level, location, gameDate, race, sex, ...(Number.isFinite(xp) && Number.isFinite(nextXp) && xp >= 0 && nextXp > 0 && xp <= 1e12 && nextXp <= 1e12 ? { xp, nextXp } : {}) };
}
function lz4Block(input, length) {
  if (!Number.isInteger(length) || length < 0 || length > 8 * 1024 * 1024) throw new SaveError('Bloco LZ4 acima do limite.');
  const out = Buffer.alloc(length); let i = 0, p = 0;
  const extend = n => { if (n === 15) { let v; do { if (i >= input.length) throw new SaveError('Bloco LZ4 incompleto.', 'incomplete'); v = input[i++]; n += v; } while (v === 255); } return n; };
  while (i < input.length) {
    const token = input[i++], literal = extend(token >>> 4);
    if (i + literal > input.length || p + literal > length) throw new SaveError('Tamanho LZ4 inválido.');
    input.copy(out, p, i, i + literal); i += literal; p += literal;
    if (i === input.length) break;
    if (i + 2 > input.length) throw new SaveError('Bloco LZ4 incompleto.', 'incomplete');
    const offset = input.readUInt16LE(i); i += 2; const match = extend(token & 15) + 4;
    if (!offset || offset > p || p + match > length) throw new SaveError('Referência LZ4 inválida.');
    for (let k = 0; k < match; k++) out[p + k] = out[p + k - offset]; p += match;
  }
  if (p !== length) throw new SaveError('Bloco LZ4 incompleto.', 'incomplete');
  return out;
}
function nmsJson(bytes) {
  if (bytes[0] === 123 || bytes[0] === 239) return jsonSave(bytes);
  const chunks = []; let p = 0, total = 0;
  while (p < bytes.length) {
    if (p + 16 > bytes.length || bytes.readUInt32LE(p) !== 0xfeedA1e5) throw new SaveError('A compressão deste save No Man’s Sky ainda não é reconhecida.');
    const compressed = bytes.readUInt32LE(p + 4), size = bytes.readUInt32LE(p + 8);
    if (!compressed || p + 16 + compressed > bytes.length || (total += size) > 32 * 1024 * 1024 || chunks.length > 128) throw new SaveError('Save No Man’s Sky incompleto ou acima do limite.', 'incomplete');
    chunks.push(lz4Block(bytes.subarray(p + 16, p + 16 + compressed), size)); p += 16 + compressed;
  }
  return jsonSave(Buffer.concat(chunks));
}
function megabonkJson(bytes) {
  if (bytes.toString('utf8',0,3).trimStart().startsWith('{')) return jsonSave(bytes);
  const encoded = bytes.toString('ascii').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4) throw new SaveError('Formato Megabonk não reconhecido.');
  try {
    // Public, game-wide encoding constants for the 1.0.17 format, not account credentials.
    const decoder = crypto.createDecipheriv('aes-256-cbc', Buffer.from('d940840d5ae7c7907b092437bc0c5b44aaf70e273e12d0fb4da2b8c767cc911d','hex'), Buffer.from('37864ef15c24bc0acbc60e3978ef1f06','hex'));
    return jsonSave(Buffer.concat([decoder.update(Buffer.from(encoded,'base64')), decoder.final()]));
  } catch { throw new SaveError('Esta versão do formato Megabonk ainda não é reconhecida.'); }
}
function nbt(bytes, little = false) {
  const r = new Binary(bytes, little); let nodes = 0;
  const count = () => { const n = r.i32(); if (n < 0 || n > 100000) throw new SaveError('Lista NBT acima do limite.'); return n; };
  function value(type, depth = 0) {
    if (depth > 40 || ++nodes > 100000) throw new SaveError('Estrutura NBT acima do limite.');
    switch (type) {
      case 1: { const n = r.u8(); return n > 127 ? n - 256 : n; }
      case 2: return r.i16(); case 3: return r.i32(); case 4: return r.i64(); case 5: return r.f32(); case 6: return r.f64();
      case 7: return r.take(count()); case 8: return r.text();
      case 9: { const subtype = r.u8(), length = count(); if (!subtype && length) throw new SaveError('Lista NBT inválida.'); return Array.from({ length }, () => value(subtype, depth + 1)); }
      case 10: { const result = Object.create(null); for (;;) { const subtype = r.u8(); if (!subtype) return result; const name = r.text(); if (Object.hasOwn(result,name)) throw new SaveError('Chave NBT duplicada.'); result[name] = value(subtype, depth + 1); } }
      case 11: return Array.from({ length: count() }, () => r.i32()); case 12: return Array.from({ length: count() }, () => r.i64());
      default: throw new SaveError('Tipo NBT não reconhecido.');
    }
  }
  if (bytes.length > 8 * 1024 * 1024 || r.u8() !== 10) throw new SaveError('NBT inválido ou acima do limite.');
  r.text(); return value(10);
}
function minecraft(bytes, edition) {
  if (edition === 'bedrock') {
    if (bytes.length < 12 || bytes.readUInt32LE(0) < 3 || bytes.readUInt32LE(0) > 12 || bytes.readUInt32LE(4) !== bytes.length - 8) throw new SaveError('Este arquivo não é level.dat da edição Bedrock suportada.');
    const data = nbt(bytes.subarray(8),true); if (typeof data.LevelName !== 'string') throw new SaveError('Mundo Bedrock não reconhecido.'); return data;
  }
  let decoded; try { decoded = zlib.gunzipSync(bytes, { maxOutputLength: 8 * 1024 * 1024 }); } catch { throw new SaveError('Este arquivo não é level.dat da edição Java suportada.'); }
  const data = nbt(decoded).Data; if (!data || typeof data.LevelName !== 'string') throw new SaveError('Mundo Java não reconhecido.'); return data;
}
// Read one whitelisted language file without loading/extracting the multi-GB archive.
function zipText(file, wanted) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read = (at,n) => { if (!Number.isSafeInteger(at) || at < 0 || n < 0 || at + n > size) throw new SaveError('Índice ZIP inválido.'); const b=Buffer.alloc(n); if (fs.readSync(fd,b,0,n,at)!==n) throw new SaveError('ZIP incompleto.'); return b; };
    const start=Math.max(0,size-65557),tail=read(start,size-start);let e=-1;
    for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){e=i;break;}
    if(e<0)throw new SaveError('Índice ZIP ausente.');
    let entries=tail.readUInt16LE(e+10),centralSize=tail.readUInt32LE(e+12),centralOffset=tail.readUInt32LE(e+16);
    if(entries===65535||centralOffset===0xffffffff||centralSize===0xffffffff){const loc=read(start+e-20,20);if(loc.readUInt32LE(0)!==0x07064b50)throw new SaveError('ZIP64 inválido.');const z=read(Number(loc.readBigUInt64LE(8)),56);if(z.readUInt32LE(0)!==0x06064b50)throw new SaveError('ZIP64 inválido.');entries=Number(z.readBigUInt64LE(32));centralSize=Number(z.readBigUInt64LE(40));centralOffset=Number(z.readBigUInt64LE(48));}
    if(entries>200000||centralSize>64*1024*1024)throw new SaveError('Índice ZIP acima do limite.');
    const central=read(centralOffset,centralSize);let p=0;
    for(let i=0;i<entries;i++){
      if(p+46>central.length||central.readUInt32LE(p)!==0x02014b50)throw new SaveError('Índice ZIP inválido.');
      const n=central.readUInt16LE(p+28),x=central.readUInt16LE(p+30),c=central.readUInt16LE(p+32),end=p+46+n+x+c;if(end>central.length)throw new SaveError('Índice ZIP incompleto.');
      const name=central.subarray(p+46,p+46+n).toString('utf8').replace(/\\/g,'/');
      if(wanted.includes(name)){
        const method=central.readUInt16LE(p+10);let compressed=central.readUInt32LE(p+20),length=central.readUInt32LE(p+24),offset=central.readUInt32LE(p+42);
        for(let t=p+46+n;t+4<=p+46+n+x;){const type=central.readUInt16LE(t),len=central.readUInt16LE(t+2);if(t+4+len>p+46+n+x)throw new SaveError('Extra ZIP inválido.');if(type===1){let q=t+4;const next=()=>{if(q+8>t+4+len)throw new SaveError('Extra ZIP64 inválido.');const v=Number(central.readBigUInt64LE(q));q+=8;return v;};if(length===0xffffffff)length=next();if(compressed===0xffffffff)compressed=next();if(offset===0xffffffff)offset=next();}t+=4+len;}
        if(length>8*1024*1024||compressed>8*1024*1024||central.readUInt16LE(p+8)&1||![0,8].includes(method))throw new SaveError('Idioma ZIP não suportado.');
        const header=read(offset,30);if(header.readUInt32LE(0)!==0x04034b50)throw new SaveError('Entrada ZIP inválida.');const data=read(offset+30+header.readUInt16LE(26)+header.readUInt16LE(28),compressed);
        const content=method===8?zlib.inflateRawSync(data,{maxOutputLength:Math.max(1,length)}):data;if(content.length!==length||crc32(content)!==central.readUInt32LE(p+16))throw new SaveError('Idioma ZIP corrompido.');return content.toString('utf8');
      }
      p=end;
    }
    return '';
  } finally { fs.closeSync(fd); }
}
module.exports={SaveError,Binary,jsonSave,skyrimHeader,lz4Block,nmsJson,megabonkJson,nbt,minecraft,zipText};
