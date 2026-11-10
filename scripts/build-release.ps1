param([string]$NodePath = '', [switch]$KeepExpanded)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$version = (Get-Content (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
if (!$NodePath) { $NodePath = (Get-Command node.exe -ErrorAction Stop).Source }
$runtimeVersion = (& $NodePath --version).Trim()
$arch = (& $NodePath -p 'process.arch').Trim()
if ($runtimeVersion -ne 'v22.20.0' -or $arch -ne 'x64') {
  throw 'Este pacote usa o runtime Windows x64 v22.20.0, cuja licenca esta em vendor/node-v22.20.0-LICENSE. Informe -NodePath correspondente.'
}
$dist = Join-Path $project 'dist'
New-Item $dist -ItemType Directory -Force | Out-Null
$work = Join-Path ([IO.Path]::GetTempPath()) ('nivodock-build-' + [Guid]::NewGuid().ToString('N'))
$payload = Join-Path $work 'NivoDock'
New-Item $payload -ItemType Directory -Force | Out-Null
try {
  # Explicit allowlist: personal libraries, config, profiles, saves and cached art
  # from the developer PC can never enter the distribution.
  $sources = @('server.js','artwork.js','library.js','environment.js','discovery.js','game-manifests.js','update-core.js','update-worker.js','updater.js','update-channel.json','save-locations.js','progress.js','progress-readers.js','progress-formats.js','autostart.js','package.json','VERSION','Iniciar Launcher.bat')
  foreach ($name in $sources) { Copy-Item (Join-Path $project $name) (Join-Path $payload $name) }
  $guide = Get-Content -LiteralPath (Join-Path $project 'packaging/LEIA-ME.txt') -Raw -Encoding UTF8
  $license = Get-Content -LiteralPath (Join-Path $project 'LICENSE') -Raw -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $payload 'LEIA-ME.txt') -Value ($guide.TrimEnd() + "`r`n`r`n" + $license.TrimEnd()) -Encoding UTF8
  New-Item (Join-Path $payload 'public') -ItemType Directory | Out-Null
  Copy-Item (Join-Path $project 'public/index.html') (Join-Path $payload 'public/index.html')
  Copy-Item (Join-Path $project 'public/update-ui.js') (Join-Path $payload 'public/update-ui.js')
  Copy-Item (Join-Path $project 'public/brand') (Join-Path $payload 'public/brand') -Recurse
  Copy-Item $NodePath (Join-Path $payload 'node.exe')
  Copy-Item (Join-Path $project 'vendor/node-v22.20.0-LICENSE') (Join-Path $payload 'NODE-LICENSE.txt')
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  if (!(Test-Path $compiler)) { throw 'Compilador .NET Framework nao encontrado neste computador de desenvolvimento.' }
  $assemblyInfo = Join-Path $work 'AssemblyInfo.cs'
  @('[assembly: System.Reflection.AssemblyTitle("NivoDock")]', '[assembly: System.Reflection.AssemblyProduct("NivoDock")]', ('[assembly: System.Reflection.AssemblyVersion("' + $version + '.0")]'), ('[assembly: System.Reflection.AssemblyFileVersion("' + $version + '.0")]')) | Set-Content $assemblyInfo -Encoding UTF8
  & $compiler /nologo /codepage:65001 /target:winexe ('/win32icon:' + (Join-Path $project 'public/brand/nivodock.ico')) '/reference:System.Windows.Forms.dll' ('/out:' + (Join-Path $payload 'NivoDock.exe')) (Join-Path $project 'LauncherHost.cs') $assemblyInfo
  if ($LASTEXITCODE) { throw 'Falha ao compilar o inicializador.' }
  & $compiler /nologo /codepage:65001 /target:winexe ('/win32icon:' + (Join-Path $project 'public/brand/nivodock.ico')) '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' ('/out:' + (Join-Path $payload 'Instalar-NivoDock.exe')) (Join-Path $project 'Installer.cs') $assemblyInfo
  if ($LASTEXITCODE) { throw 'Falha ao compilar o instalador.' }
  # A fresh-install distribution must not inherit old product identifiers or user data.
  $forbiddenBrand = @('BanzakGameDeck', 'Banzak Game Deck', 'BANZAK_PORT', 'BANZAK_DISABLE_AUTOSCAN')
  foreach ($file in Get-ChildItem $payload -File -Recurse) {
    if ($file.Name -match 'BanzakGameDeck') { throw ('Arquivo de compatibilidade indevido: ' + $file.Name) }
    if ($file.Extension -in @('.js','.json','.html','.txt','.bat','.svg')) {
      if (Select-String -LiteralPath $file.FullName -Pattern $forbiddenBrand -SimpleMatch -Quiet) { throw ('Identificador antigo no pacote: ' + $file.Name) }
    }
  }
  foreach ($personal in @('games.json','config.json','.deck-profile','backups','.updates','public/artwork')) {
    if (Test-Path (Join-Path $payload $personal)) { throw ('Dados pessoais no pacote: ' + $personal) }
  }
  if (Get-ChildItem $payload -File -Recurse | Where-Object { $_.Extension -in @('.pem','.key') -or (($_.Extension -in @('.js','.json','.txt')) -and (Select-String -LiteralPath $_.FullName -Pattern '-----BEGIN PRIVATE KEY-----','-----BEGIN RSA PRIVATE KEY-----' -SimpleMatch -Quiet)) }) { throw 'Uma chave privada entrou no pacote.' }
  $manifest = [ordered]@{ version=$version; platform='win-x64'; runtime=$runtimeVersion; files=@() }
  foreach ($file in Get-ChildItem $payload -File -Recurse | Sort-Object FullName) {
    $relative = $file.FullName.Substring($payload.Length + 1).Replace('\','/')
    $manifest.files += [ordered]@{ path=$relative; size=$file.Length; sha256=(Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLower() }
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $payload 'build-manifest.json') -Encoding UTF8
  $name = 'NivoDock-v' + $version + '-win-x64'
  $output = Join-Path $dist $name
  if (Test-Path $output) {
    $previous = Join-Path $dist ('previous-' + $name + '-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'))
    Move-Item $output $previous
  }
  Move-Item $payload $output
  $zip = Join-Path $dist ($name + '.zip')
  if (Test-Path $zip) { Move-Item $zip ($zip + '.' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '.bak') }
  Compress-Archive -Path $output -DestinationPath $zip -CompressionLevel Optimal
  $hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  ($hash + '  ' + [IO.Path]::GetFileName($zip)) | Set-Content ($zip + '.sha256') -Encoding ASCII
  # The ZIP is the distributable. Keep its large extracted copy only for validation.
  if (!$KeepExpanded) { Remove-Item $output -Recurse -Force }
  [pscustomobject]@{ version=$version; package=$zip; size=(Get-Item $zip).Length; sha256=$hash; runtime=$runtimeVersion } | ConvertTo-Json -Compress
} finally {
  if (Test-Path $work) { Remove-Item $work -Recurse -Force }
}
