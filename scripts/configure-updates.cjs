const path = require('node:path');
const { httpsUrl, readJson, writeJson } = require('../update-core');
const file = path.join(__dirname, '..', 'update-channel.json');
const address = process.argv[2];
if (!address) throw new Error('Use node scripts/configure-updates.cjs HTTPS_DO_MANIFESTO ou --disable.');
const policy = readJson(file);
policy.manifestUrl = address === '--disable' ? '' : httpsUrl(address);
writeJson(file, policy);
console.log(policy.manifestUrl ? 'Canal configurado. Gere novamente o pacote e assine a publicação antes de distribuir.' : 'Consulta online desativada.');
