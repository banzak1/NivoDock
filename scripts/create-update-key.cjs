// Development tool. Private keys must stay outside the project and ZIPs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const keyFile = process.argv[2] && path.resolve(process.argv[2]);
if (!keyFile || keyFile === root || keyFile.startsWith(root + path.sep)) throw new Error('Informe um arquivo de chave privada fora do projeto.');
if (fs.existsSync(keyFile) || fs.existsSync(path.join(root, 'update-channel.json'))) throw new Error('Uma chave/configuração já existe. Não substitua a identidade de assinatura de instalações existentes.');
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
fs.writeFileSync(keyFile, keys.privateKey, { flag: 'wx', mode: 0o600 });
fs.writeFileSync(path.join(root, 'update-channel.json'), JSON.stringify({ schema: 1, channel: 'stable', manifestUrl: '', publicKey: keys.publicKey }, null, 2) + '\n', { flag: 'wx' });
console.log('Chave criada fora do projeto; somente a chave pública foi adicionada à configuração.');
