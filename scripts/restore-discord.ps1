param([switch]$Silent)
$ErrorActionPreference = 'Stop'
try {
  $metadata = Get-Content (Join-Path $PSScriptRoot 'pacote.json') -Raw | ConvertFrom-Json
  foreach ($name in @($metadata.archive) + @($metadata.parts | ForEach-Object { $_.file; $_.zip })) {
    if ([IO.Path]::GetFileName($name) -ne $name) { throw 'Nome de arquivo invalido no pacote.' }
  }
  $destination = Join-Path $PSScriptRoot ([IO.Path]::GetFileNameWithoutExtension($metadata.archive))
  if (Test-Path $destination) { throw ('A pasta ja existe: ' + $destination + '. Use uma pasta nova para preparar o aplicativo.') }
  $temporary = Join-Path $PSScriptRoot ('nivodock-' + [Guid]::NewGuid().ToString('N') + '.zip')
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $output = [IO.File]::Create($temporary)
  try {
    foreach ($part in $metadata.parts) {
      $file = Join-Path $PSScriptRoot $part.file
      # Also support Explorer's default, one extraction folder per ZIP.
      if (!(Test-Path $file)) {
        $sibling = Join-Path (Split-Path $PSScriptRoot -Parent) ([IO.Path]::GetFileNameWithoutExtension($part.zip))
        $file = Join-Path $sibling $part.file
      }
      if (Test-Path $file) {
        $inputStream = [IO.File]::OpenRead($file)
        try { $inputStream.CopyTo($output) } finally { $inputStream.Dispose() }
      } else {
        # The second ZIP may still be beside the original download.
        $zipPath = Join-Path $PSScriptRoot $part.zip
        if (!(Test-Path $zipPath)) { $zipPath = Join-Path (Split-Path $PSScriptRoot -Parent) $part.zip }
        if (!(Test-Path $zipPath)) { throw ('Falta a parte ' + $part.number + '. Coloque os dois ZIPs na mesma pasta e extraia a parte 1 novamente.') }
        $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
        try {
          $entry = $archive.GetEntry($part.file)
          if (!$entry) { throw ('Arquivo incompleto: ' + $part.zip) }
          $inputStream = $entry.Open()
          try { $inputStream.CopyTo($output) } finally { $inputStream.Dispose() }
        } finally { $archive.Dispose() }
      }
    }
  } finally { $output.Dispose() }
  if ((Get-Item $temporary).Length -ne $metadata.bytes -or (Get-FileHash $temporary -Algorithm SHA256).Hash.ToLower() -ne $metadata.sha256) {
    throw 'A verificacao falhou. Baixe as duas partes novamente; nenhum aplicativo foi extraido.'
  }
  Expand-Archive -LiteralPath $temporary -DestinationPath $PSScriptRoot
  if (!(Test-Path (Join-Path $destination 'NivoDock.exe'))) { throw 'O pacote nao contem o inicializador esperado.' }
  if ($Silent) {
    [ordered]@{ restored=$true; sha256=$metadata.sha256; destination=$destination } | ConvertTo-Json -Compress
  } else {
    Write-Host ''
    Write-Host 'NivoDock preparado com sucesso!'
    Write-Host ('Abra: ' + (Join-Path $destination 'NivoDock.exe'))
    Write-Host 'O instalador opcional Instalar-NivoDock.exe esta na mesma pasta.'
  }
} catch {
  Write-Error $_
  exit 1
} finally {
  if ($temporary -and (Test-Path $temporary)) { Remove-Item $temporary -Force }
}
