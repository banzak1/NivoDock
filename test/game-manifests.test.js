const { test } = require('node:test');
const assert = require('node:assert/strict');
const { displayIconPath, windowsArguments, gogInfo, microsoftGame } = require('../game-manifests');

test('registry icons and Windows launch arguments retain spaces without becoming shell commands', () => {
  assert.equal(displayIconPath('"D:\\Meus Jogos\\Game.exe",-4'), 'D:\\Meus Jogos\\Game.exe');
  assert.equal(displayIconPath('D:\\Meus Jogos\\Game.exe,0'), 'D:\\Meus Jogos\\Game.exe');
  assert.deepEqual(windowsArguments('--mode "safe game" --literal "$HOME & calc.exe" ""'), ['--mode', 'safe game', '--literal', '$HOME & calc.exe', '']);
  assert.throws(() => windowsArguments('"unfinished'));
});
test('GOG reads primary file tasks, skipping documents, URLs and escaped paths', () => {
  const wrap = tasks => JSON.stringify({ gameId: '123', name: 'An Unknown Adventure', playTasks: tasks });
  const good = { isPrimary: true, type: 'FileTask', path: 'bin\\Game.exe', arguments: '--profile "Minha campanha"', workingDir: '.' };
  assert.deepEqual(gogInfo(wrap([good]), 'goggame-123.info')[0], { id: '123', title: 'An Unknown Adventure', relativeExe: good.path, args: ['--profile', 'Minha campanha'], relativeCwd: '.' });
  for (const bad of [{ ...good, path: '..\\outside.exe' }, { ...good, path: 'C:\\outside.exe' }, { ...good, type: 'URLTask' }, { ...good, isPrimary: false }, { ...good, path: 'manual.pdf' }]) assert.equal(gogInfo(wrap([bad]), 'goggame-123.info').length, 0);
});
test('MicrosoftGame.config identifies desktop games without resolving external XML or console tools', () => {
  const xml = exe => `<Game configVersion="1"><Identity Name="Publisher.RealGame"/><ExecutableList>${exe}</ExecutableList><ShellVisuals DefaultDisplayName="Space &amp; Time"/></Game>`;
  assert.deepEqual(microsoftGame(xml('<Executable Name="bin/Game.exe" Id="Game" TargetDeviceFamily="PC"/>'))[0], { id: 'Publisher.RealGame', title: 'Space & Time', relativeExe: 'bin/Game.exe' });
  assert.equal(microsoftGame(xml('<Executable Name="../outside.exe"/>')).length, 0);
  assert.equal(microsoftGame(xml('<Executable Name="console.exe" TargetDeviceFamily="Scarlett"/>')).length, 0);
  assert.equal(microsoftGame(xml('<Executable Name="Dev.exe" IsDevOnly="true"/>')).length, 0);
  assert.equal(microsoftGame(xml('<Executable Name="Launcher.exe"/>').replace('Space &amp; Time', 'Store Launcher')).length, 0);
  assert.equal(microsoftGame(xml('<Executable Name="Minecraft.exe"/>').replace('Publisher.RealGame', 'Microsoft.MinecraftJavaEdition')).length, 0);
  assert.throws(() => microsoftGame('<!DOCTYPE Game SYSTEM "file:///secret">' + xml('')));
});
