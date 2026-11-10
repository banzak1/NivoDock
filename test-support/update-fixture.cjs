const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { crc32, sha256 } = require('../update-core');
function zip(files, { symlink = '', corruptCRC = false } = {}) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, raw] of files) {
    const bytes = Buffer.from(raw), text = Buffer.from(name), data = zlib.deflateRawSync(bytes), crc = crc32(bytes) ^ (corruptCRC ? 1 : 0);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(8,8); local.writeUInt32LE(crc >>> 0,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(bytes.length,22); local.writeUInt16LE(text.length,26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,6); central.writeUInt16LE(8,10); central.writeUInt32LE(crc >>> 0,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(bytes.length,24); central.writeUInt16LE(text.length,28); central.writeUInt32LE(name===symlink ? (0xa000 << 16) >>> 0 : 0,38); central.writeUInt32LE(offset,42);
    const full = Buffer.concat([local,text,data]); locals.push(full); centrals.push(Buffer.concat([central,text])); offset += full.length;
  }
  const central = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(central.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}
function keys() { const pair = crypto.generateKeyPairSync('rsa',{modulusLength:2048}); return { privateKey:pair.privateKey, policy:{schema:1,channel:'stable',manifestUrl:'https://updates.example/latest.json',publicKey:pair.publicKey.export({type:'spki',format:'pem'})} }; }
function envelope(release, privateKey) { const payload=Buffer.from(JSON.stringify(release)); return Buffer.from(JSON.stringify({payload:payload.toString('base64'),signature:crypto.sign('sha256',payload,privateKey).toString('base64')})); }
function artifact(version='1.5.1', overrides={}, extra=[]) {
  const files=new Map(Object.entries({'server.js':'server code','package.json':JSON.stringify({version}),'VERSION':version,'node.exe':'MZ-test-runtime','NivoDock.exe':'MZ-test-host','update-core.js':'core','update-worker.js':'worker','updater.js':'updater','update-channel.json':'{}','public/index.html':'<h1>NivoDock</h1>',...overrides}).map(([n,b])=>[n,Buffer.from(b)]));
  const manifest={version,platform:'win-x64',files:[...files].map(([name,b])=>({path:name,size:b.length,sha256:sha256(b)}))};
  const entries=[...files].map(([n,b])=>['NivoDock/'+n,b]);entries.push(['NivoDock/build-manifest.json',Buffer.from(JSON.stringify(manifest))],...extra);
  const buffer=zip(entries);
  const release={schema:1,product:'NivoDock',channel:'stable',platform:'win-x64',version,minimumVersion:'1.5.0',url:'https://updates.example/NivoDock.zip',size:buffer.length,sha256:sha256(buffer),notes:['Um recurso novo.']};
  return {buffer,release,files};
}
module.exports={zip,keys,envelope,artifact};
