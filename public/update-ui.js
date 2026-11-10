(() => {
  const modal = document.getElementById('modal-update'), openButton = document.getElementById('btn-updates');
  const title = document.getElementById('update-title'), message = document.getElementById('update-message');
  const versions = document.getElementById('update-versions'), notes = document.getElementById('update-notes');
  const progress = document.getElementById('update-progress'), install = document.getElementById('update-install'), check = document.getElementById('update-check');
  const close = document.getElementById('close-update'), later = document.getElementById('update-later');
  let state = {}, previousFocus, originalVersion = '', awaitingRestart = false;
  const dismissed = new Set();
  function isDismissed(version) { try { return dismissed.has(version) || sessionStorage.getItem('nivodock-update-later-' + version) === '1'; } catch { return dismissed.has(version); } }
  function show() {
    if (modal.classList.contains('open')) return;
    previousFocus = document.activeElement; modal.classList.add('open'); modal.focus();
  }
  function hide() {
    if (state.state === 'applying') return;
    if (state.availableVersion) { dismissed.add(state.availableVersion); try { sessionStorage.setItem('nivodock-update-later-' + state.availableVersion, '1'); } catch {} }
    modal.classList.remove('open'); (previousFocus?.getClientRects().length && !previousFocus.closest('details:not([open])') ? previousFocus : document.querySelector('#library-tools summary')).focus();
  }
  function render(data) {
    if (!data) return;
    state = data; originalVersion ||= data.currentVersion;
    if (['downloading','applying'].includes(data.state)) awaitingRestart = true;
    if (awaitingRestart && data.result?.status === 'installed' && data.currentVersion !== originalVersion) { location.reload(); return; }
    if (awaitingRestart && data.result?.status === 'rolledBack') { awaitingRestart = false; show(); }
    const percentage = data.totalBytes ? Math.min(100, Math.floor(100 * data.downloadedBytes / data.totalBytes)) : 0;
    openButton.textContent = data.state === 'available' ? 'Atualização disponível' : data.state === 'downloading' ? `Baixando atualização: ${percentage}%` : 'Atualizações do NivoDock';
    title.textContent = data.state === 'applying' ? 'Atualizando o NivoDock' : data.availableVersion ? 'Uma nova versão está disponível' : 'Atualizações do NivoDock';
    message.textContent = data.busy && data.availableVersion ? 'Encerre o jogo em execução para instalar a atualização.' : data.message || 'Confira se há uma nova versão.';
    if (data.result?.status === 'rolledBack' && (!data.availableVersion || data.availableVersion === data.result.attemptedVersion) && !['downloading','applying'].includes(data.state)) message.textContent = data.result.message;
    versions.textContent = `Versão atual: v${data.currentVersion || '—'}` + (data.availableVersion ? ` → v${data.availableVersion}` : '');
    notes.replaceChildren(); for (const text of data.notes || []) { const li = document.createElement('li'); li.textContent = text; notes.append(li); }
    notes.hidden = !notes.childElementCount;
    progress.hidden = data.state !== 'downloading'; progress.value = percentage;
    install.hidden = !data.availableVersion || data.requiresManualInstall;
    install.disabled = !data.canInstall;
    install.textContent = data.state === 'ready' ? 'Instalar e reiniciar' : 'Baixar e instalar';
    const manual = document.getElementById('update-manual');
    manual.hidden = !data.requiresManualInstall || !data.manualUrl;
    if (data.manualUrl) manual.href = data.manualUrl; else manual.removeAttribute('href');
    check.disabled = !data.configured || ['checking','downloading','applying'].includes(data.state);
    close.disabled = later.disabled = data.state === 'applying';
    later.textContent = data.state === 'downloading' ? 'Ocultar' : 'Depois';
    if (data.state === 'available' && !data.busy && !isDismissed(data.availableVersion) && !document.querySelector('.modal-backdrop.open') && !document.hidden) show();
  }
  async function request(route, body = {}) {
    const response = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar.');
    render(data); return data;
  }
  openButton.addEventListener('click', async () => {
    show();
    try {
      render(await fetch('/api/update').then(r => r.json()));
      if (state.configured && !['downloading','applying','ready'].includes(state.state)) { message.textContent = 'Verificando atualizações…'; await request('/api/update/check'); }
    } catch (err) { message.textContent = err.message; }
  });
  check.addEventListener('click', async () => {
    check.disabled = true; message.textContent = 'Verificando atualizações…';
    try { await request('/api/update/check'); } catch (err) { message.textContent = err.message; check.disabled = false; }
  });
  install.addEventListener('click', async () => {
    install.disabled = true;
    try { awaitingRestart = true; await request('/api/update/install', { version: state.availableVersion }); }
    catch (err) { awaitingRestart = false; message.textContent = err.message; install.disabled = !state.canInstall; }
  });
  close.addEventListener('click', hide); later.addEventListener('click', hide);
  modal.addEventListener('click', event => { if (event.target === modal) hide(); });
  window.addEventListener('keydown', event => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); hide(); }
    if (event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll('button:not([disabled]), a[href]')].filter(e => !e.hidden), first = buttons[0], last = buttons.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) { event.preventDefault(); first.focus(); }
    }
  }, true);
  window.NivoDockUpdates = { render, isOpen: () => modal.classList.contains('open') };
})();
