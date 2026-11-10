const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { MAX_PACKAGE, sha256, compareVersions, httpsUrl, releaseInfo, packageFiles, safePath, atomicFile, writeJson, readJson } = require('./update-core');
function fetchBuffer(address, { limit, expectedSize, onProgress = () => {}, timeout = 15000, deadline = Date.now() + timeout, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || redirects > 4) return reject(new Error('A consulta de atualização excedeu o prazo ou o limite de redirecionamentos'));
    let request, timer;
    try {
      request = https.get(httpsUrl(address), { headers: { 'User-Agent': 'NivoDock-Updater/1', 'Accept-Encoding': 'identity' } }, response => {
        if ([301,302,303,307,308].includes(response.statusCode)) {
          response.resume(); clearTimeout(timer);
          let next; try { next = httpsUrl(new URL(response.headers.location, address).href); } catch (err) { return reject(err); }
          return fetchBuffer(next, { limit, expectedSize, onProgress, timeout, deadline, redirects: redirects + 1 }).then(resolve,reject);
        }
        if (response.statusCode !== 200 || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) { response.resume(); return reject(new Error('O servidor de atualizações não entregou o arquivo solicitado')); }
        const declared = Number(response.headers['content-length']);
        if (declared > limit || (expectedSize && Number.isFinite(declared) && declared > 0 && declared !== expectedSize)) { response.destroy(); return reject(new Error('O tamanho informado pelo servidor é inválido')); }
        const chunks = []; let received = 0;
        response.on('data', chunk => {
          received += chunk.length;
          if (received > limit || (expectedSize && received > expectedSize)) return response.destroy(new Error('Download acima do tamanho permitido'));
          chunks.push(chunk); onProgress(received);
        });
        response.on('error', reject);
        response.on('end', () => {
          if (expectedSize && received !== expectedSize) return reject(new Error('Download incompleto'));
          resolve(Buffer.concat(chunks));
        });
      });
      timer = setTimeout(() => request.destroy(new Error('Tempo esgotado ao baixar a atualização')), remaining);
      request.on('error', reject); request.on('close', () => clearTimeout(timer));
    } catch (err) { clearTimeout(timer); reject(err); }
  });
}
function createUpdater({ root, version, port, isBusy = () => false, onHandoff = () => {}, platform = process.platform, get = fetchBuffer, handoff } = {}) {
  let policy = {}, configError = '';
  try { policy = readJson(path.join(root, 'update-channel.json')); if (policy.schema !== 1 || policy.channel !== 'stable') throw new Error('Canal inválido'); if (policy.manifestUrl) { httpsUrl(policy.manifestUrl); crypto.createPublicKey(policy.publicKey); } }
  catch (err) { configError = err.code === 'ENOENT' ? '' : 'A configuração de atualização é inválida.'; }
  const configured = Boolean(policy.manifestUrl && !configError), supported = platform === 'win32' && fs.existsSync(path.join(root, 'node.exe'));
  const updates = name => safePath(root, '.updates/' + name);
  const state = { state: configured ? 'idle' : 'unconfigured', message: configError || (configured ? '' : 'As atualizações online ainda não foram publicadas.'), checkedAt: null, downloadedBytes: 0, totalBytes: 0 };
  let candidate = null, envelope = null, stage = null, checkPromise = null, work = null, handedOff = false;
  function diskResult() { try { return readJson(updates('result.json')); } catch { return null; } }
  function pending() { try { return !['complete','rolledBack','cancelled'].includes(readJson(updates('transaction.json')).phase); } catch (err) { return err.code !== 'ENOENT'; } }
  function applying() { return state.state === 'applying' || pending(); }
  function status() {
    const busy = Boolean(isBusy()), result = diskResult(), installing = applying();
    return { ...state, state: installing ? 'applying' : state.state, configured, supported, currentVersion: version, availableVersion: candidate?.version || '', manualUrl: candidate?.url || '', notes: candidate?.notes || [], requiresManualInstall: Boolean(candidate && compareVersions(version, candidate.minimumVersion) < 0), canInstall: Boolean(configured && supported && candidate && compareVersions(version, candidate.minimumVersion) >= 0 && !busy && !installing && !['checking','downloading'].includes(state.state)), busy, result };
  }
  function fail(err) { state.state = 'error'; state.message = err.message || 'Não foi possível atualizar o NivoDock.'; }
  async function check() {
    if (!configured || applying() || ['downloading','ready'].includes(state.state)) return status();
    if (checkPromise) return checkPromise;
    state.state = 'checking'; state.message = 'Verificando atualizações…';
    checkPromise = (async () => {
      try {
        const bytes = await get(policy.manifestUrl, { limit: 128 * 1024, timeout: 15000 });
        const release = releaseInfo(bytes, policy);
        state.checkedAt = new Date().toISOString();
        if (compareVersions(release.version, version) <= 0) { candidate = null; state.state = 'upToDate'; state.message = 'Você está usando a versão mais recente.'; return status(); }
        let seen = null; try { seen = readJson(updates('seen.json')); } catch {}
        if (seen && compareVersions(release.version, seen.version) < 0) throw new Error('O servidor ofereceu uma versão anterior à já anunciada');
        writeJson(updates('seen.json'), { version: release.version });
        envelope = bytes; candidate = release; state.totalBytes = release.size; state.downloadedBytes = 0; state.state = 'available';
        state.message = compareVersions(version, release.minimumVersion) < 0 ? 'Esta versão precisa ser instalada pelo pacote manual.' : 'Uma nova versão do NivoDock está disponível.';
      } catch (err) { fail(err); }
      return status();
    })();
    try { return await checkPromise; } finally { checkPromise = null; }
  }
  async function nativeHandoff() {
    const worker = updates('worker'); safePath(root, '.updates/worker/node.exe'); fs.mkdirSync(worker, { recursive: true });
    for (const file of ['node.exe','update-worker.js','update-core.js','update-channel.json']) atomicFile(safePath(root, '.updates/worker/' + file), fs.readFileSync(path.join(root, file)));
    const jobFile = path.join(stage, 'job.json');
    writeJson(jobFile, { id: path.basename(stage).slice(6), targetDir: root, currentVersion: version, port, parentPid: process.pid });
    const log = fs.openSync(updates('worker.log'), 'a');
    let child;
    try { child = spawn(path.join(worker, 'node.exe'), [path.join(worker, 'update-worker.js'), '--apply', jobFile], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore',log,log] }); } finally { fs.closeSync(log); }
    let spawnError; child.on('error', err => { spawnError = err; }); child.unref();
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      if (spawnError) throw spawnError;
      if (fs.existsSync(path.join(stage, 'failed.json'))) throw new Error(readJson(path.join(stage, 'failed.json')).error);
      if (fs.existsSync(path.join(stage, 'ready.json'))) { handedOff = true; onHandoff(); return; }
      if (child.exitCode !== null) throw new Error('O atualizador encerrou antes de preparar a instalação');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Never exit the app unless the worker explicitly acknowledged preparation.
    throw new Error('O atualizador não confirmou a preparação. Tente novamente.');
  }
  async function install(requestedVersion) {
    if (requestedVersion !== candidate?.version) throw Object.assign(new Error("A versão oferecida mudou. Verifique as atualizações novamente."), { statusCode: 409 });
    if (isBusy()) throw Object.assign(new Error('Encerre o jogo em execução antes de atualizar.'), { statusCode: 409 });
    if (!status().canInstall) throw Object.assign(new Error('Nenhuma atualização pronta para instalar neste computador.'), { statusCode: 409 });
    if (work) return status();
    const ready = state.state === 'ready'; state.state = ready ? 'applying' : 'downloading'; state.message = ready ? 'Preparando a instalação…' : 'Baixando a atualização…';
    work = (async () => {
      try {
        if (!ready) {
          const id = crypto.randomBytes(16).toString('hex'); stage = updates('stage-' + id); fs.mkdirSync(stage, { recursive: true });
          atomicFile(path.join(stage, 'release.json'), envelope);
          const bytes = await get(candidate.url, { limit: MAX_PACKAGE, expectedSize: candidate.size, timeout: 10 * 60 * 1000, onProgress: received => { state.downloadedBytes = received; } });
          packageFiles(bytes, candidate); atomicFile(path.join(stage, 'package.zip'), bytes);
          state.state = 'ready'; state.downloadedBytes = candidate.size;
        }
        // A game may have started while the package was downloading.
        if (isBusy()) { state.state = 'ready'; state.message = 'Download concluído. Encerre o jogo e clique em Instalar.'; return; }
        state.state = 'applying'; state.message = 'Instalando e reiniciando o NivoDock…';
        await (handoff || nativeHandoff)({ stage, release: candidate });
      } catch (err) { if (!handedOff) fail(err); }
      finally { work = null; }
    })();
    return status();
  }
  return { status, check, install, isApplying: applying, waitForWork: () => work };
}
module.exports = { createUpdater, fetchBuffer };
