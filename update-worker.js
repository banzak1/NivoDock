// Runs with a private copy of the bundled runtime, outside the files replaced.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { releaseInfo, compareVersions, packageFiles, appPath, safePath, atomicFile, writeJson, readJson, sha256 } = require('./update-core');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } };
function internal(root, file) { return safePath(root, '.updates/' + file); }
function lock(root) {
  const file = internal(root, 'worker.lock');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const previous = readJson(file);
    if (Number.isSafeInteger(previous.pid) && alive(previous.pid)) throw new Error('Outra atualização ainda está em andamento');
    fs.unlinkSync(file);
  }
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return () => { if (fs.existsSync(file) && readJson(file).pid === process.pid) fs.unlinkSync(file); };
}
function health(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/update/health', timeout: 750 }, response => {
      let content = ''; response.setEncoding('utf8');
      response.on('data', chunk => { content += chunk; if (content.length > 4096) response.destroy(); });
      response.on('end', () => { try { resolve(JSON.parse(content)); } catch { resolve(null); } });
      response.on('error', () => resolve(null));
    });
    request.on('timeout', () => request.destroy()); request.on('error', () => resolve(null));
  });
}
function launch(root, port, nonce) {
  const child = spawn(path.join(root, 'node.exe'), [path.join(root, 'server.js')], { cwd: root, windowsHide: true, detached: true, stdio: 'ignore', env: { ...process.env, NIVODOCK_PORT: String(port), NIVODOCK_UPDATE_NONCE: nonce } });
  child.on('error', () => {}); child.unref(); return child;
}
async function waitHealthy(port, version, nonce, child, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const data = await health(port);
    if (data?.product === 'NivoDock' && data.version === version && data.nonce === nonce) return;
    if (child.exitCode !== null || child.signalCode || !child.pid) throw new Error('A nova versão encerrou antes de iniciar');
    await delay(200);
  }
  throw new Error('A nova versão não respondeu à verificação de inicialização');
}
async function stopChild(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode) return;
  child.kill();
  for (let i = 0; i < 40 && child.exitCode === null && !child.signalCode; i++) await delay(100);
}
function result(root, status, journal, message) {
  writeJson(internal(root, 'result.json'), { id: journal.id, status, version: status === 'installed' ? journal.toVersion : journal.fromVersion, attemptedVersion: journal.toVersion, message, completedAt: new Date().toISOString() });
}
function validateJournal(journal) {
  if (!/^backup-[a-f0-9]{32}$/.test(journal.backup || '') || !Array.isArray(journal.files) || journal.files.length > 512) throw new Error('Registro de recuperação inválido');
  compareVersions(journal.fromVersion, journal.toVersion);
  if (!Number.isInteger(journal.port) || journal.port < 1024 || journal.port > 65535) throw new Error('Porta de recuperação inválida');
  const names = new Set();
  for (const file of journal.files) {
    const name = appPath(file.path).toLowerCase();
    if (names.has(name) || typeof file.existed !== 'boolean' || (file.existed && !/^[a-f0-9]{64}$/.test(file.originalHash)) || (file.installedHash && !/^[a-f0-9]{64}$/.test(file.installedHash))) throw new Error('Lista de recuperação inválida');
    names.add(name);
  }
}
function restore(root, journal) {
  validateJournal(journal);
  // Validate every backup before restoring any application file.
  for (const file of journal.files) {
    appPath(file.path);
    if (file.existed && sha256(fs.readFileSync(internal(root, journal.backup + '/' + file.path))) !== file.originalHash) throw new Error('Backup da versão anterior está incompleto');
    safePath(root, file.path);
  }
  for (const file of journal.files) {
    const destination = safePath(root, file.path);
    if (file.existed) atomicFile(destination, fs.readFileSync(internal(root, journal.backup + '/' + file.path)));
    else if (fs.existsSync(destination)) fs.unlinkSync(destination);
  }
}
function saveJournal(root, journal) { writeJson(internal(root, 'transaction.json'), journal); }
function complete(root, journal) {
  journal.phase = 'complete'; saveJournal(root, journal);
  result(root, 'installed', journal, 'NivoDock atualizado para v' + journal.toVersion + '.');
  // Keep one verified previous version; user data never enters these directories.
  if (/^backup-[a-f0-9]{32}$/.test(journal.previousBackup || '') && journal.previousBackup !== journal.backup) { try { fs.rmSync(internal(root, journal.previousBackup), { recursive: true, force: true }); } catch (err) { console.warn('Limpeza adiada:', err.message); } }
}
async function rollback(root, journal, message) {
  restore(root, journal); journal.phase = 'rolledBack'; saveJournal(root, journal);
  result(root, 'rolledBack', journal, 'A atualização falhou. A versão anterior foi restaurada. ' + message);
  const nonce = crypto.randomBytes(24).toString('hex'), child = launch(root, journal.port, nonce);
  await waitHealthy(journal.port, journal.fromVersion, nonce, child);
}
async function recover(root) {
  const file = internal(root, 'transaction.json');
  if (!fs.existsSync(file)) return;
  const journal = readJson(file);
  if (['complete','rolledBack','cancelled'].includes(journal.phase)) return;
  validateJournal(journal);
  if (journal.phase === 'backingUp') {
    journal.phase = 'cancelled'; saveJournal(root, journal);
    result(root, 'rolledBack', journal, 'A atualização interrompida foi cancelada antes de alterar os arquivos.'); return;
  }
  if (journal.phase !== 'applying') throw new Error('Etapa de recuperação desconhecida');
  const data = await health(journal.port);
  if (data?.nonce === journal.nonce && data.product === 'NivoDock' && data.version === journal.toVersion && journal.files.every(f => !f.installedHash || (fs.existsSync(safePath(root, f.path)) && sha256(fs.readFileSync(safePath(root, f.path))) === f.installedHash))) {
    complete(root, journal); return;
  }
  if (data) throw new Error('Feche o NivoDock e abra novamente para concluir a recuperação');
  await rollback(root, journal, 'Recuperação após uma interrupção.');
}
async function apply(jobFile) {
  const job = readJson(jobFile), root = path.resolve(job.targetDir);
  if (!Number.isInteger(job.parentPid) || job.parentPid < 1 || !Number.isInteger(job.port) || job.port < 1024 || job.port > 65535 || !/^[a-f0-9]{32}$/.test(job.id)) throw new Error('Solicitação de atualização inválida');
  const releaseLock = lock(root);
  let parentExited = false, mutationsStarted = false;
  try {
    const stage = 'stage-' + job.id;
    if (path.resolve(jobFile) !== internal(root, stage + '/job.json')) throw new Error('Solicitação fora da pasta de atualização');
    const policy = readJson(path.join(__dirname, 'update-channel.json'));
    const release = releaseInfo(fs.readFileSync(internal(root, stage + '/release.json')), policy);
    if (compareVersions(release.version, job.currentVersion) <= 0 || compareVersions(job.currentVersion, release.minimumVersion) < 0 || readJson(path.join(root, 'package.json')).version !== job.currentVersion) throw new Error('Atualização incompatível ou obsoleta');
    const files = packageFiles(fs.readFileSync(internal(root, stage + '/package.zip')), release);
    for (const [name, bytes] of files) {
      safePath(root, name); atomicFile(internal(root, stage + '/extracted/' + name), bytes);
    }
    writeJson(internal(root, stage + '/ready.json'), { ready: true });
    for (let i = 0; alive(job.parentPid); i++) { if (i >= 120) throw new Error('O aplicativo não encerrou; a atualização foi cancelada'); await delay(250); }
    parentExited = true;
    let previous = {};
    if (fs.existsSync(internal(root, 'transaction.json'))) {
      previous = readJson(internal(root, 'transaction.json'));
      if (!['complete','rolledBack','cancelled'].includes(previous.phase)) throw new Error('Uma atualização anterior precisa de recuperação');
    }
    const names = new Set(files.keys());
    if (fs.existsSync(path.join(root, 'build-manifest.json'))) for (const file of readJson(path.join(root, 'build-manifest.json')).files) names.add(appPath(file.path));
    const plan = [...names].map(name => {
      const target = safePath(root, name), existed = fs.existsSync(target);
      if (existed && !fs.statSync(target).isFile()) throw new Error('Arquivo de aplicação foi substituído por uma pasta');
      return { path: name, existed, originalHash: existed ? sha256(fs.readFileSync(target)) : '', installedHash: files.has(name) ? sha256(files.get(name)) : '' };
    });
    const journal = { id: job.id, phase: 'backingUp', fromVersion: job.currentVersion, toVersion: release.version, port: job.port, nonce: crypto.randomBytes(24).toString('hex'), backup: 'backup-' + job.id, previousBackup: previous.backup || '', files: plan };
    saveJournal(root, journal);
    for (const file of plan) if (file.existed) atomicFile(internal(root, journal.backup + '/' + file.path), fs.readFileSync(safePath(root, file.path)));
    journal.phase = 'applying'; saveJournal(root, journal); mutationsStarted = true;
    let child;
    try {
      for (const file of plan) {
        const target = safePath(root, file.path);
        if (files.has(file.path)) atomicFile(target, files.get(file.path));
        else if (file.existed) fs.unlinkSync(target);
      }
      child = launch(root, job.port, journal.nonce);
      await waitHealthy(job.port, release.version, journal.nonce, child);
      complete(root, journal);
      try { fs.rmSync(internal(root, stage), { recursive: true, force: true }); } catch (err) { console.warn('Limpeza adiada:', err.message); }
    } catch (err) {
      await stopChild(child); await rollback(root, journal, err.message);
    }
  } catch (err) {
    if (parentExited && !mutationsStarted) {
      let journal = { id: job.id, fromVersion: job.currentVersion, toVersion: job.currentVersion };
      try {
        const file = internal(root, 'transaction.json');
        if (fs.existsSync(file)) { journal = readJson(file); if (journal.phase === 'backingUp') { journal.phase = 'cancelled'; saveJournal(root, journal); } }
        result(root, 'rolledBack', journal, 'A instalação foi cancelada antes de alterar a aplicação. ' + err.message);
        const nonce = crypto.randomBytes(24).toString('hex'), child = launch(root, job.port, nonce);
        await waitHealthy(job.port, job.currentVersion, nonce, child);
      } catch (restartError) { console.error(restartError.message); }
    }
    throw err;
  } finally { releaseLock(); }
}
async function main() {
  const [mode, argument] = process.argv.slice(2);
  if (mode === '--apply') await apply(argument);
  else if (mode === '--recover') {
    const root = path.resolve(argument);
    for (let i = 0; i < 120; i++) {
      const file = internal(root, 'transaction.json');
      if (!fs.existsSync(file) || ['complete','rolledBack','cancelled'].includes(readJson(file).phase)) return;
      let owner; try { owner = readJson(internal(root, 'worker.lock')); } catch {}
      if (!owner || !alive(owner.pid)) break;
      if (i === 119) throw new Error('Outra atualização ainda está em andamento');
      await delay(500);
    }
    const releaseLock = lock(root);
    try { await recover(root); } finally { releaseLock(); }
  } else throw new Error('Modo do atualizador inválido');
}
if (require.main === module) main().catch(err => {
  try {
    if (process.argv[2] === '--apply') { const job = readJson(process.argv[3]); writeJson(internal(path.resolve(job.targetDir), 'stage-' + job.id + '/failed.json'), { error: err.message }); }
  } catch {}
  console.error(err.message); process.exitCode = 1;
});
module.exports = { recover, restore, apply, health, waitHealthy };
