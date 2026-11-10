const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { sha256, httpsUrl, packageFiles, releaseInfo, readJson, writeJson, versionParts } = require('../update-core');
function signUpdate({ packagePath, packageUrl, privateKeyPath, output, notes = [], minimumVersion = '1.5.0' }) {
  const root = path.resolve(__dirname, '..'), policy = readJson(path.join(root, 'update-channel.json'));
  if (!policy.manifestUrl) throw new Error('Configure primeiro o endereço HTTPS do canal em update-channel.json e gere o pacote novamente.');
  httpsUrl(policy.manifestUrl); versionParts(minimumVersion);
  if (path.resolve(output) === path.resolve(privateKeyPath) || path.resolve(output) === path.resolve(packagePath)) throw new Error('A saída não pode substituir a chave ou o pacote.');
  const archive = fs.readFileSync(packagePath), version = require('../package.json').version;
  const release = { schema: 1, product: 'NivoDock', channel: policy.channel, platform: 'win-x64', version, minimumVersion, publishedAt: new Date().toISOString(), notes, url: httpsUrl(packageUrl), size: archive.length, sha256: sha256(archive) };
  const files = packageFiles(archive, release), embedded = JSON.parse(files.get('update-channel.json'));
  if (embedded.publicKey !== policy.publicKey || embedded.manifestUrl !== policy.manifestUrl) throw new Error('O pacote usa outro canal/chave; gere-o novamente antes de assinar.');
  const payload = Buffer.from(JSON.stringify(release)), privateKey = crypto.createPrivateKey(fs.readFileSync(privateKeyPath));
  const envelope = { payload: payload.toString('base64'), signature: crypto.sign('sha256', payload, { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }).toString('base64') };
  releaseInfo(Buffer.from(JSON.stringify(envelope)), policy); writeJson(output, envelope);
  return { version, manifest: output, package: packagePath, sha256: release.sha256 };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) { if (!['--package','--url','--key','--out','--notes'].includes(args[i]) || !args[i+1]) throw new Error('Use --package ZIP --url HTTPS --key ARQUIVO_FORA_DO_PROJETO --out latest.json [--notes notas.json]'); options[args[i]] = args[i+1]; }
    if (!options['--package'] || !options['--url'] || !options['--key'] || !options['--out']) throw new Error('Informe pacote, URL, chave privada e arquivo de saída.');
    console.log(JSON.stringify(signUpdate({ packagePath: options['--package'], packageUrl: options['--url'], privateKeyPath: options['--key'], output: options['--out'], notes: options['--notes'] ? readJson(options['--notes']) : [] })));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { signUpdate };
