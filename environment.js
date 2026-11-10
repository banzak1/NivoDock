const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

const windowsPath = value => /^[a-z]:[\\/]|^\\\\/i.test(value || '');
const join = (base, ...parts) => windowsPath(base) ? path.win32.join(base, ...parts) : path.join(base, ...parts);
const native = value => process.platform === 'win32' || !/^[a-z]:[\\/]/i.test(value || '') ? value : value.replace(/^([a-z]):[\\/]/i, (_, d) => `/mnt/${d.toLowerCase()}/`).replace(/\\/g, '/');
const canonical = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function readWindowsEnvironment() {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR;
  const executable = process.platform === 'win32' ? (windowsRoot ? path.win32.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe') : '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  if (process.platform !== 'win32' && !fs.existsSync(executable)) return Promise.resolve(null);
  // Fixed script, with no user-controlled shell interpolation or account data.
  const script = `
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false);
    $OutputEncoding = [Console]::OutputEncoding;
    $ErrorActionPreference = 'SilentlyContinue';
    $uninstallKeys = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
    $apps = @(Get-ItemProperty $uninstallKeys | Where-Object { $_.DisplayName -and ($_.InstallLocation -or $_.DisplayIcon) } | Select-Object DisplayName,InstallLocation,DisplayIcon,Publisher);
    $steam = @(); foreach ($key in @('HKCU:\\Software\\Valve\\Steam','HKLM:\\SOFTWARE\\WOW6432Node\\Valve\\Steam','HKLM:\\SOFTWARE\\Valve\\Steam')) { $s = Get-ItemProperty $key; if ($s.SteamPath) { $steam += $s.SteamPath }; if ($s.InstallPath) { $steam += $s.InstallPath } };
    [pscustomobject]@{ userProfile=$env:USERPROFILE; appData=$env:APPDATA; localAppData=$env:LOCALAPPDATA; programData=$env:ProgramData; programFiles=$env:ProgramFiles; programFilesX86=\${env:ProgramFiles(x86)}; documents=[Environment]::GetFolderPath('MyDocuments'); startup=[Environment]::GetFolderPath('Startup'); drives=@(Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root); steamRoots=$steam; applications=$apps } | ConvertTo-Json -Depth 4 -Compress
  `;
  return new Promise(resolve => execFile(executable, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
    if (err) return resolve(null);
    try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { resolve(null); }
  }));
}

async function createEnvironment() {
  const found = await readWindowsEnvironment();
  if (!found && process.platform === 'win32') throw new Error('Não foi possível consultar as pastas e lojas do Windows; tente verificar novamente.');
  const userProfile = found?.userProfile || os.homedir();
  const env = {
    userProfile, appData: found?.appData || process.env.APPDATA || join(userProfile, 'AppData', 'Roaming'),
    localAppData: found?.localAppData || process.env.LOCALAPPDATA || join(userProfile, 'AppData', 'Local'),
    programData: found?.programData || process.env.ProgramData || '',
    programFiles: found?.programFiles || process.env.ProgramFiles || '',
    programFilesX86: found?.programFilesX86 || process.env['ProgramFiles(x86)'] || '',
    documents: found?.documents || join(userProfile, 'Documents'),
    startup: found?.startup || '', drives: found?.drives || [],
    steamRoots: found?.steamRoots || [], applications: found?.applications || [],
  };
  env.gameRoots = env.drives.flatMap(drive => ['Games', 'Jogos', 'SteamLibrary', 'Riot Games', 'GOG Games', 'XboxGames'].map(name => join(drive, name)));
  for (const folder of [env.programFiles, env.programFilesX86].filter(Boolean)) {
    for (const name of ['EA Games', 'Epic Games', 'Riot Games', 'GOG Games', 'XboxGames', 'ModifiableWindowsApps', 'Hypixel Studios', 'Eden', 'Ryujinx', 'PCSX2', 'mGBA', 'DeSmuME', 'Citron']) env.gameRoots.push(join(folder, name));
  }
  env.gameRoots.push(join(env.localAppData, 'Programs'));
  if (env.documents) env.gameRoots.push(env.documents);
  env.excludedRoots = ['.git', '.deck-profile', '.updates', 'dist', 'public', 'backups', 'test', 'test-support', 'vendor', 'node_modules'].map(name => join(__dirname, name));
  return env;
}

module.exports = { createEnvironment, join, native, canonical, windowsPath };
