function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\0:]/.test(value) || /^[\\/]/.test(value) || value.split(/[\\/]/).includes('..')) return '';
  return value;
}

function displayIconPath(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return (text.match(/^"([^"]+)"(?:\s*,\s*-?\d+)?$/)?.[1] || text.replace(/,\s*-?\d+\s*$/, '')).trim();
}

// Windows argument strings, passed to spawn as an array (never to a shell).
function windowsArguments(value) {
  if (!value) return [];
  if (typeof value !== 'string' || value.length > 32768) throw new Error('Argumentos do manifesto inválidos');
  const args = []; let word = '', quoted = false, started = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\') {
      let count = 1;
      while (value[i + 1] === '\\') { count++; i++; }
      if (value[i + 1] === '"') {
        word += '\\'.repeat(Math.floor(count / 2)); i++;
        if (count % 2) word += '"'; else quoted = !quoted;
      } else word += '\\'.repeat(count);
      started = true;
    } else if (ch === '"') { quoted = !quoted; started = true; }
    else if (/\s/.test(ch) && !quoted) {
      if (started) { args.push(word); word = ''; started = false; }
    } else { word += ch; started = true; }
  }
  if (quoted) throw new Error('Aspas incompletas nos argumentos do manifesto');
  if (started) args.push(word);
  return args;
}

function gogInfo(text, fileName) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  const id = String(data.gameId || fileName.match(/^goggame-(\d+)\.info$/i)?.[1] || '');
  if (!/^\d+$/.test(id) || typeof data.name !== 'string' || !data.name.trim() || data.isDlc === true) return [];
  return (Array.isArray(data.playTasks) ? data.playTasks : []).filter(task =>
    (task.isPrimary === true || task.isPrimary === 'true') && (!task.type || task.type.toLowerCase() === 'filetask') && relativeFile(task.path) && /\.exe$/i.test(task.path)
  ).map(task => ({ id, title: data.name.trim().slice(0, 512), relativeExe: relativeFile(task.path), relativeCwd: task.workingDir ? relativeFile(task.workingDir) : '', args: windowsArguments(task.arguments) }));
}

function xmlText(value = '') {
  return value.replace(/&(?:#(x[0-9a-f]+|\d+)|amp|quot|apos|lt|gt);/gi, (token, n) => {
    if (n) { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n); return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ''; }
    return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[token.toLowerCase()] || token;
  });
}
function attributes(text = '') {
  return Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(), xmlText(m[2] ?? m[3])]));
}
function microsoftGame(text) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Declarações XML externas não são aceitas');
  const xml = text.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<Game\b/i.test(xml) || !/<\/Game\s*>/i.test(xml)) return [];
  const id = attributes(xml.match(/<Identity\b([^>]+)>/i)?.[1]).name;
  const visuals = attributes(xml.match(/<ShellVisuals\b([^>]+)>/i)?.[1]);
  if (!id || id.length > 256) return [];
  // Store/launcher packages can use this schema too. Java Edition's GDK
  // registration is a launcher shell; its separately downloaded JAR is not
  // evidence contained in this manifest.
  if (['Microsoft.4297127D64EC6', 'Microsoft.MinecraftJavaEdition', 'Microsoft.GamingApp', 'Microsoft.GamingServices'].includes(id) || /\blauncher\b|^gaming services$|^xbox$/i.test(visuals.defaultdisplayname || '')) return [];
  const list = xml.match(/<ExecutableList\b[^>]*>([\s\S]*?)<\/ExecutableList\s*>/i)?.[1] || '';
  return [...list.matchAll(/<Executable\b([^>]+)>/gi)].map(m => attributes(m[1])).filter(exe =>
    relativeFile(exe.name) && /\.exe$/i.test(exe.name) && !/^(?:true|1)$/i.test(exe.isdevonly || '') && (!exe.targetdevicefamily || /^PC$/i.test(exe.targetdevicefamily))
  ).map(exe => ({ id, title: !/^ms-resource:/i.test(exe.overridedisplayname || visuals.defaultdisplayname || '') ? (exe.overridedisplayname || visuals.defaultdisplayname || '').slice(0, 512) : '', relativeExe: exe.name }));
}

module.exports = { relativeFile, displayIconPath, windowsArguments, gogInfo, microsoftGame };
