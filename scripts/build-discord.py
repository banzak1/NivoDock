"""Split an existing, verified release into ordinary ZIPs below the upload limit.

Python is used only on the development PC. Recipients use Windows PowerShell.
The original release ZIP, binaries and version are unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('--chunk-bytes', type=int, default=17_000_000)
args = parser.parse_args()
if not 1_000_000 <= args.chunk_bytes <= 19_900_000:
    parser.error('chunk size must be between 1,000,000 and 19,900,000 bytes')
source = args.archive.resolve()
with zipfile.ZipFile(source) as archive:
    assert archive.testzip() is None, 'Source ZIP is corrupt'
    assert any(name.replace('\\', '/').endswith('/NivoDock.exe') for name in archive.namelist())
data = source.read_bytes()
count = (len(data) + args.chunk_bytes - 1) // args.chunk_bytes
output = source.parent / (source.stem + '-discord')
output.mkdir(exist_ok=True)
parts = [dict(number=i + 1, file=f'{source.name}.{i+1:03}', zip=f'{source.stem}-parte-{i+1}-de-{count}.zip') for i in range(count)]
metadata = dict(archive=source.name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), parts=parts)
guide = f'''NivoDock — envio em {count} partes

1. Baixe TODOS os {count} ZIPs e coloque-os na mesma pasta.
2. Extraia a parte 1 usando o Windows (Extrair Tudo).
3. Abra Preparar-NivoDock.bat na pasta extraida.
4. Aguarde a verificacao e extracao. Abra a nova pasta {source.stem} e execute NivoDock.exe.

Voce tambem pode extrair todas as partes na mesma pasta antes de executar o preparador.
Nao e necessario instalar 7-Zip, Node ou Python. Nenhum download adicional e feito.
O preparador verifica o SHA256 do pacote original antes de extrair o aplicativo.
O instalador opcional Instalar-NivoDock.exe fica junto do NivoDock.exe.

Versao de teste para Windows x64. O painel avancado por jogo esta em desenvolvimento.
'''
batch = '@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Preparar-NivoDock.ps1"\r\npause\r\n'
restore = Path(__file__).with_name('restore-discord.ps1').read_text(encoding='utf-8')
result = []
for i, part in enumerate(parts):
    target = output / part['zip']
    if target.exists():
        raise FileExistsError(f'{target} already exists; choose a new output or preserve the previous artifacts first')
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
        archive.writestr(part['file'], data[i * args.chunk_bytes:(i + 1) * args.chunk_bytes])
        archive.writestr('LEIA-ME.txt', guide.encode('utf-8-sig'))
        if i == 0:
            archive.writestr('Preparar-NivoDock.bat', batch.encode('utf-8'))
            archive.writestr('Preparar-NivoDock.ps1', restore.encode('utf-8-sig'))
            archive.writestr('pacote.json', json.dumps(metadata, ensure_ascii=False, indent=2).encode('utf-8-sig'))
    assert target.stat().st_size < 20_000_000
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(target.suffix + '.sha256').write_text(f'{digest}  {target.name}\n', encoding='ascii')
    result.append(dict(file=str(target), bytes=target.stat().st_size, sha256=digest))
(output / 'LEIA-ME.txt').write_text(guide, encoding='utf-8-sig')
print(json.dumps(dict(original=metadata, uploads=result), ensure_ascii=False, indent=2))
